import { and, eq, gt } from 'drizzle-orm';
import { getDb } from '../../db/index.ts';
import * as S from '../../db/schema.ts';
import { ApiError, requireThat } from './errors.ts';
import { authenticate, allowedOrigin, body, checkRevision, etag, finalize, json } from './http.ts';
import { checkIngredients, decode, listRecipes, recipeById, revisionChanged, updateRecipe } from './store.ts';
import * as V from './validation.ts';
import type { Env } from './types.ts';

export interface KitchenEnv extends Env { DB: D1Database }

export async function handle(request: Request, env: KitchenEnv): Promise<Response> {
  const requestId = crypto.randomUUID();
  let origin: string | null = null;
  try {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '');
    const method = request.method;
    // Public liveness only; does not read the database or private configuration.
    if (path === '/api/health' && method === 'GET') return finalize(json({ status: 'ok' }), requestId, null);
    origin = allowedOrigin(request, env);
    if (method === 'OPTIONS') {
      requireThat(origin !== null, 'A preflight must have an allowed Origin.');
      return finalize(new Response(null, { status: 204, headers: {
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, If-Match',
        'Access-Control-Max-Age': '600',
      } }), requestId, origin);
    }
    await authenticate(request, env);
    if (!env.DB) throw new ApiError(503, 'DATABASE_NOT_CONFIGURED', 'Bind your D1 database as DB.');
    const db = getDb(env.DB);
    const respond = (data: unknown, status = 200, tag?: string) => finalize(json({ data }, status, tag ? { ETag: tag } : {}), requestId, origin);
    const jsonBody = async (allowed: string[]) => {
      const input = V.record(await body(request));
      V.keys(input, allowed, 'body');
      return input;
    };

    if (path === '/api/ingredients') {
      if (method === 'GET') {
        const limit = V.integer(Number(url.searchParams.get('limit') ?? 50), 'limit', 1, 100);
        const after = url.searchParams.get('after') ?? '';
        if (after) V.id(after);
        const rows = await db.select().from(S.ingredients).where(gt(S.ingredients.id, after)).orderBy(S.ingredients.id).limit(limit + 1);
        return respond({ items: rows.slice(0, limit).map((row) => ({ id: row.id, ingredient: JSON.parse(row.document) })), nextAfter: rows.length > limit ? rows[limit - 1].id : null });
      }
      if (method === 'POST') {
        const input = await jsonBody(['id', 'ingredient']);
        const id = V.id(input.id);
        const document = V.ingredient(input.ingredient);
        requireThat(!document.components.includes(id), 'An ingredient cannot contain itself.');
        // Immutable ingredients can reference only existing IDs, preventing cycles.
        await checkIngredients(db, document.components);
        const rows = await db.insert(S.ingredients).values({ id, document: JSON.stringify(document) }).onConflictDoNothing().returning();
        if (!rows.length) throw new ApiError(409, 'ALREADY_EXISTS', 'Ingredient ID already exists.');
        return respond({ id, ingredient: document }, 201);
      }
    }
    if (path === '/api/recipes') {
      if (method === 'GET') return respond(await listRecipes(db, url));
      if (method === 'POST') {
        const input = await jsonBody(['id', 'recipe']);
        const id = input.id === undefined ? crypto.randomUUID() : V.id(input.id);
        const recipe = V.recipe(input.recipe);
        await checkIngredients(db, V.references(recipe));
        const rows = await db.insert(S.recipes).values({ id, document: JSON.stringify(recipe) }).onConflictDoNothing().returning();
        if (!rows.length) throw new ApiError(409, 'ALREADY_EXISTS', 'Recipe ID already exists.');
        return respond(decode(rows[0]), 201, etag('recipe', id, 1));
      }
    }
    const recipeRoute = /^\/api\/recipes\/([^/]+)$/.exec(path);
    if (recipeRoute) {
      const id = V.id(recipeRoute[1]);
      const row = await recipeById(db, id);
      if (method === 'GET') return respond(decode(row), 200, etag('recipe', id, row.revision));
      if (method === 'PUT' || method === 'DELETE') {
        checkRevision(request, 'recipe', id, row.revision);
        const recipe = method === 'PUT' ? V.recipe(await body(request)) : { ...decode(row).recipe, status: 'archived' as const };
        const updated = await updateRecipe(db, id, row.revision, recipe);
        return respond(decode(updated), 200, etag('recipe', id, updated.revision));
      }
    }
    const historyRoute = /^\/api\/recipes\/([^/]+)\/history$/.exec(path);
    if (historyRoute && method === 'GET') {
      const id = V.id(historyRoute[1]);
      await recipeById(db, id);
      const after = V.integer(Number(url.searchParams.get('after') ?? 0), 'after', 0, 2147483647);
      const rows = await db.select().from(S.recipeHistory).where(and(eq(S.recipeHistory.recipeId, id), gt(S.recipeHistory.revision, after))).orderBy(S.recipeHistory.revision).limit(21);
      return respond({ items: rows.slice(0, 20).map(({ document, ...row }) => ({ ...row, recipe: JSON.parse(document) })), nextAfter: rows.length > 20 ? rows[19].revision : null });
    }
    if (path === '/api/preferences') {
      const [row] = await db.select().from(S.preferences).where(eq(S.preferences.id, 'default'));
      if (!row) throw new ApiError(503, 'DATABASE_NOT_READY', 'Apply D1 migrations before using the API.');
      if (method === 'GET') return respond({ preferences: JSON.parse(row.document), revision: row.revision }, 200, etag('preferences', 'default', row.revision));
      if (method === 'PUT') {
        checkRevision(request, 'preferences', 'default', row.revision);
        const preferences = V.preferences(await body(request));
        await checkIngredients(db, [...preferences.likedIngredientIds, ...preferences.excludedIngredientIds]);
        const rows = await db.update(S.preferences).set({ document: JSON.stringify(preferences), revision: row.revision + 1, updatedAt: new Date().toISOString() }).where(and(eq(S.preferences.id, 'default'), eq(S.preferences.revision, row.revision))).returning();
        revisionChanged(rows);
        return respond({ preferences, revision: row.revision + 1 }, 200, etag('preferences', 'default', row.revision + 1));
      }
    }
    const noteRoute = /^\/api\/recipes\/([^/]+)\/note$/.exec(path);
    if (noteRoute) {
      const id = V.id(noteRoute[1]);
      await recipeById(db, id);
      const [row] = await db.select().from(S.notes).where(eq(S.notes.recipeId, id));
      if (method === 'GET') return respond({ note: row ? JSON.parse(row.document) : { text: '', verdict: 'untried' }, revision: row?.revision ?? 0 }, 200, etag('note', id, row?.revision ?? 0));
      if (method === 'PUT') {
        checkRevision(request, 'note', id, row?.revision ?? 0);
        const note = V.note(await body(request));
        const rows = row
          ? await db.update(S.notes).set({ document: JSON.stringify(note), revision: row.revision + 1, updatedAt: new Date().toISOString() }).where(and(eq(S.notes.recipeId, id), eq(S.notes.revision, row.revision))).returning()
          : await db.insert(S.notes).values({ recipeId: id, document: JSON.stringify(note) }).onConflictDoNothing().returning();
        revisionChanged(rows);
        return respond({ note, revision: (row?.revision ?? 0) + 1 }, 200, etag('note', id, (row?.revision ?? 0) + 1));
      }
    }
    if (path === '/api/favourites' && method === 'GET') {
      const limit = V.integer(Number(url.searchParams.get('limit') ?? 20), 'limit', 1, 50);
      const after = url.searchParams.get('after') ?? '';
      if (after) V.id(after);
      const rows = await db.select().from(S.favourites).where(gt(S.favourites.recipeId, after)).orderBy(S.favourites.recipeId).limit(limit + 1);
      return respond({ items: rows.slice(0, limit).map(({ snapshot, ...row }) => ({ ...row, recipe: JSON.parse(snapshot) })), nextAfter: rows.length > limit ? rows[limit - 1].recipeId : null });
    }
    const favouriteRoute = /^\/api\/favourites\/([^/]+)$/.exec(path);
    if (favouriteRoute) {
      const id = V.id(favouriteRoute[1]);
      if (method === 'DELETE') {
        await db.delete(S.favourites).where(eq(S.favourites.recipeId, id));
        return finalize(new Response(null, { status: 204 }), requestId, origin);
      }
      if (method === 'PUT') {
        const input = await jsonBody(['recipeRevision', 'portions']);
        const revision = V.integer(input.recipeRevision, 'recipeRevision', 1, 2147483647);
        const portions = V.integer(input.portions, 'portions', 1, 20);
        // Preserve exactly the version that was viewed, even after a concurrent edit.
        const [snapshot] = await db.select().from(S.recipeHistory).where(and(eq(S.recipeHistory.recipeId, id), eq(S.recipeHistory.revision, revision)));
        if (!snapshot) throw new ApiError(404, 'NOT_FOUND', 'Recipe version not found.');
        const recipe = V.recipe(JSON.parse(snapshot.document));
        requireThat(recipe.status === 'active' && recipe.servings.some((serving) => serving.portions === portions), 'Choose an active version and a supported portion count.');
        const rows = await db.insert(S.favourites).values({ recipeId: id, recipeRevision: revision, portions, snapshot: snapshot.document }).onConflictDoNothing().returning();
        return respond({ id, alreadySaved: !rows.length, message: rows.length ? 'Saved this exact recipe version.' : 'Existing snapshot retained. Remove it before replacing.' }, rows.length ? 201 : 200);
      }
    }
    const known = recipeRoute || historyRoute || noteRoute || favouriteRoute || ['/api/recipes', '/api/ingredients', '/api/preferences', '/api/favourites'].includes(path);
    throw new ApiError(known ? 405 : 404, known ? 'METHOD_NOT_ALLOWED' : 'NOT_FOUND', known ? 'Method not supported.' : 'Endpoint not found.');
  } catch (error) {
    if (error instanceof ApiError) return finalize(json({ error: { code: error.code, message: error.message, details: error.details, requestId } }, error.status), requestId, origin);
    // Never log credentials, bodies, SQL or raw database errors.
    console.error(JSON.stringify({ event: 'kitchen_request_failed', requestId }));
    return finalize(json({ error: { code: 'INTERNAL_ERROR', message: 'Request failed. Check migrations and server logs.', requestId } }, 500), requestId, origin);
  }
}
