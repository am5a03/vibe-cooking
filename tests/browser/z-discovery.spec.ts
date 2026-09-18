import { test, expect, type APIRequestContext, type BrowserContext } from '@playwright/test';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { screenSession } from '../helpers/browser-session';
import type { IngredientEntry, RecipeDocument } from '../../lib/kitchen/client';
const pack = JSON.parse(readFileSync(new URL('../../examples/exploration-pack.json', import.meta.url), 'utf8')) as { ingredients: IngredientEntry[]; recipes: { id: string; recipe: RecipeDocument }[] };
function auth() {
  const key = process.env.KITCHEN_TEST_TOKEN;
  if (!key) throw new Error('Use the isolated browser runner.');
  return { Authorization: `Bearer ${key}` };
}
async function resetPreferences(request: APIRequestContext) {
  const current = await request.get('/api/preferences', { headers: auth() });
  const tag = current.headers().etag;
  expect((await request.put('/api/preferences', { headers: { ...auth(), 'If-Match': tag }, data: {
    likedIngredientIds: ['broccoli'], excludedIngredientIds: [], defaultBreakfastPortions: 1, defaultDinnerPortions: 3, maxMinutes: null,
  } })).status()).toBe(200);
}
test.beforeAll(async ({ request }) => {
  const pending = [...pack.ingredients];
  const added = new Set<string>();
  while (pending.length) {
    const index = pending.findIndex((entry) => entry.ingredient.components.every((id) => added.has(id)));
    expect(index).toBeGreaterThanOrEqual(0);
    const [entry] = pending.splice(index,1);
    if (!entry) throw new Error('Invalid fixture graph.');
    const response = await request.post('/api/ingredients', { headers: auth(), data: entry });
    expect([201,409]).toContain(response.status()); added.add(entry.id);
  }
  for (const entry of pack.recipes) {
    const response = await request.post('/api/recipes', { headers: auth(), data: entry });
    expect([201, 409], await response.text()).toContain(response.status());
  }
});
let cookies: Awaited<ReturnType<BrowserContext['cookies']>> = [];
test.beforeAll(async ({ browser, baseURL }) => {
  cookies = await screenSession(browser, baseURL);
});
test.beforeEach(async ({ page, request, context }) => {
  await context.addCookies(cookies);
  await resetPreferences(request);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'What sounds good?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Find meal ideas', exact: true })).toBeEnabled();
});
test('discovery respects saved exclusions, substantive ingredients and explicit portion/time choices', async ({ page }) => {
  await page.getByLabel('Include an ingredient').selectOption('broccoli');
  await page.getByLabel('Maximum minutes', { exact:true }).fill('50');
  await page.getByRole('button', { name:'Find meal ideas',exact:true }).click();
  await expect(page.locator('.recipe-card')).toHaveCount(3);
  await expect(page.getByText('4 matching recipes',{exact:true})).toBeVisible();
  await page.screenshot({path:'test-results/discovery-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'Preferences',exact:true}).click();
  const soyRow=page.locator('.taste-row').filter({has:page.locator('span').filter({hasText:/^Soy$/})});
  await soyRow.getByLabel('Exclude').check();
  await page.getByRole('button',{name:'Save preferences'}).click();
  await expect(page.getByRole('status').filter({hasText:'Preferences saved'})).toBeVisible();
  await page.getByRole('button',{name:'Discover',exact:true}).click();
  await expect(page.getByRole('button',{name:'Find meal ideas',exact:true})).toBeEnabled();
  await page.getByLabel('Include an ingredient').selectOption('broccoli');
  await page.getByRole('button',{name:'Find meal ideas',exact:true}).click();
  await expect(page.locator('.recipe-card')).toHaveCount(1);
  await expect(page.locator('.recipe-card')).toContainText('chickpea');
  await page.getByLabel('Discovery portions').fill('2');
  await page.getByRole('button',{name:'Find meal ideas',exact:true}).click();
  await expect(page.getByText('No recipes match all your choices.')).toBeVisible();
  await page.getByRole('button',{name:'All recipes',exact:true}).click();
  await page.getByLabel('Search recipe titles').fill('Lemon–tahini tofu');
  await page.getByRole('button',{name:'Search',exact:true}).click();
  await expect(page.locator('.recipe-card').first()).toContainText('tofu');
});
test('review, preview, use, invalidate and reconfirm a connected flavour remix', async ({ page, request }) => {
  await page.goto('/#recipe/EXP-D01');
  await page.getByRole('button',{name:'Explore variations',exact:true}).click();
  await expect(page.getByText('No reviewed variations match these choices yet.',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Manage variations',exact:true}).click();
  await page.getByRole('button').filter({hasText:'Smoky–lime tofu & broccoli roast'}).click();
  await expect(page.getByRole('heading',{name:'Review before connecting.'})).toBeVisible();
  await page.getByLabel('I reviewed the ingredient changes and cooking instructions for these recipe versions.').check();
  await page.getByRole('button',{name:'Confirm connection',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Reviewed connection saved'})).toBeVisible();
  await page.getByRole('button',{name:'Back to recipe',exact:true}).click();
  await page.getByRole('button',{name:'Explore variations',exact:true}).click();
  await page.getByRole('button').filter({hasText:'Smoky–lime tofu & broccoli roast'}).click();
  await expect(page.locator('.diff-removed')).toContainText(['Tahini']);
  await page.screenshot({path:'test-results/remix-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/remix-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Use this recipe',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Smoky–lime tofu & broccoli roast',exact:true})).toBeVisible();
  const original=await request.get('/api/recipes/EXP-D02',{headers:auth()});
  const {data}=await original.json();
  expect((await request.put('/api/recipes/EXP-D02',{headers:{...auth(),'If-Match':original.headers().etag},data:{...data.recipe,title:'My updated smoky broccoli'}})).status()).toBe(200);
  await page.goto('/#recipe/EXP-D01');
  await page.getByRole('button',{name:'Explore variations',exact:true}).click();
  await expect(page.getByText('1 connections need review after edits.',{exact:false})).toBeVisible();
  await expect(page.getByRole('button',{name:'Use this recipe',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Manage variations',exact:true}).click();
  await page.getByRole('button',{name:'Review changes',exact:true}).click();
  await page.getByLabel('I reviewed the ingredient changes and cooking instructions for these recipe versions.').check();
  await page.getByRole('button',{name:'Reconfirm connection',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Connection reconfirmed'})).toBeVisible();
  const after=await request.get('/api/recipes/EXP-D01',{headers:auth()});
  expect((await after.json()).data.revision).toBe(1);
});
test('breakfast format connections use the authored one-portion recipe',async({page})=>{
  await page.goto('/#variations/EXP-B04');
  await page.getByRole('button').filter({hasText:'Smoky–lime egg & spinach wrap'}).click();
  await expect(page.getByLabel('Compare portion size')).toHaveValue('1');
  await page.getByLabel('I reviewed the ingredient changes and cooking instructions for these recipe versions.').check();
  await page.getByRole('button',{name:'Confirm connection',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Reviewed connection saved'})).toBeVisible();
  await page.getByRole('button',{name:'Back to recipe',exact:true}).click();
  await page.getByRole('button',{name:'Explore variations',exact:true}).click();
  await page.getByRole('button').filter({hasText:'Smoky–lime egg & spinach wrap'}).click();
  await page.getByRole('button',{name:'Use this recipe',exact:true}).click();
  await expect(page.getByLabel('Portions',{exact:true})).toHaveValue('1');
});
