import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import type { IngredientEntry, RecipeDocument } from '../../lib/kitchen/client';

test('private cookbook: save, note, duplicate, edit and reload through real local D1', async ({ page, request }) => {
  const key = process.env.KITCHEN_TEST_TOKEN;
  if (!key) throw new Error('Run only with a temporary KITCHEN_TEST_TOKEN and isolated local D1.');
  expect((await request.get('/api/recipes')).status()).toBe(401);
  const fixture = JSON.parse(readFileSync(new URL('../../examples/catalogue.json', import.meta.url), 'utf8')) as { ingredients: IngredientEntry[]; recipes: { id: string; recipe: RecipeDocument }[] };
  // The API requires component definitions first, just like the production importer.
  const pending = [...fixture.ingredients];
  const imported = new Set<string>();
  while (pending.length) {
    const index = pending.findIndex((entry) => entry.ingredient.components.every((id) => imported.has(id)));
    expect(index).toBeGreaterThanOrEqual(0);
    const [entry] = pending.splice(index, 1);
    if (!entry) throw new Error('Fixture ingredient ordering failed.');
    const response = await request.post('/api/ingredients', { headers: { Authorization: `Bearer ${key}` }, data: entry });
    expect(response.status(), await response.text()).toBe(201);
    imported.add(entry.id);
  }
  for (const entry of fixture.recipes) {
    const response = await request.post('/api/recipes', { headers: { Authorization: `Bearer ${key}` }, data: entry });
    expect(response.status(), await response.text()).toBe(201);
  }
  const original = fixture.recipes[0];
  if (!original) throw new Error('Missing fixture recipe.');
  await page.goto('/');
  await page.getByLabel('Private kitchen key').fill(key);
  await page.getByRole('button', { name: 'Unlock my kitchen' }).click();
  await expect(page.getByRole('heading', { name: 'What sounds good?' })).toBeVisible();
  await expect(page.locator('.recipe-card')).toHaveCount(2);
  await page.screenshot({ path: 'test-results/kitchen-desktop.png', fullPage: true });
  await page.getByRole('button', { name: original.recipe.title, exact: true }).click();
  await page.getByRole('button', { name: 'Save this version', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved this exact version' })).toBeVisible();
  await page.getByLabel('Your cooking note').fill('More ginger next time.');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Cooking note saved' })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Your cooking note')).toHaveValue('More ginger next time.');
  await page.getByRole('button', { name: 'Edit recipe', exact: true }).click();
  await page.getByLabel('Recipe title', { exact: true }).fill('My ginger bowl');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My ginger bowl' })).toBeVisible();
  await page.getByRole('button', { name: 'My kitchen', exact: true }).click();
  await page.getByRole('button', { name: 'Open saved version', exact: true }).click();
  await expect(page.getByRole('heading', { name: original.recipe.title, exact: true })).toBeVisible();
  await expect(page.getByLabel('Your cooking note')).toHaveValue('More ginger next time.');
  await page.getByRole('button', { name: 'Open the current recipe', exact: true }).click();
  await page.getByRole('button', { name: 'Make a copy', exact: true }).click();
  await page.getByLabel('Recipe title', { exact: true }).fill('My smoky experiment');
  await page.getByRole('button', { name: 'Save new recipe', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My smoky experiment' })).toBeVisible();
  await page.getByRole('button', { name: 'Preferences', exact: true }).click();
  await page.getByLabel('Breakfast portions', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Preferences saved' })).toBeVisible();
  await page.reload(); await expect(page.getByLabel('Breakfast portions', { exact: true })).toHaveValue('2');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Recipes', exact: true }).click();
  await expect(page.locator('.recipe-card')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/kitchen-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Lock', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Come on in.' })).toBeVisible();
  await page.reload(); await expect(page.getByLabel('Private kitchen key')).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage).length)).toBe(0);
});
