import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import type { Ingredient, RecipeDocument } from '../lib/kitchen/types.ts';
import * as V from '../lib/kitchen/validation.ts';

// Add-only. Validate everything before writing, and never overwrite a differing ID.
const args: string[] = process.argv.slice(2);
const apply = args.includes('--apply');
const path = args.find((arg) => !arg.startsWith('--')) ?? 'examples/catalogue.json';
const input = V.record(path.endsWith('.json') ? JSON.parse(await readFile(path, 'utf8')) : {
  ingredients: JSON.parse(await readFile(join(path, 'ingredients.json'), 'utf8')),
  recipes: JSON.parse(await readFile(join(path, 'recipes.json'), 'utf8')),
});
if (!Array.isArray(input.ingredients) || !Array.isArray(input.recipes)) {
  throw new Error('Expected ingredients and recipes arrays.');
}
const ingredients: { id: string; ingredient: Ingredient }[] = input.ingredients.map((value: unknown) => {
  const entry = V.record(value);
  return { id: V.id(entry.id), ingredient: V.ingredient(entry.ingredient) };
});
const recipes: { id: string; recipe: RecipeDocument }[] = input.recipes.map((value: unknown) => {
  const entry = V.record(value);
  return { id: V.id(entry.id), recipe: V.recipe(entry.recipe) };
});
if (new Set(ingredients.map((i) => i.id)).size !== ingredients.length || new Set(recipes.map((r) => r.id)).size !== recipes.length) {
  throw new Error('Duplicate catalogue IDs.');
}
const remaining = [...ingredients];
const sorted: typeof ingredients = [];
const seen = new Set<string>();
while (remaining.length) {
  const index = remaining.findIndex((entry) => entry.ingredient.components.every((id) => seen.has(id)));
  if (index < 0) throw new Error('Missing component IDs or a cycle in the ingredient graph.');
  const [entry] = remaining.splice(index, 1);
  if (!entry) throw new Error('Unable to order ingredient dependencies.');
  sorted.push(entry);
  seen.add(entry.id);
}
for (const recipe of recipes) {
  for (const id of V.references(recipe.recipe)) {
    if (!seen.has(id)) throw new Error(`Recipe ${recipe.id} references missing ingredient ${id}.`);
  }
}
console.log(`Validated ${ingredients.length} ingredients and ${recipes.length} draft recipes. No remixes or prep sessions are imported in this slice.`);
if (!apply) {
  console.log('Validation only. Add --apply with KITCHEN_URL and API_TOKEN to import.');
  process.exit(0);
}
const base = new URL(process.env.KITCHEN_URL ?? 'http://localhost:3000');
const localHttp = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname) && base.protocol === 'http:';
if (base.username || base.password || base.search || base.hash || base.pathname !== '/' || (base.protocol !== 'https:' && !localHttp)) {
  throw new Error('Use an HTTPS origin, or localhost over HTTP.');
}
const token = process.env.API_TOKEN;
if (!token || token.length < 32) throw new Error('Set API_TOKEN in the terminal environment.');
async function request(endpoint: string, method = 'GET', value?: unknown) {
  const response = await fetch(new URL(endpoint, base), {
    method,
    redirect: 'error',
    headers: { Authorization: `Bearer ${token}`, ...(value ? { 'Content-Type': 'application/json' } : {}) },
    ...(value ? { body: JSON.stringify(value) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  return { status: response.status, json: await response.json() as unknown };
}
async function existingRecords(endpoint: 'ingredients' | 'recipes', field: 'ingredient' | 'recipe') {
  const records = new Map<string, unknown>();
  const visited = new Set<string>();
  let after = '';
  for (;;) {
    if (visited.has(after)) throw new Error('The API returned a repeated pagination cursor.');
    visited.add(after);
    const params = new URLSearchParams({ limit: '50', after });
    if (endpoint === 'recipes') params.set('status', 'all');
    const result = await request(`/api/${endpoint}?${params}`);
    if (result.status !== 200) throw new Error(`API rejected import preflight (${result.status}).`);
    const envelope = V.record(result.json, 'API response');
    const page = V.record(envelope.data, 'API data');
    if (!Array.isArray(page.items)) throw new Error('The API did not return a record list.');
    for (const value of page.items) {
      const row = V.record(value, 'API item');
      records.set(V.id(row.id), row[field]);
    }
    if (page.nextAfter === null) break;
    after = V.id(page.nextAfter, 'pagination cursor');
  }
  return records;
}
const existingIngredients = await existingRecords('ingredients', 'ingredient');
const existingRecipes = await existingRecords('recipes', 'recipe');
for (const item of sorted) {
  if (existingIngredients.has(item.id) && JSON.stringify(V.ingredient(existingIngredients.get(item.id))) !== JSON.stringify(item.ingredient)) {
    throw new Error(`Ingredient ${item.id} differs. Resolve it before import.`);
  }
}
for (const item of recipes) {
  if (existingRecipes.has(item.id) && JSON.stringify(V.recipe(existingRecipes.get(item.id))) !== JSON.stringify(item.recipe)) {
    throw new Error(`Recipe ${item.id} differs. Import never overwrites edits.`);
  }
}
for (const [endpoint, entries, existing] of [['ingredients', sorted, existingIngredients], ['recipes', recipes, existingRecipes]] as const) {
  for (const entry of entries) {
    if (existing.has(entry.id)) { console.log(`Unchanged ${endpoint}/${entry.id}`); continue; }
    const result = await request(`/api/${endpoint}`, 'POST', entry);
    if (result.status !== 201) throw new Error(`Stopped at ${endpoint}/${entry.id}: HTTP ${result.status}. Earlier additions remain; review and rerun safely.`);
    console.log(`Added ${endpoint}/${entry.id}`);
  }
}
