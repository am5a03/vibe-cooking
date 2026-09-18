// Real SQLite and the methods used by Drizzle's D1 driver. NOT workerd/remote D1.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
export class TestD1 {
  constructor() { this.sqlite = new DatabaseSync(':memory:'); this.sqlite.exec('PRAGMA foreign_keys=ON'); this.sqlite.exec(readFileSync(new URL('../drizzle/migrations/0001_kitchen.sql', import.meta.url),'utf8')); }
  prepare(sql) { return new Statement(this, sql); }
  close() { this.sqlite.close(); }
  async batch(statements) { this.sqlite.exec('BEGIN'); try { const results = statements.map(s=>s.execute()); this.sqlite.exec('COMMIT'); return results; } catch(error) { this.sqlite.exec('ROLLBACK'); throw error; } }
}
class Statement {
  constructor(db, sql, params=[]) { this.db=db; this.sql=sql; this.params=params; }
  bind(...params) { return new Statement(this.db,this.sql,params); }
  execute() {
    const s=this.db.sqlite.prepare(this.sql);
    if(s.columns().length) return {results:s.all(...this.params).map(r=>({...r})),success:true,meta:{changes:0}};
    const r=s.run(...this.params); return {results:[],success:true,meta:{changes:Number(r.changes)}};
  }
  async all() { return this.execute(); }
  async run() { return this.execute(); }
  async first() { return this.execute().results[0] ?? null; }
  async raw(options) {
    const s=this.db.sqlite.prepare(this.sql), columns=s.columns().map(c=>c.name);
    const rows=s.all(...this.params).map(r=>columns.map(c=>r[c]));
    return options?.columnNames ? [columns,...rows] : rows;
  }
}
