import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { handle } from '../lib/kitchen/api.ts';
import { recipe, image, references, ingredient } from '../lib/kitchen/validation.ts';
import { editable } from '../lib/kitchen/editor-model.ts';
import { attachSeedImages } from '../scripts/attach-seed-images.ts';
import { TestD1 } from './d1-adapter.mjs';
const pack = JSON.parse(readFileSync(new URL('../examples/personal-kitchen-seed-v1.json', import.meta.url), 'utf8'));
const covers = JSON.parse(readFileSync(new URL('../lib/kitchen/seed-covers.json', import.meta.url), 'utf8'));
pack.recipes = pack.recipes.map(row => ({ ...row, recipe: recipe(row.recipe) }));
const token = 'k'.repeat(64);
function setup(t) {
  const DB = new TestD1(); t.after(() => DB.close());
  for (const row of pack.ingredients) DB.sqlite.prepare('INSERT INTO kitchen_ingredients(id,document) VALUES(?,?)').run(row.id, JSON.stringify(row.ingredient));
  for (const row of pack.recipes) DB.sqlite.prepare('INSERT INTO kitchen_recipes(id,document) VALUES(?,?)').run(row.id, JSON.stringify(row.recipe));
  const calls = [];
  const fetcher = async (url, init = {}) => {
    const req = new Request(url, init); calls.push(req);
    if (req.method === 'HEAD') {
      assert.equal(req.headers.get('authorization'), null);
      return new Response(null, { headers: { 'Content-Type': 'image/svg+xml' } });
    }
    return handle(req, { DB, API_TOKEN: token });
  };
  const opts = { base: 'http://localhost:3000', token, covers, seeds: pack.recipes, fetcher, log: () => {}, apply: false };
  const call = async (path, method='GET', data=undefined, tag=undefined) => fetcher(`http://localhost:3000/api/${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, ...(data ? {'Content-Type':'application/json'} : {}), ...(tag ? {'If-Match': tag} : {}) }, ...(data ? {body:JSON.stringify(data)} : {}) });
  return { DB, calls, opts, call };
}
test('optional image metadata preserves existing recipes and editor serialization', () => {
  const old = pack.recipes[0].recipe;
  assert.deepEqual(recipe(old), old);
  assert.ok(!('image' in recipe(old)));
  const withCover = { ...old, image: covers[0].image };
  assert.deepEqual(recipe(withCover), withCover);
  assert.deepEqual(JSON.parse(JSON.stringify(editable(withCover))), withCover);
  assert.deepEqual(recipe({ ...withCover, image: undefined }), old);
});
test('image validation rejects remote paths, traversal, credentials, invalid metadata and active input', () => {
  for (const src of ['https://evil.test/photo.jpg','//evil.test/a.png','data:image/png;base64,AA','javascript:alert(1)', '/images/recipes/../x.png', '/images/recipes/%2e%2e/x.png', '/images/recipes/x.svg?secret=x','/images/recipes/x.svg#f','/images/recipes/a\\b.jpg','/api/recipes/a','/images/recipes/x.html']) assert.throws(() => image({ ...covers[0].image, src }), src);
  for (const patch of [{width:0}, {height:-1}, {width:1.2}, {width:9999}, {kind:'real-tested'}, {alt:''}, {onerror:'alert(1)'}]) assert.throws(() => image({ ...covers[0].image, ...patch }));
  assert.throws(() => recipe({ ...pack.recipes[0].recipe, image:null }));
  assert.equal(image({ ...covers[0].image, src:'/images/recipes/my-photo-v1.webp', kind:'photo' }).kind, 'photo');
});
test('all twelve source-owned assets and seed definitions are complete and deterministic', (t) => {
  assert.equal(covers.length,12);
  const ids = new Set(pack.ingredients.map(row=>row.id));
  for (const row of pack.ingredients) ingredient(row.ingredient);
  for (const row of pack.recipes) { recipe(row.recipe); for(const ref of references(row.recipe)) assert.ok(ids.has(ref)); }
  const dir = mkdtempSync(join(tmpdir(),'cover-art-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const result = spawnSync(process.execPath, [new URL('../scripts/draw-seed-covers.mjs', import.meta.url).pathname], { cwd:dir, encoding:'utf8' });
  assert.equal(result.status,0,result.stderr);
  for(const cover of covers){
    image(cover.image);
    const svg=readFileSync(new URL(`../public${cover.image.src}`,import.meta.url),'utf8');
    assert.match(svg,/width="1200" height="900"/);
    assert.ok(!/<script|<foreignObject|\bon\w+=|\bhref=|<!ENTITY/i.test(svg));
    assert.equal(readFileSync(join(dir,'public',cover.image.src),'utf8'),svg);
  }
});
test('cover preview only reads recipes and public assets, never sends keys to images',async t=>{
  const {opts,calls}=setup(t);assert.equal(await attachSeedImages(opts),0);
  assert.equal(calls.filter(r=>r.method==='GET').length,12);
  assert.equal(calls.filter(r=>r.method==='HEAD').length,12);
  assert.ok(calls.every(r=>['GET','HEAD'].includes(r.method)));
});
test('attachment preserves user text, notes, ingredients and old favourite snapshots; reruns do not revise again',async t=>{
  const {opts,call}=setup(t);const id=pack.recipes[0].id;
  let r=await call(`recipes/${id}`);const old=(await r.json()).data;
  await call(`recipes/${id}`,'PUT',{...old.recipe,title:'My own title',description:'Keep this description'},r.headers.get('etag'));
  await call(`favourites/${id}`,'PUT',{recipeRevision:2,portions:3});
  const note=await call(`recipes/${id}/note`);await call(`recipes/${id}/note`,'PUT',{text:'Keep this note',verdict:'repeat'},note.headers.get('etag'));
  assert.equal(await attachSeedImages({...opts,apply:true}),12);
  r=await call(`recipes/${id}`);const current=(await r.json()).data;
  assert.equal(current.recipe.title,'My own title');assert.equal(current.recipe.description,'Keep this description');
  assert.deepEqual(current.recipe.servings,old.recipe.servings);assert.deepEqual(current.recipe.image,covers[0].image);
  assert.equal((await (await call(`recipes/${id}/note`)).json()).data.note.text,'Keep this note');
  const favourites=(await (await call('favourites')).json()).data.items;
  assert.equal(favourites[0].recipe.image,undefined);
  assert.equal(await attachSeedImages({...opts,apply:true}),0);
  assert.equal((await (await call(`recipes/${id}`)).json()).data.revision,current.revision);
});
test('attachment skips altered cooking, archived recipes, missing IDs and existing covers',async t=>{
  const {opts,call,DB}=setup(t);
  const changes=[{...pack.recipes[0].recipe,method:'simmer'},{...pack.recipes[1].recipe,status:'archived'},{...pack.recipes[2].recipe,image:covers[1].image}];
  for(let i=0;i<3;i++){const id=pack.recipes[i].id;const r=await call(`recipes/${id}`);await call(`recipes/${id}`,'PUT',changes[i],r.headers.get('etag'));}
  // Add an absent manifest ID without deleting a populated table or bypassing history guards.
  const absent={...covers[0],recipeId:'not-imported'};
  assert.equal(await attachSeedImages({...opts,apply:true,covers:[...covers,absent],seeds:[...pack.recipes,{id:absent.recipeId,recipe:pack.recipes[0].recipe}]}),9);
  assert.equal(DB.sqlite.prepare('SELECT count(*) AS n FROM kitchen_recipes').get().n,12);
});
test('all asset checks finish before any mutation; missing assets abort without writes',async t=>{
  const {opts,calls}=setup(t);let heads=0;
  const fetcher=async(url,init)=>init?.method==='HEAD'&&++heads===2?new Response(null,{status:404}):opts.fetcher(url,init);
  await assert.rejects(attachSeedImages({...opts,fetcher,apply:true}),/Cover unavailable/);
  assert.equal(calls.filter(r=>r.method==='PUT').length,0);
});
test('concurrent recipe edits are never overwritten and a partial run can resume',async t=>{
  const {opts,call}=setup(t);let writes=0;
  const fetcher=async(url,init)=>{
    if(init?.method==='PUT'&&++writes===2){const id=pack.recipes[1].id;const current=await call(`recipes/${id}`);const doc=(await current.json()).data.recipe;await call(`recipes/${id}`,'PUT',{...doc,title:'Concurrent title'},current.headers.get('etag'));}
    return opts.fetcher(url,init);
  };
  await assert.rejects(attachSeedImages({...opts,fetcher,apply:true}),/HTTP 412.*1 earlier covers/);
  assert.equal((await (await call(`recipes/${pack.recipes[1].id}`)).json()).data.recipe.title,'Concurrent title');
  assert.equal(await attachSeedImages({...opts,apply:true}),11);
});
test('image revisions keep old snapshots and make existing remix approvals stale',async t=>{
  const {call,opts}=setup(t);const a=pack.recipes[0].id;const b=pack.recipes[1].id;
  // Use existing remix API contract rather than modifying its guards.
  const response=await call('remixes','POST',{ sourceId:a, targetId:b, sourceRevision:1, targetRevision:1, axis:'flavor' });
  assert.equal(response.status,201);
  assert.equal((await (await call(`recipes/${a}/variations`)).json()).data.connections[0].stale,false);
  await attachSeedImages({...opts,apply:true});
  assert.equal((await (await call(`recipes/${a}/variations`)).json()).data.connections[0].stale,true);
  const history=(await (await call(`recipes/${a}/history`)).json()).data.items;
  assert.equal(history.length,2);assert.equal(history[0].recipe.image,undefined);assert.deepEqual(history[1].recipe.image,covers[0].image);
});
test('invalid target, authentication or manifest stops before any changes',async t=>{
  const {opts,calls}=setup(t);
  for(const base of ['http://not-local.test','https://user:secret@example.test','https://example.test/path']) await assert.rejects(attachSeedImages({...opts,base}),/KITCHEN_URL/);
  await assert.rejects(attachSeedImages({...opts,token:''}),/API_TOKEN/);
  await assert.rejects(attachSeedImages({...opts,covers:[covers[0],covers[0]]}),/Duplicate/);
  assert.equal(calls.length,0);
  await assert.rejects(attachSeedImages({...opts,token:'wrong'.repeat(12),apply:true}),/preflight failed \(401\)/);
  assert.ok(calls.every(r=>r.method==='GET'));
});
