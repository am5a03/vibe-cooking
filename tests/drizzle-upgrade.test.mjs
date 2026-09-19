import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';

const directory = new URL('../drizzle/migrations/', import.meta.url);
const read = (name) => readFileSync(new URL(name, directory), 'utf8');
const names = readdirSync(directory).filter((name) => name.endsWith('.sql')).sort();
const beforeRemixes = ['0001_kitchen.sql', '0002_browser_sessions.sql', '0003_drizzle_baseline.sql'];
const additions = ['0004_recipe_remixes.sql', '0005_recipe_remix_guards.sql'];
const fixture = JSON.parse(readFileSync(new URL('../examples/catalogue.json', import.meta.url), 'utf8'));
const apply = (db, files) => { for (const name of files) db.exec(read(name)); };
function database(t) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  t.after(() => db.close());
  return db;
}
function populate(db) {
  for (const entry of fixture.ingredients) db.prepare('INSERT INTO kitchen_ingredients(id,document) VALUES(?,?)').run(entry.id, JSON.stringify(entry.ingredient));
  for (const entry of fixture.recipes) db.prepare('INSERT INTO kitchen_recipes(id,document) VALUES(?,?)').run(entry.id, JSON.stringify(entry.recipe));
  db.exec("INSERT INTO kitchen_notes(recipeId,document) VALUES('D01','{\"text\":\"Keep this note\",\"verdict\":\"repeat\"}');");
  db.exec("INSERT INTO kitchen_favourites(recipeId,recipeRevision,portions,snapshot) SELECT id,revision,3,document FROM kitchen_recipes WHERE id='D01';");
  db.exec("INSERT INTO kitchen_browser_sessions(tokenHash,expiresAt) VALUES('existing-session',9999999999);");
  db.exec("INSERT INTO kitchen_login_limits(key,attempts,resetsAt) VALUES('existing-limit',2,9999999999);");
}
function contents(db) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'kitchen_%' ORDER BY name").all();
  return Object.fromEntries(tables.map(({ name }) => [name, db.prepare(`SELECT * FROM "${name}" ORDER BY 1`).all()]));
}
const triggers = (db) => db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name").all();
const connect = (db) => db.exec("INSERT INTO kitchen_remixes(id,source_id,target_id,source_revision,target_revision,axis) VALUES('saved-link','D01','D03',1,1,'flavor');");

test('fresh migrations create the declared remix storage and custom guards', (t) => {
  const db = database(t);
  assert.deepEqual(names, [...beforeRemixes, ...additions, '0006_flavor_profiles.sql', '0007_seed_flavor_profiles.sql']);
  apply(db, names);
  assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name LIKE 'kitchen_%'").get().n, 10);
  assert.equal(triggers(db).length, 7);
  const info = db.prepare('PRAGMA table_info(kitchen_remixes)').all();
  assert.deepEqual(info.map((column) => column.name), ['id','source_id','target_id','source_revision','target_revision','axis','revision','created_at','updated_at']);
  assert.equal(db.prepare('PRAGMA foreign_key_list(kitchen_remixes)').all().length, 4);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('upgrading a populated PR #7 kitchen preserves every existing row and history trigger', (t) => {
  const db = database(t);
  apply(db, beforeRemixes);
  populate(db);
  const before = contents(db);
  const history = triggers(db);
  apply(db, additions);
  for (const [table, rows] of Object.entries(before)) assert.deepEqual(contents(db)[table], rows, table);
  assert.deepEqual(triggers(db).filter((trigger) => !trigger.name.startsWith('kitchen_remix_')), history);
  connect(db);
  assert.equal(db.prepare('SELECT count(*) AS n FROM kitchen_remixes').get().n, 1);
});

test('a database with the original PR #5 preview migration upgrades without losing approved remixes', (t) => {
  const db = database(t);
  apply(db, beforeRemixes.slice(0, 2));
  db.exec(readFileSync(new URL('./fixtures/legacy-0003-recipe-remixes.sql', import.meta.url), 'utf8'));
  populate(db);
  connect(db);
  const before = contents(db);
  const guards = triggers(db);
  apply(db, [beforeRemixes[2], ...additions]);
  assert.deepEqual(contents(db), before);
  assert.deepEqual(triggers(db), guards);
  // Even accidental repeated execution does not recreate/reset the reviewed link.
  apply(db, additions);
  assert.deepEqual(contents(db), before);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('review and immutable-history protections survive both migration paths', (t) => {
  for (const legacy of [false, true]) {
    const db = database(t);
    apply(db, beforeRemixes);
    if (legacy) db.exec(readFileSync(new URL('./fixtures/legacy-0003-recipe-remixes.sql', import.meta.url), 'utf8'));
    populate(db);
    apply(db, additions);
    connect(db);
    assert.throws(() => db.exec("UPDATE kitchen_recipe_history SET document='{}' WHERE recipeId='D01'"), /immutable/);
    assert.throws(() => db.exec("UPDATE kitchen_recipes SET document='{}' WHERE id='D01'"), /revision/);
    db.exec("UPDATE kitchen_recipes SET document=json_set(document,'$.description','edited'),revision=revision+1 WHERE id='D01'");
    assert.equal(db.prepare("SELECT count(*) AS n FROM kitchen_recipe_history WHERE recipeId='D01'").get().n, 2);
    assert.throws(() => db.exec("UPDATE kitchen_remixes SET revision=revision+1 WHERE id='saved-link'"), /REMIX_REVIEW_CONFLICT/);
    db.exec("UPDATE kitchen_remixes SET source_revision=2,revision=revision+1 WHERE id='saved-link'");
    assert.equal(db.prepare("SELECT revision FROM kitchen_remixes WHERE id='saved-link'").get().revision, 2);
    assert.equal(db.prepare("SELECT recipeRevision FROM kitchen_favourites WHERE recipeId='D01'").get().recipeRevision, 1);
  }
});

test('generated snapshots form one chain and include the remix table after the baseline', () => {
  const journal = JSON.parse(read('meta/_journal.json'));
  assert.deepEqual(journal.entries.map((entry) => entry.tag), ['0003_drizzle_baseline','0004_recipe_remixes','0005_recipe_remix_guards','0006_flavor_profiles','0007_seed_flavor_profiles']);
  const snapshots = [3,4,5].map((index) => JSON.parse(read(`meta/${String(index).padStart(4, '0')}_snapshot.json`)));
  assert.equal(snapshots[0].tables.kitchen_remixes, undefined);
  assert.equal(snapshots[1].prevId, snapshots[0].id);
  assert.equal(snapshots[2].prevId, snapshots[1].id);
  assert.deepEqual(snapshots[2].tables, snapshots[1].tables);
  assert.equal(Object.keys(snapshots[1].tables.kitchen_remixes.foreignKeys).length, 2);
});
