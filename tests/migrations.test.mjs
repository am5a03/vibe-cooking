import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
const migration=readFileSync(new URL('../drizzle/migrations/0001_kitchen.sql',import.meta.url),'utf8');
test('migration is additive and records only advancing recipe revisions',()=>{
 const db=new DatabaseSync(':memory:');
 try {
  db.exec("PRAGMA foreign_keys=ON;CREATE TABLE user(id TEXT);INSERT INTO user VALUES('existing');");db.exec(migration);
  assert.equal(db.prepare('SELECT id FROM user').get().id,'existing');
  db.prepare('INSERT INTO kitchen_recipes(id,document) VALUES(?,?)').run('a','{"title":"one"}');
  assert.equal(db.prepare('SELECT count(*) AS n FROM kitchen_recipe_history').get().n,1);
  assert.throws(()=>db.exec("UPDATE kitchen_recipes SET document='{}' WHERE id='a'"));
  db.exec("UPDATE kitchen_recipes SET document='{}',revision=revision+1 WHERE id='a'");
  assert.equal(db.prepare('SELECT count(*) AS n FROM kitchen_recipe_history').get().n,2);
  assert.throws(()=>db.exec("INSERT INTO kitchen_preferences(id,document) VALUES('another','{}')"));
 } finally {db.close();}
});
