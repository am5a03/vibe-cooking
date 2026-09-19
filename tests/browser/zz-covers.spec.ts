import { test, expect, type APIRequestContext } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { screenSession } from '../helpers/browser-session';
import type { IngredientEntry, RecipeDocument, Snapshot } from '../../lib/kitchen/client';
import covers from '../../lib/kitchen/seed-covers.json';
const pack = JSON.parse(readFileSync(new URL('../../examples/personal-kitchen-seed-v1.json', import.meta.url),'utf8')) as {ingredients:IngredientEntry[];recipes:{id:string;recipe:RecipeDocument}[]};
const auth = () => ({Authorization:`Bearer ${process.env.KITCHEN_TEST_TOKEN}`});
test.beforeAll(async ({request}) => {
  const pending=[...pack.ingredients]; const seen=new Set<string>();
  while(pending.length){
    const index=pending.findIndex(row=>row.ingredient.components.every(id=>seen.has(id)));
    if(index<0) throw new Error('Invalid seed graph.');
    const [row]=pending.splice(index,1);
    expect([201,409]).toContain((await request.post('/api/ingredients',{headers:auth(),data:row})).status());seen.add(row.id);
  }
  for(const row of pack.recipes) expect((await request.post('/api/recipes',{headers:auth(),data:row})).status()).toBe(201);
});
test.beforeEach(async({browser,baseURL,context})=>context.addCookies(await screenSession(browser,baseURL)));
async function copy(request:APIRequestContext){
 const id=`cover-test-${crypto.randomUUID()}`;const recipe={...pack.recipes[0].recipe,title:`Cover test ${id.slice(-8)}`};
 expect((await request.post('/api/recipes',{headers:auth(),data:{id,recipe}})).status()).toBe(201);
 return id;
}
async function get(request:APIRequestContext,id:string){return (await (await request.get(`/api/recipes/${id}`,{headers:auth()})).json()).data as Snapshot;}

