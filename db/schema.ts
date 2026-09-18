import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core';

const timestamp = () =>
  text()
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`);

// JSON documents are authoritative; SQL indexes project searchable fields.
export const ingredients = sqliteTable(
  'kitchen_ingredients',
  {
    id: text().primaryKey(),
    document: text().notNull(),
    createdAt: timestamp(),
  },
  (t) => [check('ingredient_json', sql`json_valid(${t.document})`)],
);

export const recipes = sqliteTable(
  'kitchen_recipes',
  {
    id: text().primaryKey(),
    document: text().notNull(),
    revision: integer().notNull().default(1),
    createdAt: timestamp(),
    updatedAt: timestamp(),
  },
  (t) => [
    index('kitchen_recipes_mode').on(sql`json_extract(${t.document}, '$.mode')`, t.id),
    index('kitchen_recipes_status').on(sql`json_extract(${t.document}, '$.status')`, t.id),
    check('recipe_json', sql`json_valid(${t.document})`),
    check('recipe_revision', sql`${t.revision} > 0`),
  ],
);

export const recipeHistory = sqliteTable(
  'kitchen_recipe_history',
  {
    recipeId: text()
      .notNull()
      .references(() => recipes.id),
    revision: integer().notNull(),
    document: text().notNull(),
    createdAt: timestamp(),
  },
  (t) => [
    primaryKey({ columns: [t.recipeId, t.revision] }),
    check('recipe_history_json', sql`json_valid(${t.document})`),
  ],
);

export const preferences = sqliteTable(
  'kitchen_preferences',
  {
    id: text().primaryKey(),
    document: text().notNull(),
    revision: integer().notNull().default(1),
    updatedAt: timestamp(),
  },
  (t) => [
    check('singleton_preferences', sql`${t.id} = 'default'`),
    check('preferences_json', sql`json_valid(${t.document})`),
    check('preferences_revision', sql`${t.revision} > 0`),
  ],
);

export const favourites = sqliteTable(
  'kitchen_favourites',
  {
    recipeId: text()
      .primaryKey()
      .references(() => recipes.id),
    recipeRevision: integer().notNull(),
    portions: integer().notNull(),
    snapshot: text().notNull(),
    createdAt: timestamp(),
  },
  (t) => [
    foreignKey({
      columns: [t.recipeId, t.recipeRevision],
      foreignColumns: [recipeHistory.recipeId, recipeHistory.revision],
    }),
    check('favourite_portions', sql`${t.portions} > 0`),
    check('favourite_snapshot_json', sql`json_valid(${t.snapshot})`),
  ],
);

export const notes = sqliteTable(
  'kitchen_notes',
  {
    recipeId: text()
      .primaryKey()
      .references(() => recipes.id),
    document: text().notNull(),
    revision: integer().notNull().default(1),
    updatedAt: timestamp(),
  },
  (t) => [
    check('note_json', sql`json_valid(${t.document})`),
    check('note_revision', sql`${t.revision} > 0`),
  ],
);

export const browserSessions = sqliteTable(
  'kitchen_browser_sessions',
  {
    tokenHash: text().primaryKey(),
    expiresAt: integer().notNull(),
  },
  (t) => [index('kitchen_browser_sessions_expiry').on(t.expiresAt)],
);

export const loginLimits = sqliteTable(
  'kitchen_login_limits',
  {
    key: text().primaryKey(),
    attempts: integer().notNull(),
    resetsAt: integer().notNull(),
  },
  (t) => [index('kitchen_login_limits_expiry').on(t.resetsAt)],
);

// Explicit SQL names preserve the existing remix API's snake_case storage contract.
// Review-concurrency triggers live in a custom SQL migration, not the snapshot.
export const remixes = sqliteTable(
  'kitchen_remixes',
  {
    id: text('id').primaryKey().notNull(),
    sourceId: text('source_id').notNull(),
    targetId: text('target_id').notNull(),
    sourceRevision: integer('source_revision').notNull(),
    targetRevision: integer('target_revision').notNull(),
    axis: text('axis', { enum: ['main', 'flavor', 'method'] }).notNull(),
    revision: integer('revision').notNull().default(1),
    createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => [
    index('kitchen_remixes_target').on(t.targetId),
    unique('kitchen_remixes_pair').on(t.sourceId, t.targetId),
    check('remix_axis', sql`${t.axis} IN ('main','flavor','method')`),
    check('remix_revision', sql`${t.revision} > 0`),
    check('remix_canonical_pair', sql`${t.sourceId} < ${t.targetId}`),
    foreignKey({ columns: [t.sourceId, t.sourceRevision], foreignColumns: [recipeHistory.recipeId, recipeHistory.revision] }),
    foreignKey({ columns: [t.targetId, t.targetRevision], foreignColumns: [recipeHistory.recipeId, recipeHistory.revision] }),
  ],
);
