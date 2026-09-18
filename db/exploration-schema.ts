import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
// SQL migration 0003 also enforces reviewed-revision and single-axis invariants atomically.
export const remixes = sqliteTable('kitchen_remixes', {
  id: text('id').primaryKey(),
  sourceId: text('source_id').notNull(),
  targetId: text('target_id').notNull(),
  sourceRevision: integer('source_revision').notNull(),
  targetRevision: integer('target_revision').notNull(),
  axis: text('axis', { enum: ['main', 'flavor', 'method'] }).notNull(),
  revision: integer('revision').notNull().default(1),
  createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
}, (table) => [uniqueIndex('kitchen_remixes_pair').on(table.sourceId, table.targetId)]);
