// These are SQL shape/behaviour regressions, not a mock claiming to be D1's remote parser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';

const migrations = new URL('../drizzle/migrations/', import.meta.url);
const read = (name) => readFileSync(new URL(name, migrations), 'utf8');
const fixed = read('0005_recipe_remix_guards.sql');
const legacyFile = readFileSync(new URL('./fixtures/legacy-0003-recipe-remixes.sql', import.meta.url), 'utf8');
const legacy = legacyFile.slice(legacyFile.indexOf('CREATE TRIGGER'));
const baseRecipe = { status: 'active', mode: 'dinner', main: 'tofu', flavor: 'ginger-sesame', method: 'stir-fry', servings: [{ portions: 3 }] };
const targetRecipe = { ...baseRecipe, flavor: 'smoky-lime' };
const insert = "INSERT INTO kitchen_remixes(id,source_id,target_id,source_revision,target_revision,axis) VALUES('link','A','B',?,?,?)";
function setup(guards, source = baseRecipe, target = targetRecipe) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  db.exec(read('0001_kitchen.sql'));
  db.exec(read('0004_recipe_remixes.sql'));
  db.exec(guards);
  db.prepare('INSERT INTO kitchen_recipes(id,document) VALUES(?,?)').run('A', JSON.stringify(source));
  db.prepare('INSERT INTO kitchen_recipes(id,document) VALUES(?,?)').run('B', JSON.stringify(target));
  return db;
}
function attempt(run) {
  try { run(); return 'accepted'; }
  catch (error) {
    assert.match(error.message, /REMIX_REVIEW_CONFLICT/);
    return 'rejected';
  }
}

test('deployable guards avoid nested CASE terminators and migration checkouts use LF', () => {
  const sql = fixed.replace(/--[^\n]*/g, '');
  assert.doesNotMatch(sql, /\bCASE\b/i);
  assert.equal((sql.match(/\bBEGIN\b/g) ?? []).length, 2);
  assert.equal((sql.match(/\bEND\s*;/g) ?? []).length, 2);
  assert.equal((sql.match(/SELECT RAISE\(ABORT, 'REMIX_REVIEW_CONFLICT'\)/g) ?? []).length, 3);
  for (const name of readdirSync(migrations).filter((name) => name.endsWith('.sql'))) {
    assert.ok(!read(name).includes('\r'), `${name} must use LF line endings`);
  }
  const attributes = readFileSync(new URL('../.gitattributes', import.meta.url), 'utf8');
  assert.match(attributes, /^drizzle\/migrations\/\*\.sql text eol=lf$/m);
});

test('conditional SELECT guards preserve old insert decisions across valid and invalid reviews', () => {
  const cases = [
    { name: 'flavour', ok: true },
    { name: 'main', target: { ...baseRecipe, main: 'chicken' }, axis: 'main', ok: true },
    { name: 'method', target: { ...baseRecipe, method: 'roast' }, axis: 'method', ok: true },
    { name: 'no changed axis', target: baseRecipe },
    { name: 'two changed axes', target: { ...targetRecipe, method: 'roast' } },
    { name: 'wrong axis', axis: 'main' },
    { name: 'archived source', source: { ...baseRecipe, status: 'archived' } },
    { name: 'archived target', target: { ...targetRecipe, status: 'archived' } },
    { name: 'other meal', target: { ...targetRecipe, mode: 'breakfast' } },
    { name: 'no shared portions', target: { ...targetRecipe, servings: [{ portions: 1 }] } },
    { name: 'overlapping profiles', target: { ...targetRecipe, servings: [{ portions: 1 }, { portions: 3 }] }, ok: true },
    { name: 'stale source', sourceRevision: 2 },
    { name: 'stale target', targetRevision: 2 },
    { name: 'missing source mode', source: { ...baseRecipe, mode: undefined } },
    { name: 'missing target profiles', target: { ...targetRecipe, servings: [] } },
  ];
  for (const example of cases) {
    const decisions = [legacy, fixed].map((guards) => {
      const db = setup(guards, example.source, example.target);
      try {
        const decision = attempt(() => db.prepare(insert).run(example.sourceRevision ?? 1, example.targetRevision ?? 1, example.axis ?? 'flavor'));
        assert.equal(db.prepare('SELECT count(*) AS n FROM kitchen_remixes').get().n, example.ok ? 1 : 0, example.name);
        assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
        return decision;
      } finally { db.close(); }
    });
    assert.deepEqual(decisions, [example.ok ? 'accepted' : 'rejected', example.ok ? 'accepted' : 'rejected'], example.name);
  }
});

