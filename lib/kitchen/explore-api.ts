import { and, eq, inArray, or, sql } from 'drizzle-orm';
import type { KitchenDb } from '../../db/index.ts';
import * as S from '../../db/schema.ts';
import { remixes } from '../../db/exploration-schema.ts';
import { ApiError, requireThat } from './errors.ts';
import { body, checkRevision, etag } from './http.ts';
import { decode, recipeById, revisionChanged } from './store.ts';
import { assessMeal, commonPortions, compareServings, discoverMeals, ingredientResolver, variationAxis, type DiscoveryRequest, type IngredientEntry, type MealSnapshot } from './exploration.ts';
import type { Preferences } from './types.ts';
import * as V from './validation.ts';

const CATALOGUE_LIMIT = 500;
const INGREDIENT_LIMIT = 2000;
type Result = { data: unknown; status?: number; tag?: string };

async function preferences(db: KitchenDb) {
  const [row] = await db.select().from(S.preferences).where(eq(S.preferences.id, 'default'));
  if (!row) throw new ApiError(503, 'DATABASE_NOT_READY', 'Apply the kitchen migrations first.');
  return { value: V.preferences(JSON.parse(row.document)), revision: row.revision };
}
async function ingredientEntries(db: KitchenDb) {
  const rows = await db.select().from(S.ingredients).orderBy(S.ingredients.id).limit(INGREDIENT_LIMIT + 1);
  if (rows.length > INGREDIENT_LIMIT) throw new ApiError(503, 'CATALOGUE_LIMIT', 'Discovery currently supports up to 2,000 ingredients. All recipes remains available.');
  // A malformed definition must not be mistaken for an ingredient without components.
  const entries: IngredientEntry[] = [];
  for (const row of rows) {
    try { entries.push({ id: row.id, ingredient: V.ingredient(JSON.parse(row.document)) }); }
    catch { /* Missing from graph: affected recipes fail closed during assessment. */ }
  }
  return entries;
}
async function activeRecipes(db: KitchenDb, mode: 'breakfast' | 'dinner') {
  const rows = await db.select().from(S.recipes).where(and(
    sql`json_extract(${S.recipes.document}, '$.status') = 'active'`,
    sql`json_extract(${S.recipes.document}, '$.mode') = ${mode}`,
  )).orderBy(S.recipes.id).limit(CATALOGUE_LIMIT + 1);
  if (rows.length > CATALOGUE_LIMIT) throw new ApiError(503, 'CATALOGUE_LIMIT', 'Discovery currently supports up to 500 active recipes per meal type. No partial recommendations were returned. Use All recipes.');
  const meals: MealSnapshot[] = [];
  let invalidCount = 0;
  for (const row of rows) {
    try { meals.push({ ...decode(row), recipe: V.recipe(JSON.parse(row.document)) }); }
    catch { invalidCount++; }
  }
  return { meals, invalidCount };
}
export function discoveryInput(value: unknown, defaults: Preferences, fallbackMode: 'breakfast' | 'dinner' = 'dinner'): DiscoveryRequest {
  const input = V.record(value);
  V.keys(input, ['mode', 'portions', 'maxMinutes', 'requiredIngredient', 'seen', 'seed'], 'discovery');
  const mode = input.mode ?? fallbackMode;
  requireThat(mode === 'breakfast' || mode === 'dinner', 'mode must be breakfast or dinner.');
  return {
    mode,
    portions: V.integer(input.portions ?? (mode === 'breakfast' ? defaults.defaultBreakfastPortions : defaults.defaultDinnerPortions), 'portions', 1, 20),
    maxMinutes: input.maxMinutes === null ? null : input.maxMinutes === undefined ? defaults.maxMinutes : V.integer(input.maxMinutes, 'maxMinutes', 1, 2880),
    requiredIngredient: input.requiredIngredient == null ? null : V.id(input.requiredIngredient, 'requiredIngredient'),
    seen: V.ids(input.seen ?? [], 'seen', 60),
    seed: input.seed === undefined ? crypto.randomUUID() : V.id(input.seed, 'seed'),
  };
}
function checkFilterIds(input: DiscoveryRequest, prefs: Preferences, entries: IngredientEntry[]) {
  const ids = new Set(entries.map((entry) => entry.id));
  const referenced = [...prefs.excludedIngredientIds, ...prefs.likedIngredientIds, ...(input.requiredIngredient ? [input.requiredIngredient] : [])];
  if (referenced.some((id) => !ids.has(id))) throw new ApiError(422, 'UNKNOWN_INGREDIENT', 'A requested or saved preference ingredient has no complete catalogue definition. Review your ingredient catalogue and preferences.');
}
async function currentTargets(db: KitchenDb, links: (typeof remixes.$inferSelect)[], sourceId: string) {
  const ids = links.map((link) => link.sourceId === sourceId ? link.targetId : link.sourceId);
  if (!ids.length) return new Map<string, MealSnapshot>();
  const rows = await db.select().from(S.recipes).where(inArray(S.recipes.id, ids));
  return new Map(rows.map((row) => [row.id, decode(row)]));
}
async function reviewedPairs(db: KitchenDb, recipeId: string) {
  const rows = await db.select().from(remixes).where(or(eq(remixes.sourceId, recipeId), eq(remixes.targetId, recipeId))).orderBy(remixes.id).limit(101);
  if (rows.length > 100) throw new ApiError(503, 'REMIX_LIMIT', 'This view supports up to 100 connections per recipe. No partial results were returned.');
  return rows;
}
function conflict(error: unknown): never {
  let cause: unknown = error;
  for (let depth = 0; depth < 5 && cause instanceof Error; depth++) {
    if (cause.message.includes('REMIX_REVIEW_CONFLICT')) throw new ApiError(412, 'REVISION_CONFLICT', 'One of these recipes changed during review. Reload the comparison before confirming.');
    if (cause.message.includes('UNIQUE constraint')) throw new ApiError(409, 'ALREADY_EXISTS', 'A connection for these recipes already exists. Review that connection instead.');
    cause = cause.cause;
  }
  throw error;
}

