// Exercise Wrangler's applied-filename handling on a disposable LOCAL D1 only.
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const directory = mkdtempSync(join(tmpdir(), 'kitchen-migration-upgrade-'));
const legacy = join(directory, 'legacy');
const state = join(directory, 'state');
const config = join(directory, 'wrangler.json');
const env = { ...process.env, CLOUDFLARE_API_TOKEN: '', CLOUDFLARE_API_KEY: '', CLOUDFLARE_ACCOUNT_ID: '', WRANGLER_SEND_METRICS: 'false' };
function configure(migrations) {
  writeFileSync(config, JSON.stringify({ name: 'kitchen-migration-upgrade-check', compatibility_date: '2026-09-17',
    d1_databases: [{ binding: 'DB', database_name: 'kitchen-migration-upgrade-check', database_id: '00000000-0000-0000-0000-000000000000', migrations_dir: migrations, remote: false }],
  }));
}
function wrangler(args) {
  const result = spawnSync(process.execPath, [resolve('node_modules/wrangler/bin/wrangler.js'), 'd1', ...args, '--local', '--config', config, '--persist-to', state], { env, encoding: 'utf8', input: 'y\n', timeout: 60000 });
  if (result.status !== 0 || result.error) throw new Error(`Isolated D1 upgrade check failed.\n${result.stdout ?? ''}${result.stderr ?? ''}`);
  return result.stdout;
}
function query(sql) {
  const results = JSON.parse(wrangler(['execute', 'DB', '--command', sql, '--json']));
  assert.ok(Array.isArray(results) && results.length > 0);
  return results.flatMap((result) => result.results);
}
const quote = (value) => `'${value.replaceAll("'", "''")}'`;
try {
  mkdirSync(legacy);
  for (const name of ['0001_kitchen.sql', '0002_browser_sessions.sql']) cpSync(resolve('drizzle/migrations', name), join(legacy, name));
  cpSync(resolve('tests/fixtures/legacy-0003-recipe-remixes.sql'), join(legacy, '0003_recipe_remixes.sql'));
  configure(legacy);
  wrangler(['migrations', 'apply', 'DB']);
  const fixture = JSON.parse(readFileSync(resolve('examples/catalogue.json'), 'utf8'));
  const seed = fixture.recipes.map((entry) => `INSERT INTO kitchen_recipes(id,document) VALUES(${quote(entry.id)},${quote(JSON.stringify(entry.recipe))});`).join('\n');
  const seedPath = join(directory, 'seed.sql');
  writeFileSync(seedPath, `${seed}\nINSERT INTO kitchen_remixes(id,source_id,target_id,source_revision,target_revision,axis) VALUES('keep-link','D01','D03',1,1,'flavor');\nINSERT INTO kitchen_favourites(recipeId,recipeRevision,portions,snapshot) SELECT id,revision,3,document FROM kitchen_recipes WHERE id='D01';\nINSERT INTO kitchen_notes(recipeId,document) VALUES('D01','{"text":"keep note","verdict":"repeat"}');`);
  wrangler(['execute', 'DB', '--file', seedPath]);
  const sql = `SELECT id,source_id,target_id,source_revision,target_revision,axis,revision,created_at,updated_at FROM kitchen_remixes ORDER BY id`;
  const before = query(sql);
  const favourites = query('SELECT * FROM kitchen_favourites ORDER BY recipeId');
  const history = query('SELECT * FROM kitchen_recipe_history ORDER BY recipeId,revision');
  const notes = query('SELECT * FROM kitchen_notes ORDER BY recipeId');
  configure(resolve('drizzle/migrations'));
  wrangler(['migrations', 'apply', 'DB']);
  assert.deepEqual(query(sql), before);
  assert.deepEqual(query('SELECT * FROM kitchen_favourites ORDER BY recipeId'), favourites);
  assert.deepEqual(query('SELECT * FROM kitchen_recipe_history ORDER BY recipeId,revision'), history);
  assert.deepEqual(query('SELECT * FROM kitchen_notes ORDER BY recipeId'), notes);
  const applied = query('SELECT name FROM d1_migrations ORDER BY name').map((row) => row.name);
  for (const name of ['0003_recipe_remixes.sql','0003_drizzle_baseline.sql','0004_recipe_remixes.sql','0005_recipe_remix_guards.sql']) assert.ok(applied.includes(name), name);
  assert.deepEqual(query('PRAGMA foreign_key_check'), []);
  console.log('Wrangler upgrade passed: old preview filename retained; reviewed remixes, favourites, notes and history preserved.');
} finally {
  rmSync(directory, { recursive: true, force: true });
}