test('conditional SELECT guards preserve identity, revision and reconfirmation checks on update', () => {
  const cases = [
    { set: 'revision=revision+1', ok: true },
    { set: 'revision=revision' },
    { set: 'revision=revision+2' },
    { set: "id='other',revision=revision+1" },
    { set: "source_id='C',revision=revision+1" },
    { set: "target_id='C',revision=revision+1" },
    { set: "axis='method',revision=revision+1" },
    { set: 'source_revision=2,revision=revision+1' },
    { set: 'target_revision=2,revision=revision+1' },
    { set: 'revision=revision+1', changeTarget: true },
    { set: 'target_revision=2,revision=revision+1', changeTarget: true, ok: true },
  ];
  for (const example of cases) {
    for (const guards of [legacy, fixed]) {
      const db = setup(guards);
      try {
        db.prepare(insert).run(1, 1, 'flavor');
        if (example.changeTarget) db.exec("UPDATE kitchen_recipes SET revision=revision+1 WHERE id='B'");
        assert.equal(attempt(() => db.exec(`UPDATE kitchen_remixes SET ${example.set} WHERE id='link'`)), example.ok ? 'accepted' : 'rejected', example.set);
        assert.equal(db.prepare("SELECT revision FROM kitchen_remixes WHERE id='link'").get().revision, example.ok ? 2 : 1);
      } finally { db.close(); }
    }
  }
});

test('rerunning the corrected file preserves previously installed guards and saved content', () => {
  for (const installed of [legacy, fixed]) {
    const db = setup(installed);
    try {
      db.prepare(insert).run(1, 1, 'flavor');
      db.exec("INSERT INTO kitchen_favourites(recipeId,recipeRevision,portions,snapshot) SELECT id,revision,3,document FROM kitchen_recipes WHERE id='A'");
      db.exec("INSERT INTO kitchen_notes(recipeId,document) VALUES('A','{\"text\":\"keep note\",\"verdict\":\"repeat\"}')");
      const snapshot = () => ['kitchen_recipes', 'kitchen_recipe_history', 'kitchen_remixes', 'kitchen_favourites', 'kitchen_notes', 'kitchen_preferences'].map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all());
      const before = snapshot();
      const triggers = db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name").all();
      db.exec(fixed);
      db.exec(fixed);
      assert.deepEqual(snapshot(), before);
      assert.deepEqual(db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name").all(), triggers);
      assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    } finally { db.close(); }
  }
});

test('corrected SQL creates both guards and the migration marker within one SQLite transaction', () => {
  const db = setup('');
  try {
    db.exec('CREATE TABLE d1_migrations (name TEXT UNIQUE NOT NULL)');
    db.exec(`BEGIN;\n${fixed}\nINSERT INTO d1_migrations(name) VALUES('0005_recipe_remix_guards.sql');\nCOMMIT;`);
    assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='trigger' AND name IN ('kitchen_remix_insert','kitchen_remix_update')").get().n, 2);
    assert.equal(db.prepare('SELECT name FROM d1_migrations').get().name, '0005_recipe_remix_guards.sql');
    assert.equal(attempt(() => db.prepare(insert).run(2, 1, 'flavor')), 'rejected');
    db.prepare(insert).run(1, 1, 'flavor');
  } finally { db.close(); }
});
