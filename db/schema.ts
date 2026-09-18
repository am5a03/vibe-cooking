import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const timestamp = () => text().notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`);
// JSON documents are authoritative; SQL indexes project searchable fields.
export const ingredients = sqliteTable('kitchen_ingredients', {
  id: text().primaryKey(), document: text().notNull(), createdAt: timestamp(),
});
export const recipes = sqliteTable('kitchen_recipes', {
  id: text().primaryKey(), document: text().notNull(), revision: integer().notNull().default(1),
  createdAt: timestamp(), updatedAt: timestamp(),
}, (t) => [
  index('kitchen_recipes_mode').on(sql`json_extract(${t.document}, '$.mode')`, t.id),
  index('kitchen_recipes_status').on(sql`json_extract(${t.document}, '$.status')`, t.id),
  check('recipe_json', sql`json_valid(${t.document})`),
  check('recipe_revision', sql`${t.revision} > 0`),
]);
export const recipeHistory = sqliteTable('kitchen_recipe_history', {
  recipeId: text().notNull().references(() => recipes.id), revision: integer().notNull(),
  document: text().notNull(), createdAt: timestamp(),
}, (t) => [primaryKey({ columns: [t.recipeId, t.revision] })]);
export const preferences = sqliteTable('kitchen_preferences', {
  id: text().primaryKey(), document: text().notNull(), revision: integer().notNull().default(1),
  updatedAt: timestamp(),
}, (t) => [check('singleton_preferences', sql`${t.id} = 'default'`)]);
export const favourites = sqliteTable('kitchen_favourites', {
  recipeId: text().primaryKey().references(() => recipes.id), recipeRevision: integer().notNull(),
  portions: integer().notNull(), snapshot: text().notNull(), createdAt: timestamp(),
});
export const notes = sqliteTable('kitchen_notes', {
  recipeId: text().primaryKey().references(() => recipes.id), document: text().notNull(),
  revision: integer().notNull().default(1), updatedAt: timestamp(),
});
