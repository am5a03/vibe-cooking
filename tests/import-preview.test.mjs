import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import * as V from '../lib/kitchen/validation.ts';
import { ingredientResolver, variationAxis, commonPortions } from '../lib/kitchen/exploration.ts';
const pack = JSON.parse(readFileSync(new URL('../examples/exploration-pack.json', import.meta.url), 'utf8'));
const initial = JSON.parse(readFileSync(new URL('../examples/catalogue.json', import.meta.url), 'utf8'));

test('optional pack is complete, does not reuse starter IDs, and covers every remix axis', () => {
  assert.equal(pack.recipes.length, 10);
  const resolve = ingredientResolver(pack.ingredients);
  for (const row of pack.ingredients) { V.ingredient(row.ingredient); assert.equal(resolve(row.id).complete, true); }
  for (const row of pack.recipes) {
    V.recipe(row.recipe);
    assert.ok(!initial.recipes.some((item) => item.id === row.id));
    for (const id of V.references(row.recipe)) assert.equal(resolve(id).complete, true);
  }
  const get = (id) => pack.recipes.find((row) => row.id === id).recipe;
  for (const [left,right,axis] of [['EXP-D01','EXP-D02','flavor'],['EXP-D01','EXP-D03','main'],['EXP-D01','EXP-D04','method'],['EXP-B04','EXP-B05','method']]) {
    assert.equal(variationAxis(get(left),get(right)),axis); assert.ok(commonPortions(get(left),get(right)).length);
  }
});
async function runImport(args, url) {
  const child = spawn(process.execPath, ['--import','tsx','scripts/import-catalogue.ts',...args], {
    env: { ...process.env, KITCHEN_URL: url, API_TOKEN: 'test'.repeat(16) }, stdio: ['ignore','pipe','pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const code = await new Promise((resolve, reject) => { child.on('error',reject); child.on('exit',resolve); });
  return { code, output };
}
test('import preview reports new/unchanged/conflicts and never writes, including apply on conflict', async (t) => {
  let writes = 0;
  const server = createServer((req,res) => {
    if (req.method !== 'GET') writes++;
    res.setHeader('Content-Type','application/json');
    const items = req.url.startsWith('/api/ingredients') ? initial.ingredients : [{ ...initial.recipes[0], recipe: { ...initial.recipes[0].recipe, title: 'My personal change' } }];
    res.end(JSON.stringify({ data: { items, nextAfter: null } }));
  });
  await new Promise((resolve) => server.listen(0,'127.0.0.1',resolve));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}`;
  const preview = await runImport(['--preview'],url);
  assert.equal(preview.code,0,preview.output);
  assert.match(preview.output,/UNCHANGED Ingredient/);
  assert.match(preview.output,/CONFLICT Recipe D01/);
  assert.match(preview.output,/NEW Recipe D03/);
  assert.equal(writes,0);
  const apply = await runImport(['--apply'],url);
  assert.notEqual(apply.code,0); assert.match(apply.output,/Nothing was written/); assert.equal(writes,0);
});
