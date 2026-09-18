import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema.ts';
export function getDb(binding: D1Database) { return drizzle(binding, { schema }); }
export type KitchenDb = ReturnType<typeof getDb>;
