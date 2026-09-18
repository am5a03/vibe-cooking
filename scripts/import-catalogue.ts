import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Ingredient, RecipeDocument } from '../lib/kitchen/types.ts';
import * as V from '../lib/kitchen/validation.ts';

// Accepts either examples/catalogue.json or the earlier foundation's backend/seed directory.
// Add-only; a matching ID is checked, never overwritten. No network call without --apply.
const args = process.argv.slice(2), apply = args.includes('--apply');
const path = args.find(a => !a.startsWith('--')) ?? 'examples/catalogue.json';
const input = path.endsWith('.json') ? JSON.parse(await readFile(path, 'utf8')) : {
  ingredients: JSON.parse(await readFile(join(path, 'ingredients.json'), 'utf8')),
  recipes: JSON.parse(await readFile(join(path, 'recipes.json'), 'utf8')),
};
if (!Array.isArray(input.ingredients) || !Array.isArray(input.recipes)) throw new Error('Expected ingredients and recipes arrays.');
const ingredients: {id:string; ingredient:Ingredient}[] = input.ingredients.map((entry: {id: unknown; ingredient: unknown}) => ({ id: V.id(entry.id), ingredient: V.ingredient(entry.ingredient) }));
const recipes: {id:string; recipe:RecipeDocument}[] = input.recipes.map((entry: {id: unknown; recipe: unknown}) => ({ id: V.id(entry.id), recipe: V.recipe(entry.recipe) }));
if (new Set(ingredients.map((i: {id:string})=>i.id)).size !== ingredients.length || new Set(recipes.map((r:{id:string})=>r.id)).size !== recipes.length) throw new Error('Duplicate catalogue IDs.');
const remaining = [...ingredients], sorted: typeof ingredients = [], seen = new Set<string>();
while (remaining.length) {
  const i = remaining.findIndex(entry => entry.ingredient.components.every(id => seen.has(id)));
  if (i < 0) throw new Error('Missing component IDs or a cycle in the ingredient graph.');
  const [entry] = remaining.splice(i, 1); sorted.push(entry!); seen.add(entry!.id);
}
for (const r of recipes) for (const id of V.references(r.recipe)) if (!seen.has(id)) throw new Error(`Recipe ${r.id} references missing ingredient ${id}.`);
console.log(`Validated ${ingredients.length} ingredients and ${recipes.length} draft recipes. No remixes or prep sessions are imported in this slice.`);
if (!apply) { console.log('Validation only. Add --apply with KITCHEN_URL and API_TOKEN to import.'); process.exit(0); }
const base = new URL(process.env.KITCHEN_URL ?? 'http://localhost:3000');
if (base.username || base.password || base.search || base.hash || base.pathname !== '/' || (base.protocol !== 'https:' && !(['localhost','127.0.0.1','[::1]'].includes(base.hostname) && base.protocol === 'http:'))) throw new Error('Use an HTTPS origin, or localhost over HTTP.');
const token = process.env.API_TOKEN;
if (!token || token.length < 32) throw new Error('Set API_TOKEN in the terminal environment.');
async function request(path: string, method = 'GET', value?: unknown) {
  const response = await fetch(new URL(path, base), { method, redirect: 'error', headers: { Authorization: `Bearer ${token}`, ...(value ? {'Content-Type':'application/json'} : {}) }, ...(value ? {body:JSON.stringify(value)} : {}), signal: AbortSignal.timeout(20000) });
  return { status: response.status, json: await response.json() };
}
// Preflight existing IDs before making additions. Concurrent conflicts are still reported.
const existingIngredients = new Map<string, unknown>(); let after: string | null = '';
do { const r = await request(`/api/ingredients?limit=100&after=${encodeURIComponent(after)}`); if (r.status !== 200) throw new Error(`API rejected import preflight (${r.status}).`); for (const row of r.json.data.items) existingIngredients.set(row.id, row.ingredient); after = r.json.data.nextAfter; } while (after);
const existingRecipes = new Map<string, unknown>(); after = '';
do { const r = await request(`/api/recipes?limit=50&status=all&after=${encodeURIComponent(after)}`); if (r.status !== 200) throw new Error(`API rejected import preflight (${r.status}).`); for (const row of r.json.data.items) existingRecipes.set(row.id, row.recipe); after = r.json.data.nextAfter; } while (after);
for (const i of sorted) if (existingIngredients.has(i.id) && JSON.stringify(V.ingredient(existingIngredients.get(i.id))) !== JSON.stringify(i.ingredient)) throw new Error(`Ingredient ${i.id} differs. Resolve it before import.`);
for (const r of recipes) if (existingRecipes.has(r.id) && JSON.stringify(V.recipe(existingRecipes.get(r.id))) !== JSON.stringify(r.recipe)) throw new Error(`Recipe ${r.id} differs. Import never overwrites edits.`);
for (const [endpoint, entries, existing] of [['ingredients', sorted, existingIngredients], ['recipes', recipes, existingRecipes]] as const) {
  for (const entry of entries) {
    if (existing.has(entry.id)) { console.log(`Unchanged ${endpoint}/${entry.id}`); continue; }
    const result = await request(`/api/${endpoint}`, 'POST', entry);
    if (result.status !== 201) throw new Error(`Stopped at ${endpoint}/${entry.id}: HTTP ${result.status}. Earlier additions remain; review and rerun safely.`);
    console.log(`Added ${endpoint}/${entry.id}`);
  }
}
