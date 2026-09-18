import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EDIT_KEY, editable, editableServing, emptyRecipe } from '../lib/kitchen/editor-model.ts';
import { recipe } from '../lib/kitchen/validation.ts';
const fixture = JSON.parse(readFileSync(new URL('../examples/catalogue.json', import.meta.url), 'utf8')).recipes[0].recipe;

test('editor row identities are not serialized into recipe data', () => {
  const draft = editable(fixture);
  assert.deepEqual(JSON.parse(JSON.stringify(draft)), fixture);
  assert.deepEqual(recipe(draft), recipe(fixture));
  assert.equal(typeof draft.servings[0][EDIT_KEY], 'string');
});
test('editing preserves row identity and copying a profile gets independent identities', () => {
  const draft = editable(fixture);
  const row = draft.servings[0].ingredients[0];
  assert.equal({ ...row, quantity: 99 }[EDIT_KEY], row[EDIT_KEY]);
  const clone = editableServing(draft.servings[0]);
  assert.notEqual(clone[EDIT_KEY], draft.servings[0][EDIT_KEY]);
  assert.notEqual(clone.ingredients[0][EDIT_KEY], row[EDIT_KEY]);
  assert.notEqual(clone.steps[0][EDIT_KEY], draft.servings[0].steps[0][EDIT_KEY]);
  assert.deepEqual(JSON.parse(JSON.stringify(clone)), fixture.servings[0]);
});
test('blank editor models are independent and have complete starting controls', () => {
  const a = emptyRecipe();
  const b = emptyRecipe();
  assert.equal(a.reviewStatus, 'draft');
  assert.equal(a.servings.length, 1);
  assert.notEqual(a.servings[0][EDIT_KEY], b.servings[0][EDIT_KEY]);
  assert.equal(a.servings[0].ingredients[0].role, 'main');
});