/** Called by the existing API only after bearer/session authentication. */
export async function exploreRoute(request: Request, db: KitchenDb): Promise<Result | null> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, '');
  if (path === '/api/discover') {
    if (request.method !== 'POST') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Use POST for discovery.');
    requireThat(url.search === '', 'Use the JSON discovery body, not query parameters.');
    const prefs = await preferences(db);
    const input = discoveryInput(await body(request), prefs.value);
    const entries = await ingredientEntries(db);
    checkFilterIds(input, prefs.value, entries);
    const { meals, invalidCount } = await activeRecipes(db, input.mode);
    return { data: { ...discoverMeals(meals, entries, prefs.value, input), invalidCount, preferenceRevision: prefs.revision, excludedIngredientIds: prefs.value.excludedIngredientIds } };
  }

  const optionsRoute = /^\/api\/recipes\/([^/]+)\/remix-options$/.exec(path);
  if (optionsRoute) {
    if (request.method !== 'POST') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Use POST for remix suggestions.');
    requireThat(url.search === '', 'Use the JSON request body, not query parameters.');
    const source = decode(await recipeById(db, V.id(optionsRoute[1])));
    const prefs = await preferences(db);
    const envelope = V.record(await body(request));
    const { sourceRevision, ...filters } = envelope;
    if (V.integer(sourceRevision, 'sourceRevision', 1, 2147483646) !== source.revision) throw new ApiError(412, 'REVISION_CONFLICT', 'The starting recipe changed. Reload it before exploring variations.');
    const input = discoveryInput(filters, prefs.value, source.recipe.mode);
    requireThat(input.mode === source.recipe.mode, 'The meal type must match the starting recipe.');
    const entries = await ingredientEntries(db);
    checkFilterIds(input, prefs.value, entries);
    const resolve = ingredientResolver(entries);
    const sourceAssessment = assessMeal(source.recipe, input, prefs.value, resolve);
    if ('reason' in sourceAssessment) return { data: { source, items: [], constraints: input, blockedSource: sourceAssessment.reason, staleCount: 0, filteredCount: 0, excludedIngredientIds: prefs.value.excludedIngredientIds } };
    const links = await reviewedPairs(db, source.id);
    const targets = await currentTargets(db, links, source.id);
    const items = [];
    let staleCount = 0;
    let filteredCount = 0;
    for (const link of links) {
      const otherId = link.sourceId === source.id ? link.targetId : link.sourceId;
      const target = targets.get(otherId);
      if (!target) { staleCount++; continue; }
      const sourcePin = link.sourceId === source.id ? link.sourceRevision : link.targetRevision;
      const targetPin = link.sourceId === source.id ? link.targetRevision : link.sourceRevision;
      if (source.revision !== sourcePin || target.revision !== targetPin || variationAxis(source.recipe, target.recipe) !== link.axis) { staleCount++; continue; }
      const assessed = assessMeal(target.recipe, input, prefs.value, resolve);
      if ('reason' in assessed) { filteredCount++; continue; }
      items.push({ connectionId: link.id, axis: link.axis, target, differences: compareServings(sourceAssessment.serving, assessed.serving) });
    }
    return { data: { source, items, constraints: input, blockedSource: null, staleCount, filteredCount, excludedIngredientIds: prefs.value.excludedIngredientIds } };
  }

  const manageRoute = /^\/api\/recipes\/([^/]+)\/variations$/.exec(path);
  if (manageRoute) {
    if (request.method !== 'GET') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Use GET to review variations.');
    requireThat(url.search === '', 'This endpoint does not accept query parameters.');
    const source = decode(await recipeById(db, V.id(manageRoute[1])));
    const links = await reviewedPairs(db, source.id);
    const targets = await currentTargets(db, links, source.id);
    const connections = [];
    for (const link of links) {
      const target = targets.get(link.sourceId === source.id ? link.targetId : link.sourceId);
      if (!target) throw new ApiError(422, 'MISSING_RECIPE', 'A connection references a missing recipe. Review the database.');
      const sourcePin = link.sourceId === source.id ? link.sourceRevision : link.targetRevision;
      const targetPin = link.sourceId === source.id ? link.targetRevision : link.sourceRevision;
      const axis = variationAxis(source.recipe, target.recipe);
      connections.push({ ...link, tag: etag('remix', link.id, link.revision), target,
        stale: source.revision !== sourcePin || target.revision !== targetPin || axis !== link.axis,
        currentAxis: axis, portions: commonPortions(source.recipe, target.recipe) });
    }
    const { meals, invalidCount } = await activeRecipes(db, source.recipe.mode);
    const connected = new Set(connections.map((connection) => connection.target.id));
    const candidates = meals.filter((target) => target.id !== source.id && !connected.has(target.id)).flatMap((target) => {
      const axis = variationAxis(source.recipe, target.recipe);
      const portions = commonPortions(source.recipe, target.recipe);
      return axis && portions.length ? [{ target, axis, portions }] : [];
    });
    return { data: { source, connections, candidates, invalidCount } };
  }

  const linkRoute = /^\/api\/remixes\/([^/]+)$/.exec(path);
  if (path === '/api/remixes' || linkRoute) {
    requireThat(url.search === '', 'This endpoint does not accept query parameters.');
    let existing: typeof remixes.$inferSelect | undefined;
    if (linkRoute) {
      const [row] = await db.select().from(remixes).where(eq(remixes.id, V.id(linkRoute[1]))).limit(1);
      if (!row) throw new ApiError(404, 'NOT_FOUND', 'Remix connection not found.');
      existing = row;
      if (!['PUT', 'DELETE'].includes(request.method)) throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Use PUT to reconfirm or DELETE to remove.');
      checkRevision(request, 'remix', row.id, row.revision);
      if (request.method === 'DELETE') {
        const removed = await db.delete(remixes).where(and(eq(remixes.id, row.id), eq(remixes.revision, row.revision))).returning();
        revisionChanged(removed);
        return { data: { removed: true } };
      }
    } else if (request.method !== 'POST') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Use POST to create a reviewed connection.');
    const input = V.record(await body(request));
    V.keys(input, ['sourceId', 'sourceRevision', 'targetId', 'targetRevision', 'axis'], 'remix');
    const sourceId = V.id(input.sourceId);
    const targetId = V.id(input.targetId);
    requireThat(sourceId !== targetId, 'Choose two different recipes.');
    const source = decode(await recipeById(db, sourceId));
    const target = decode(await recipeById(db, targetId));
    const sourceRevision = V.integer(input.sourceRevision, 'sourceRevision', 1, 2147483646);
    const targetRevision = V.integer(input.targetRevision, 'targetRevision', 1, 2147483646);
    if (source.revision !== sourceRevision || target.revision !== targetRevision) throw new ApiError(412, 'REVISION_CONFLICT', 'Reload and review the current recipe versions.');
    const axis = variationAxis(source.recipe, target.recipe);
    requireThat(axis !== null && axis === input.axis, 'A connection must change exactly one visible axis and preserve the meal type.');
    requireThat(commonPortions(source.recipe, target.recipe).length > 0, 'The recipes need at least one shared authored portion size.');
    const [left, right] = source.id < target.id ? [source, target] : [target, source];
    if (existing) requireThat(existing.sourceId === left.id && existing.targetId === right.id, 'Reconfirmation cannot change which recipes are connected.');
    const values = { sourceId: left.id, targetId: right.id, sourceRevision: left.revision, targetRevision: right.revision, axis };
    try {
      const rows = existing ? await db.update(remixes).set({ ...values, revision: existing.revision + 1, updatedAt: new Date().toISOString() })
        .where(and(eq(remixes.id, existing.id), eq(remixes.revision, existing.revision))).returning()
        : await db.insert(remixes).values({ id: crypto.randomUUID(), ...values }).returning();
      revisionChanged(rows);
      return { data: rows[0], status: existing ? 200 : 201, tag: etag('remix', rows[0].id, rows[0].revision) };
    } catch (error) { conflict(error); }
  }
  return null;
}
