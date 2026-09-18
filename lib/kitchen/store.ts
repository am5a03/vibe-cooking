import { and, eq, gt, inArray, sql } from 'drizzle-orm';
import type { KitchenDb } from '../../db/index.ts';
import * as S from '../../db/schema.ts';
import { ApiError } from './errors.ts';
import type { RecipeDocument } from './types.ts';

export function decode(row: typeof S.recipes.$inferSelect) {
  const { document, ...metadata } = row;
  return { ...metadata, recipe: JSON.parse(document) as RecipeDocument };
}
export async function recipeById(db: KitchenDb, id: string) {
  const [row] = await db.select().from(S.recipes).where(eq(S.recipes.id, id)).limit(1);
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Recipe not found.');
  return row;
}
export async function checkIngredients(db: KitchenDb, ids: string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) return;
  const rows = await db.select({ id: S.ingredients.id }).from(S.ingredients).where(inArray(S.ingredients.id, unique));
  const existing = new Set(rows.map(r => r.id));
  const missing = unique.filter(id => !existing.has(id));
  if (missing.length) throw new ApiError(422, 'UNKNOWN_INGREDIENT', 'Create the referenced ingredients first.', { missing });
}
export function revisionChanged(rows: unknown[]) {
  if (!rows.length) throw new ApiError(412, 'REVISION_CONFLICT', 'The record changed. Fetch it again and reconcile your edit.');
}
export async function updateRecipe(db: KitchenDb, id: string, revision: number, recipe: RecipeDocument) {
  await checkIngredients(db, recipe.servings.flatMap(s => s.ingredients.map(i => i.ingredientId)));
  const rows = await db.update(S.recipes).set({
    document: JSON.stringify(recipe), revision: revision + 1, updatedAt: new Date().toISOString(),
  }).where(and(eq(S.recipes.id, id), eq(S.recipes.revision, revision))).returning();
  revisionChanged(rows);
  return rows[0]!;
}
export async function listRecipes(db: KitchenDb, url: URL) {
  const p = url.searchParams;
  const allowed = ['limit', 'after', 'mode', 'main', 'status', 'q'];
  for (const key of p.keys()) {
    if (!allowed.includes(key) || p.getAll(key).length !== 1) throw new ApiError(400, 'INVALID_QUERY', `Unknown or repeated parameter: ${key}.`);
  }
  const raw = p.get('limit') ?? '20';
  if (!/^[0-9]+$/.test(raw) || +raw < 1 || +raw > 50) throw new ApiError(400, 'INVALID_QUERY', 'limit must be 1–50.');
  const limit = +raw, after = p.get('after') ?? '';
  if (after && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(after)) throw new ApiError(400, 'INVALID_QUERY', 'Invalid cursor.');
  const filters = [gt(S.recipes.id, after)];
  const mode = p.get('mode'), main = p.get('main'), status = p.get('status') ?? 'active';
  if (mode !== null && !['breakfast', 'dinner'].includes(mode)) throw new ApiError(400, 'INVALID_QUERY', 'Invalid meal mode.');
  if (!['active', 'archived', 'all'].includes(status)) throw new ApiError(400, 'INVALID_QUERY', 'Invalid status.');
  if (mode) filters.push(sql`json_extract(${S.recipes.document}, '$.mode') = ${mode}`);
  if (main !== null) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(main)) throw new ApiError(400, 'INVALID_QUERY', 'Invalid main ingredient.');
    filters.push(sql`json_extract(${S.recipes.document}, '$.main') = ${main}`);
  }
  if (status !== 'all') filters.push(sql`json_extract(${S.recipes.document}, '$.status') = ${status}`);
  const q = p.get('q');
  if (q !== null) {
    if (q.length > 120) throw new ApiError(400, 'INVALID_QUERY', 'Search is limited to 120 characters.');
    // instr treats %, _ and quotes literally, not as wildcard or SQL syntax.
    filters.push(sql`instr(lower(json_extract(${S.recipes.document}, '$.title')), lower(${q})) > 0`);
  }
  const rows = await db.select().from(S.recipes).where(and(...filters)).orderBy(S.recipes.id).limit(limit + 1);
  return { items: rows.slice(0, limit).map(decode), nextAfter: rows.length > limit ? rows[limit - 1]!.id : null };
}
