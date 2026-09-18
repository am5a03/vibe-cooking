import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TestD1 } from './d1-adapter.mjs';
import { handle } from '../lib/kitchen/api.ts';
import { ingredientResolver, assessMeal, discoverMeals, variationAxis, compareServings } from '../lib/kitchen/exploration.ts';
import { discoveryInput } from '../lib/kitchen/explore-api.ts';
const fixture = JSON.parse(readFileSync(new URL('../examples/catalogue.json', import.meta.url), 'utf8'));
const defaults = { likedIngredientIds: [], excludedIngredientIds: [], defaultDinnerPortions: 3, defaultBreakfastPortions: 1, maxMinutes: null };
const constraints = { mode: 'dinner', portions: 3, maxMinutes: null, requiredIngredient: null };
const request = { ...constraints, seen: [], seed: 'test-seed' };
const snapshots = fixture.recipes.map((row) => ({ ...row, revision: 1, createdAt: '', updatedAt: '' }));
const first = snapshots[0];
const second = snapshots[1];
function setup(t) {
  const DB = new TestD1();
  t.after(() => DB.close());
  for (const row of fixture.ingredients) DB.sqlite.prepare('INSERT INTO kitchen_ingredients(id,document) VALUES(?,?)').run(row.id, JSON.stringify(row.ingredient));
  for (const row of fixture.recipes) DB.sqlite.prepare('INSERT INTO kitchen_recipes(id,document) VALUES(?,?)').run(row.id, JSON.stringify(row.recipe));
  const call = async (path, method = 'GET', value = undefined, tag = undefined) => {
    const response = await handle(new Request(`https://kitchen.example/api/${path}`, { method,
      headers: { Authorization: `Bearer ${'a'.repeat(64)}`, ...(value === undefined ? {} : { 'Content-Type': 'application/json' }), ...(tag ? { 'If-Match': tag } : {}) },
      ...(value === undefined ? {} : { body: JSON.stringify(value) }),
    }), { DB, API_TOKEN: 'a'.repeat(64) });
    return { status: response.status, tag: response.headers.get('etag'), body: await response.json() };
  };
  return { DB, call };
}
const linkInput = { sourceId: 'D01', sourceRevision: 1, targetId: 'D03', targetRevision: 1, axis: 'flavor' };
test('recorded sauce components are excluded before likes can rank meals', () => {
  const result = discoverMeals(snapshots, fixture.ingredients, { ...defaults, likedIngredientIds: ['tofu'], excludedIngredientIds: ['sesame'] }, request);
  assert.deepEqual(result.items.map((item) => item.snapshot.id), ['D03']);
  assert.deepEqual(discoverMeals(snapshots, fixture.ingredients, { ...defaults, excludedIngredientIds: ['soy'] }, request).items, []);
});
test('recursive composition handles deep components, shared branches and cycles', () => {
  const entry = (id, components) => ({ id, ingredient: { name: id, aliases: [], components } });
  const resolve = ingredientResolver([entry('a', ['b','c']), entry('b', ['d']), entry('c', ['d']), entry('d', [])]);
  assert.equal(resolve('a').complete, true);
  assert.deepEqual([...resolve('a').ids].sort(), ['a','b','c','d']);
  assert.equal(ingredientResolver([entry('a', ['b']), entry('b', ['a'])])('a').complete, false);
  assert.equal(ingredientResolver([entry('a', ['missing'])])('a').complete, false);
});
test('missing definitions fail closed even without saved exclusions', () => {
  const entries = fixture.ingredients.filter((entry) => entry.id !== 'soy');
  assert.equal(discoverMeals(snapshots, entries, defaults, request).eligibleCount, 0);
});
test('required ingredient must be a direct main/base/vegetable/fruit, not a sauce trace', () => {
  assert.equal(discoverMeals(snapshots, fixture.ingredients, defaults, { ...request, requiredIngredient: 'ginger' }).eligibleCount, 0);
  assert.equal(discoverMeals(snapshots, fixture.ingredients, defaults, { ...request, requiredIngredient: 'bok-choy' }).eligibleCount, 1);
  assert.equal(discoverMeals(snapshots, fixture.ingredients, defaults, { ...request, requiredIngredient: 'soy' }).eligibleCount, 0);
});
test('total time belongs to the selected authored profile, never a linear estimate', () => {
  const meal = structuredClone(first);
  meal.recipe.servings.push({ ...structuredClone(meal.recipe.servings[0]), portions: 4, totalMinutes: 65 });
  assert.equal(discoverMeals([meal], fixture.ingredients, defaults, { ...request, portions: 4, maxMinutes: 40 }).eligibleCount, 0);
  assert.equal(discoverMeals([meal], fixture.ingredients, defaults, { ...request, portions: 3, maxMinutes: 40 }).eligibleCount, 1);
  assert.equal(discoverMeals([meal], fixture.ingredients, defaults, { ...request, portions: 2 }).eligibleCount, 0);
});
test('seed and request are deterministic; unseen meals rank before repeat meals', () => {
  const meals = Array.from({ length: 8 }, (_, index) => ({ ...first, id: `meal-${index}` }));
  const a = discoverMeals(meals, fixture.ingredients, defaults, request);
  assert.deepEqual(a, discoverMeals(meals, fixture.ingredients, defaults, request));
  const recent = a.items.map((item) => item.snapshot.id);
  const b = discoverMeals(meals, fixture.ingredients, defaults, { ...request, seen: recent });
  assert.ok(b.items.every((item) => !recent.includes(item.snapshot.id)));
  assert.equal(discoverMeals([first], fixture.ingredients, defaults, { ...request, seen: [first.id] }).repeatedCount, 1);
});
test('empty pools, breakfast separation and archived meals do not leak into discovery', () => {
  assert.equal(discoverMeals([], fixture.ingredients, defaults, request).eligibleCount, 0);
  assert.equal(discoverMeals(snapshots, fixture.ingredients, defaults, { ...request, mode: 'breakfast' }).eligibleCount, 0);
  assert.equal(assessMeal({ ...first.recipe, status: 'archived' }, constraints, defaults, ingredientResolver(fixture.ingredients)).reason, 'archived');
});
test('a variation changes exactly one axis and shares meal mode', () => {
  assert.equal(variationAxis(first.recipe, second.recipe), 'flavor');
  assert.equal(variationAxis(first.recipe, { ...second.recipe, main: 'eggs' }), null);
  assert.equal(variationAxis(first.recipe, { ...second.recipe, mode: 'breakfast' }), null);
  assert.equal(variationAxis(first.recipe, first.recipe), null);
});
test('ingredient comparison discloses quantities, states, units and supporting changes', () => {
  const before = first.recipe.servings[0];
  const after = structuredClone(before);
  after.ingredients[0].preparation = 'crumbled';
  after.ingredients[1].unit = 'cups';
  after.ingredients.pop();
  const diff = compareServings(before, after);
  assert.equal(diff.find((item) => item.ingredientId === 'tofu').kind, 'changed');
  assert.equal(diff.find((item) => item.ingredientId === 'rice').kind, 'changed');
  assert.equal(diff.find((item) => item.ingredientId === 'spring-onion').kind, 'removed');
  assert.equal(diff.find((item) => item.ingredientId === 'ginger').kind, 'kept');
});
test('discovery validation rejects invalid fields and uses mode-specific preferences', () => {
  assert.equal(discoveryInput({ mode: 'breakfast' }, defaults).portions, 1);
  assert.equal(discoveryInput({}, { ...defaults, maxMinutes: 20 }).maxMinutes, 20);
  assert.equal(discoveryInput({ maxMinutes: null }, { ...defaults, maxMinutes: 20 }).maxMinutes, null);
  for (const invalid of [{ surprise: true }, { portions: 0 }, { maxMinutes: -1 }, { seen: Array(61).fill('D01') }, { mode: 'lunch' }]) assert.throws(() => discoveryInput(invalid, defaults));
});
test('discovery is authenticated and preferences are effective while the library stays accessible', async (t) => {
  const { call, DB } = setup(t);
  const unauth = await handle(new Request('https://kitchen.example/api/discover', { method: 'POST' }), { DB, API_TOKEN: 'a'.repeat(64) });
  assert.equal(unauth.status, 401);
  const prefs = await call('preferences');
  await call('preferences', 'PUT', { ...defaults, excludedIngredientIds: ['sesame'] }, prefs.tag);
  const ideas = await call('discover', 'POST', request);
  assert.equal(ideas.status, 200);
  assert.deepEqual(ideas.body.data.items.map((item) => item.snapshot.id), ['D03']);
  assert.equal((await call('recipes')).body.data.items.length, 2);
  assert.equal((await call('discover', 'POST', { ...request, requiredIngredient: 'unknown' })).status, 422);
});
test('unreviewed candidates are never live remix suggestions', async (t) => {
  const { call } = setup(t);
  const review = await call('recipes/D01/variations');
  assert.equal(review.body.data.candidates[0].target.id, 'D03');
  const options = await call('recipes/D01/remix-options', 'POST', { ...constraints, sourceRevision: 1 });
  assert.equal(options.status, 200); assert.equal(options.body.data.items.length, 0);
});
test('connections are bidirectional, version-pinned and duplicates do not replace them', async (t) => {
  const { call } = setup(t);
  const added = await call('remixes', 'POST', linkInput);
  assert.equal(added.status, 201, JSON.stringify(added.body));
  const reverse = await call('remixes', 'POST', { ...linkInput, sourceId: 'D03', targetId: 'D01' });
  assert.equal(reverse.status, 409);
  assert.equal((await call('recipes/D01/remix-options', 'POST', { ...constraints, sourceRevision: 1 })).body.data.items[0].target.id, 'D03');
  assert.equal((await call('recipes/D03/remix-options', 'POST', { ...constraints, sourceRevision: 1 })).body.data.items[0].target.id, 'D01');
});
test('editing either side immediately hides connections until reconfirmed', async (t) => {
  const { call } = setup(t);
  const added = await call('remixes', 'POST', linkInput);
  const original = await call('recipes/D03');
  await call('recipes/D03', 'PUT', { ...original.body.data.recipe, title: 'Updated lime bowl' }, original.tag);
  const options = await call('recipes/D01/remix-options', 'POST', { ...constraints, sourceRevision: 1 });
  assert.equal(options.body.data.items.length, 0); assert.equal(options.body.data.staleCount, 1);
  const list = await call('recipes/D01/variations');
  const link = list.body.data.connections[0];
  assert.equal(link.stale, true);
  assert.equal((await call(`remixes/${added.body.data.id}`, 'PUT', { ...linkInput, targetRevision: 2 }, link.tag)).status, 200);
  assert.equal((await call('recipes/D01/remix-options', 'POST', { ...constraints, sourceRevision: 1 })).body.data.items.length, 1);
  assert.equal((await call(`remixes/${link.id}`, 'DELETE', undefined, link.tag)).status, 412);
});
test('source revision conflicts cannot produce a comparison against a different starting recipe', async (t) => {
  const { call } = setup(t);
  const original = await call('recipes/D01');
  await call('recipes/D01', 'PUT', { ...original.body.data.recipe, title: 'Changed' }, original.tag);
  assert.equal((await call('recipes/D01/remix-options', 'POST', { ...constraints, sourceRevision: 1 })).status, 412);
  assert.equal((await call('remixes', 'POST', linkInput)).status, 412);
});
test('remix suggestions honor exclusions, required vegetables and exact portions', async (t) => {
  const { call } = setup(t);
  await call('remixes', 'POST', linkInput);
  const required = await call('recipes/D01/remix-options', 'POST', { ...constraints, sourceRevision: 1, requiredIngredient: 'bok-choy' });
  assert.equal(required.body.data.items.length, 0); assert.equal(required.body.data.filteredCount, 1);
  const pref = await call('preferences');
  await call('preferences', 'PUT', { ...defaults, excludedIngredientIds: ['peppers'] }, pref.tag);
  assert.equal((await call('recipes/D01/remix-options', 'POST', { ...constraints, sourceRevision: 1 })).body.data.items.length, 0);
  assert.equal((await call('recipes/D03/remix-options', 'POST', { ...constraints, sourceRevision: 1 })).body.data.blockedSource, 'excluded-ingredient');
});
test('archived recipes and multi-axis candidates cannot be approved', async (t) => {
  const { call } = setup(t);
  assert.equal((await call('remixes', 'POST', { ...linkInput, axis: 'method' })).status, 400);
  const original = await call('recipes/D03');
  await call('recipes/D03', 'DELETE', undefined, original.tag);
  assert.equal((await call('remixes', 'POST', { ...linkInput, targetRevision: 2 })).status, 400);
});
test('database guards reject stale reviews and preserve recipes on unlink', async (t) => {
  const { call, DB } = setup(t);
  assert.throws(() => DB.sqlite.prepare('INSERT INTO kitchen_remixes(id,source_id,target_id,source_revision,target_revision,axis) VALUES(?,?,?,?,?,?)').run('bad','D01','D03',9,1,'flavor'), /REMIX_REVIEW_CONFLICT/);
  assert.throws(() => DB.sqlite.prepare('INSERT INTO kitchen_remixes(id,source_id,target_id,source_revision,target_revision,axis) VALUES(?,?,?,?,?,?)').run('bad','D01','D03',1,1,'method'), /REMIX_REVIEW_CONFLICT/);
  const added = await call('remixes', 'POST', linkInput);
  assert.equal((await call(`remixes/${added.body.data.id}`, 'DELETE')).status, 428);
  assert.equal((await call(`remixes/${added.body.data.id}`, 'DELETE', undefined, added.tag)).status, 200);
  assert.equal((await call('recipes')).body.data.items.length, 2);
  assert.equal((await call('recipes/D01/history')).body.data.items.length, 1);
});
