import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handle } from '../lib/kitchen/api.ts';
import { TestD1 } from './d1-adapter.mjs';
const fixture=JSON.parse(readFileSync(new URL('../examples/catalogue.json',import.meta.url),'utf8'));
const token='a'.repeat(64);
function setup(t) {
  const DB=new TestD1(); t.after(()=>DB.close());
  for(const i of fixture.ingredients) DB.sqlite.prepare('INSERT INTO kitchen_ingredients(id,document) VALUES(?,?)').run(i.id,JSON.stringify(i.ingredient));
  for(const r of fixture.recipes) DB.sqlite.prepare('INSERT INTO kitchen_recipes(id,document) VALUES(?,?)').run(r.id,JSON.stringify(r.recipe));
  return {DB, call:async(path,method='GET',value,tag)=>{
    const response=await handle(new Request('https://kitchen.example/api/'+path,{method,headers:{Authorization:'Bearer '+token,...(value?{'Content-Type':'application/json'}:{}),...(tag?{'If-Match':tag}:{})},...(value?{body:JSON.stringify(value)}:{})}),{DB,API_TOKEN:token});
    return {response,status:response.status,tag:response.headers.get('ETag'),body:response.status===204?null:await response.json()};
  }};
}
test('API authentication fails closed before querying the DB',async()=>{
  for(const API_TOKEN of [undefined,token]) {const r=await handle(new Request('https://kitchen.example/api/recipes'),{API_TOKEN}); assert.equal(r.status,API_TOKEN?401:503);}
});
test('list paging and literal search work; unknown filters fail visibly',async t=>{
 const {call}=setup(t), first=await call('recipes?limit=1'); assert.equal(first.status,200);assert.equal(first.body.data.items.length,1);
 const second=await call('recipes?limit=1&after='+first.body.data.nextAfter);assert.notEqual(first.body.data.items[0].id,second.body.data.items[0].id);
 assert.equal((await call('recipes?q=%25')).body.data.items.length,0);assert.equal((await call('recipes?exclude=soy')).status,400);
});
test('creating and editing a recipe produces immutable history; stale writes fail',async t=>{
 const {call,DB}=setup(t);const original=await call('recipes/D01');assert.equal(original.status,200);
 const changed={...original.body.data.recipe,title:'My ginger tofu'};
 assert.equal((await call('recipes/D01','PUT',changed)).status,428);
 const saved=await call('recipes/D01','PUT',changed,original.tag);assert.equal(saved.status,200);assert.equal(saved.body.data.revision,2);
 assert.equal((await call('recipes/D01','PUT',changed,original.tag)).status,412);
 const history=await call('recipes/D01/history');assert.equal(history.body.data.items.length,2);assert.equal(history.body.data.items[0].recipe.title,original.body.data.recipe.title);
 assert.throws(()=>DB.sqlite.exec("UPDATE kitchen_recipe_history SET revision=10 WHERE recipeId='D01'"));
 assert.throws(()=>DB.sqlite.exec("DELETE FROM kitchen_recipe_history WHERE recipeId='D01'"));
});
test('ingredients and recipes are add-only by ID; unknown references are rejected',async t=>{
 const {call}=setup(t);
 assert.equal((await call('ingredients','POST',{id:'new-root',ingredient:{name:'New',aliases:[],components:[]}})).status,201);
 assert.equal((await call('ingredients','POST',{id:'cycle',ingredient:{name:'Bad',aliases:[],components:['cycle']}})).status,400);
 assert.equal((await call('recipes','POST',fixture.recipes[0])).status,409);
 const doc=structuredClone(fixture.recipes[0].recipe);doc.servings[0].ingredients.push({ingredientId:'missing',quantity:1,unit:'g',role:'sauce',preparation:''});
 assert.equal((await call('recipes','POST',{id:'new-recipe',recipe:doc})).status,422);
});
test('favourites preserve the viewed version, not a later edit',async t=>{
 const {call}=setup(t), original=await call('recipes/D01');
 await call('recipes/D01','PUT',{...original.body.data.recipe,title:'Changed'},original.tag);
 assert.equal((await call('favourites/D01','PUT',{recipeRevision:1,portions:3})).status,201);
 const saved=await call('favourites');assert.equal(saved.body.data.items[0].recipe.title,original.body.data.recipe.title);
 assert.equal((await call('favourites/D01','PUT',{recipeRevision:2,portions:3})).body.data.alreadySaved,true);
 assert.equal((await call('favourites/D01','DELETE')).status,204);
});
test('notes and preferences use optimistic concurrency',async t=>{
 const {call}=setup(t), p=await call('preferences');assert.equal(p.status,200);
 assert.equal((await call('preferences','PUT',{...p.body.data.preferences,likedIngredientIds:['tofu']},p.tag)).status,200);
 assert.equal((await call('preferences','PUT',p.body.data.preferences,p.tag)).status,412);
 const n=await call('recipes/D01/note');assert.equal(n.body.data.revision,0);
 assert.equal((await call('recipes/D01/note','PUT',{text:'More ginger',verdict:'repeat'},n.tag)).status,200);
 assert.equal((await call('recipes/D01/note','PUT',{text:'Old edit',verdict:'adjust'},n.tag)).status,412);
});
test('archiving hides a meal by default, without deleting history',async t=>{
 const {call}=setup(t), r=await call('recipes/D01');assert.equal((await call('recipes/D01','DELETE',undefined,r.tag)).status,200);
 assert.equal((await call('recipes')).body.data.items.length,1);assert.equal((await call('recipes?status=all')).body.data.items.length,2);
 assert.equal((await call('recipes/D01/history')).body.data.items.length,2);
});
