// Real SQLite plus the methods consumed by Drizzle's D1 driver; not workerd/remote D1.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
export class TestD1 {
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec('PRAGMA foreign_keys=ON');
    this.sqlite.exec(readFileSync(new URL('../drizzle/migrations/0001_kitchen.sql', import.meta.url), 'utf8'));
  }
  prepare(sql) { return new Statement(this, sql); }
  close() { this.sqlite.close(); }
  async batch(statements) {
    this.sqlite.exec('BEGIN');
    try {
      const results = statements.map((statement) => statement.execute());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }
}
class Statement {
  constructor(db, sql, params = []) { this.db = db; this.sql = sql; this.params = params; }
  bind(...params) { return new Statement(this.db, this.sql, params); }
  execute() {
    const statement = this.db.sqlite.prepare(this.sql);
    if (statement.columns().length) return { results: statement.all(...this.params).map((row) => ({ ...row })), success: true, meta: { changes: 0 } };
    const result = statement.run(...this.params);
    return { results: [], success: true, meta: { changes: Number(result.changes) } };
  }
  async all() { return this.execute(); }
  async run() { return this.execute(); }
  async first() { return this.execute().results[0] ?? null; }
  async raw(options) {
    const statement = this.db.sqlite.prepare(this.sql);
    const columns = statement.columns().map((column) => column.name);
    const rows = statement.all(...this.params).map((row) => columns.map((column) => row[column]));
    return options?.columnNames ? [columns, ...rows] : rows;
  }
}
