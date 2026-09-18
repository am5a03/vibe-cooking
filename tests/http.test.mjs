import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { authenticate, allowedOrigin, body, checkRevision, etag, finalize, json } from '../lib/kitchen/http.ts';
import * as V from '../lib/kitchen/validation.ts';
const token = 'a'.repeat(64);
const req = (headers = {}, payload) => new Request('https://kitchen.example/api/recipes', { method: payload ? 'POST' : 'GET', headers, ...(payload ? {body: payload} : {}) });
test('auth denies an unset or placeholder secret', async () => {
  for (const API_TOKEN of [undefined, '', 'short', 'REPLACE_WITH_A_RANDOM_SECRET_OF_AT_LEAST_32_CHARACTERS']) await assert.rejects(authenticate(req(), {API_TOKEN}), e=>e.status===503);
});
test('auth denies wrong and missing tokens', async () => {
  for (const Authorization of ['', 'Bearer '+ 'b'.repeat(64), 'Bearer small']) await assert.rejects(authenticate(req({Authorization}), {API_TOKEN:token}), e=>e.status===401);
});
test('auth accepts a valid bearer token', async () => { await authenticate(req({Authorization:'Bearer '+token}), {API_TOKEN:token}); });
test('same-origin works without a cross-origin setting', () => { assert.equal(allowedOrigin(req({Origin:'https://kitchen.example'}), {}), 'https://kitchen.example'); });
test('foreign, opaque and wildcard origins are refused', () => {
  for (const Origin of ['https://attacker.example', 'null']) assert.throws(()=>allowedOrigin(req({Origin}), {}), e=>e.status===403);
  assert.throws(()=>allowedOrigin(req({Origin:'https://app.example'}), {ALLOWED_ORIGIN:'*'}), e=>e.status===403);
});
test('one explicitly configured browser origin is allowed', () => { assert.equal(allowedOrigin(req({Origin:'https://app.example'}), {ALLOWED_ORIGIN:'https://app.example'}), 'https://app.example'); });
test('valid JSON is parsed; bad content types and JSON are rejected', async () => {
  assert.deepEqual(await body(req({'Content-Type':'application/json'}, '{}')), {});
  await assert.rejects(body(req({'Content-Type':'text/plain'}, '{}')), e=>e.status===415);
  await assert.rejects(body(req({'Content-Type':'application/json'}, '{')), e=>e.status===400);
});
test('body size is enforced on actual bytes', async () => { await assert.rejects(body(req({'Content-Type':'application/json'}, ' '.repeat(128*1024+1))), e=>e.status===413); });
test('ETag missing and stale writes are rejected', () => {
  assert.throws(()=>checkRevision(req(), 'recipe','D01',1), e=>e.status===428);
  assert.throws(()=>checkRevision(req({'If-Match':etag('recipe','D01',1)}), 'recipe','D01',2), e=>e.status===412);
  checkRevision(req({'If-Match':etag('recipe','D01',2)}), 'recipe','D01',2);
});
test('private responses are not cacheable and expose no wildcard CORS', () => {
  const r=finalize(json({ok:true}), 'test', null);
  assert.equal(r.headers.get('Cache-Control'),'no-store'); assert.equal(r.headers.get('Access-Control-Allow-Origin'),null);
});
const fixture=JSON.parse(readFileSync(new URL('../examples/catalogue.json',import.meta.url),'utf8'));
test('starter recipes pass complete document validation', () => { for(const r of fixture.recipes) assert.equal(V.recipe(r.recipe).reviewStatus,'draft'); });
test('negative ingredients, duplicate portions and unsupported test claims fail', () => {
  const original=fixture.recipes[0].recipe;
  const bad=structuredClone(original); bad.servings[0].ingredients[0].quantity=-1; assert.throws(()=>V.recipe(bad));
  const duplicate=structuredClone(original); duplicate.servings.push(duplicate.servings[0]); assert.throws(()=>V.recipe(duplicate));
  assert.throws(()=>V.recipe({...original,reviewStatus:'kitchen-tested'}));
});
test('preferences reject a direct like/exclusion conflict and invalid limits', () => {
  const p={likedIngredientIds:['tofu'],excludedIngredientIds:[],defaultDinnerPortions:3,defaultBreakfastPortions:1,maxMinutes:null};
  assert.deepEqual(V.preferences(p),p); assert.throws(()=>V.preferences({...p,excludedIngredientIds:['tofu']}));
  assert.throws(()=>V.preferences({...p,maxMinutes:-1}));
});
test('IDs and unknown fields cannot smuggle invalid data', () => { assert.throws(()=>V.id("' OR 1=1")); assert.throws(()=>V.ingredient({name:'tofu',aliases:[],components:[],admin:true})); });