test('all cover files are public static images, not an optimizer or private media API',async({playwright,baseURL})=>{
 const publicClient=await playwright.request.newContext({baseURL});
 try { for(const cover of covers){
  const r=await publicClient.get(cover.image.src);expect(r.status()).toBe(200);expect(r.headers()['content-type']).toContain('image/svg+xml');expect(await r.text()).toContain('<svg');
 } }finally{await publicClient.dispose();}
});
test('choose, save and reload a cover; ingredients and saved image snapshots remain exact',async({page,request})=>{
 const id=await copy(request);const before=await get(request,id);
 await page.goto(`/#edit/${id}`);
 await page.getByLabel('Choose a cover').selectOption(covers[0].image.src);
 await expect(page.locator('[data-kitchen-recipe-cover] img')).toBeVisible();
 await expect.poll(()=>page.locator('[data-kitchen-recipe-cover] img').evaluate((el:HTMLImageElement)=>el.naturalWidth)).toBeGreaterThan(0);
 expect((await get(request,id)).recipe.image).toBeUndefined();
 await page.getByRole('button',{name:'Save changes',exact:true}).click();
 await expect(page.getByRole('heading',{name:before.recipe.title,exact:true})).toBeVisible();
 await page.reload();await expect(page.locator('[data-kitchen-recipe-cover] img')).toBeVisible();
 const after=await get(request,id);expect(after.recipe.servings).toEqual(before.recipe.servings);expect(after.recipe.image).toEqual(covers[0].image);
 await page.getByRole('button',{name:'Save this version',exact:true}).click();
 await expect(page.getByText('Saved this exact version and portion size to My kitchen.', {exact:true})).toBeVisible();
 for(const width of [320,390,1360]){
  await page.setViewportSize({width,height:960});await page.screenshot({path:`test-results/cover-detail-${width}.png`,fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBeTruthy();
 }
 // Removing only the current cover must not change the old saved version.
 await page.goto(`/#edit/${id}`);await page.getByRole('button',{name:'Remove cover',exact:true}).click();
 await page.getByRole('button',{name:'Save changes',exact:true}).click();
 await expect(page.getByRole('heading',{name:before.recipe.title,exact:true})).toBeVisible();
 expect((await get(request,id)).recipe.image).toBeUndefined();
 const saved=(await (await request.get('/api/favourites',{headers:auth()})).json()).data.items;
 expect(saved.find((x:{recipeId:string})=>x.recipeId===id).recipe.image).toEqual(covers[0].image);
});
test('missing cover falls back and selecting a valid source recovers without reloading',async({page,request})=>{
 const id=await copy(request);await page.goto(`/#edit/${id}`);
 await page.getByLabel('Choose a cover').selectOption(covers[0].image.src);
 await page.getByLabel('Public image path').fill('/images/recipes/does-not-exist.svg');
 await expect(page.locator('[data-kitchen-dish-art]')).toBeVisible();
 await expect(page.locator('[data-kitchen-recipe-cover]')).toHaveCount(0);
 await page.getByLabel('Choose a cover').selectOption(covers[1].image.src);
 await expect(page.locator('[data-kitchen-recipe-cover] img')).toBeVisible();
 await expect.poll(()=>page.locator('[data-kitchen-recipe-cover] img').evaluate((el:HTMLImageElement)=>el.naturalWidth)).toBeGreaterThan(0);
});
test('failed stale save and session expiry retain a chosen cover without silently saving it',async({page,request})=>{
 const id=await copy(request);await page.goto(`/#edit/${id}`);
 await page.getByLabel('Choose a cover').selectOption(covers[2].image.src);
 const r=await request.get(`/api/recipes/${id}`,{headers:auth()});const snap=(await r.json()).data;
 expect((await request.put(`/api/recipes/${id}`,{headers:{...auth(),'If-Match':r.headers().etag},data:{...snap.recipe,description:'Concurrent edit'}})).status()).toBe(200);
 await page.getByRole('button',{name:'Save changes',exact:true}).click();
 await expect(page.locator('main').getByRole('alert')).toContainText('changed in another tab');
 await expect(page.getByLabel('Choose a cover')).toHaveValue(covers[2].image.src);
 expect((await get(request,id)).recipe.image).toBeUndefined();
 await page.evaluate(()=>window.dispatchEvent(new Event('kitchen:expired')));
 await expect(page.getByLabel('Choose a cover')).toBeHidden();
 await page.getByLabel('Private kitchen key').fill(process.env.KITCHEN_TEST_TOKEN as string);
 await page.getByRole('button',{name:'Unlock my kitchen',exact:true}).click();
 await expect(page.getByLabel('Choose a cover')).toBeVisible();
 await expect(page.getByLabel('Choose a cover')).toHaveValue(covers[2].image.src);
 expect((await get(request,id)).recipe.image).toBeUndefined();
});
test('the real attachment CLI previews, applies once and serves covers on catalogue cards',async({page,request,baseURL})=>{
 function run(flag:string){return spawnSync(process.execPath,['--import','tsx','scripts/attach-seed-images.ts',flag],{encoding:'utf8',env:{...process.env,KITCHEN_URL:baseURL,API_TOKEN:process.env.KITCHEN_TEST_TOKEN}});}
 const preview=run('--preview');expect(preview.status,preview.stderr).toBe(0);expect(preview.stdout).toContain('12 missing covers ready');
 expect((await get(request,pack.recipes[0].id)).recipe.image).toBeUndefined();
 const apply=run('--apply');expect(apply.status,apply.stderr).toBe(0);expect(apply.stdout).toContain('12 covers attached');
 const repeat=run('--apply');expect(repeat.status,repeat.stderr).toBe(0);expect(repeat.stdout).toContain('0 covers attached');
 await page.goto('/');await page.getByRole('button',{name:'All recipes',exact:true}).click();
 await expect(page.locator('[data-kitchen-recipe-card] [data-kitchen-recipe-cover]').first()).toBeVisible();
 await page.screenshot({path:'test-results/covers-catalogue-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/covers-catalogue-mobile.png',fullPage:true});
});
