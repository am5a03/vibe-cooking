import { isPublicImagePath } from './images.ts';
import { requireThat } from './errors.ts';
import type { Ingredient, IngredientLine, Note, Preferences, RecipeDocument, RecipeImage, Role, Serving } from './types.ts';

export function record(value: unknown, label = 'body'): Record<string, unknown> {
  requireThat(typeof value === 'object' && value !== null && !Array.isArray(value), `${label} must be an object.`);
  return value as Record<string, unknown>;
}
export function keys(value: Record<string, unknown>, allowed: string[], label: string): void {
  for (const key of Object.keys(value)) requireThat(allowed.includes(key), `${label}: unknown field ${key}.`);
}
export function text(value: unknown, label: string, max = 500, allowEmpty = false): string {
  requireThat(typeof value === 'string', `${label} must be a string.`);
  const result = value.trim();
  requireThat((allowEmpty || result.length > 0) && result.length <= max, `${label} has an invalid length (maximum ${max}).`);
  return result;
}
export function id(value: unknown, label = 'id'): string {
  const result = text(value, label, 80);
  requireThat(/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(result), `${label} must be an alphanumeric ID, with optional hyphens or underscores.`);
  return result;
}
function number(value: unknown, label: string, min: number, max: number, whole = false): number {
  requireThat(typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max && (!whole || Number.isInteger(value)), `${label} must be ${whole ? 'an integer' : 'a number'} between ${min} and ${max}.`);
  return value;
}
export function integer(value: unknown, label: string, min = 1, max = 100): number {
  return number(value, label, min, max, true);
}
function list(value: unknown, label: string, max: number, min = 0): unknown[] {
  requireThat(Array.isArray(value) && value.length >= min && value.length <= max, `${label} must have ${min}–${max} entries.`);
  return value;
}
function strings(value: unknown, label: string, max: number, itemMax = 100): string[] {
  const values = list(value, label, max).map((entry, index) => text(entry, `${label}[${index}]`, itemMax));
  requireThat(new Set(values).size === values.length, `${label} must not contain duplicates.`);
  return values;
}
export function ids(value: unknown, label: string, max = 30): string[] {
  return strings(value, label, max, 80).map((entry) => id(entry, label));
}
function choice<T extends string>(value: unknown, options: readonly T[], label: string): T {
  requireThat(typeof value === 'string' && options.includes(value as T), `${label} must be one of: ${options.join(', ')}.`);
  return value as T;
}
export function ingredient(value: unknown): Ingredient {
  const entry = record(value);
  keys(entry, ['name', 'aliases', 'components'], 'ingredient');
  return { name: text(entry.name, 'name', 120), aliases: strings(entry.aliases, 'aliases', 15, 120), components: ids(entry.components, 'components', 20) };
}
function ingredientLine(value: unknown): IngredientLine {
  const entry = record(value, 'ingredient line');
  keys(entry, ['ingredientId', 'quantity', 'unit', 'role', 'preparation'], 'ingredient line');
  return {
    ingredientId: id(entry.ingredientId, 'ingredientId'), quantity: number(entry.quantity, 'quantity', 0.001, 100000),
    unit: text(entry.unit, 'unit', 40), role: choice<Role>(entry.role, ['main', 'base', 'vegetables', 'fruit', 'sauce', 'finish'], 'role'),
    preparation: text(entry.preparation, 'preparation', 600, true),
  };
}
function serving(value: unknown): Serving {
  const entry = record(value, 'serving');
  keys(entry, ['portions', 'totalMinutes', 'activeMinutes', 'equipment', 'capacity', 'batches', 'trays', 'ingredients', 'steps'], 'serving');
  const active = integer(entry.activeMinutes, 'activeMinutes', 0, 2880);
  const total = integer(entry.totalMinutes, 'totalMinutes', 1, 2880);
  requireThat(active <= total, 'activeMinutes cannot exceed totalMinutes.');
  return {
    portions: integer(entry.portions, 'portions', 1, 20), totalMinutes: total, activeMinutes: active,
    equipment: strings(entry.equipment, 'equipment', 12, 100), capacity: text(entry.capacity, 'capacity', 800),
    batches: integer(entry.batches, 'batches', 1, 20), trays: integer(entry.trays, 'trays', 0, 20),
    ingredients: list(entry.ingredients, 'ingredients', 60, 1).map(ingredientLine),
    steps: list(entry.steps, 'steps', 30, 1).map((value) => {
      const step = record(value, 'step');
      keys(step, ['title', 'instruction'], 'step');
      return { title: text(step.title, 'step.title', 180), instruction: text(step.instruction, 'step.instruction', 5000) };
    }),
  };
}
export function image(value: unknown): RecipeImage {
  const entry = record(value, 'image');
  keys(entry, ['src', 'alt', 'width', 'height', 'kind', 'credit'], 'image');
  const src = text(entry.src, 'image.src', 240);
  requireThat(isPublicImagePath(src), 'Choose a public image under /images/recipes/ (SVG, WebP, PNG or JPEG). External URLs, queries and traversal are not supported.');
  return { src, alt: text(entry.alt, 'image.alt', 300),
    width: integer(entry.width, 'image.width', 1, 8192), height: integer(entry.height, 'image.height', 1, 8192),
    kind: choice(entry.kind, ['illustration', 'photo'], 'image.kind'),
    credit: text(entry.credit, 'image.credit', 300, true) };
}
export function recipe(value: unknown): RecipeDocument {
  const entry = record(value);
  keys(entry, ['schemaVersion', 'title', 'description', 'mode', 'main', 'flavor', 'method', 'status', 'reviewStatus', 'prep', 'prepNote', 'rationale', 'safetyNotes', 'storageNote', 'source', 'servings', 'image'], 'recipe');
  requireThat(entry.schemaVersion === 1, 'schemaVersion must be 1.');
  const servings = list(entry.servings, 'servings', 12, 1).map(serving);
  requireThat(new Set(servings.map((item) => item.portions)).size === servings.length, 'Serving portion counts must be unique.');
  const main = id(entry.main, 'main');
  const ingredientSet = (item: Serving) => [...new Set(item.ingredients.map((line) => `${line.ingredientId}:${line.role}`))].sort().join('|');
  requireThat(servings.every((item) => ingredientSet(item) === ingredientSet(servings[0])), 'Serving profiles must use the same ingredient IDs and roles; use another recipe for ingredient substitutions.');
  requireThat(servings.every((item) => item.ingredients.some((line) => line.ingredientId === main && line.role === 'main')), 'Every serving must include the main ingredient with role main.');
  requireThat(entry.reviewStatus === 'draft', 'This foundation only accepts reviewStatus=draft; it does not certify kitchen testing.');
  return {
    ...(entry.image === undefined ? {} : { image: image(entry.image) }),
    schemaVersion: 1, title: text(entry.title, 'title', 180), description: text(entry.description, 'description', 1000, true),
    mode: choice(entry.mode, ['breakfast', 'dinner'], 'mode'), main, flavor: id(entry.flavor, 'flavor'), method: id(entry.method, 'method'),
    status: choice(entry.status, ['active', 'archived'], 'status'), reviewStatus: 'draft',
    prep: choice(entry.prep, ['good', 'assemble-later', 'eat-fresh'], 'prep'), prepNote: text(entry.prepNote, 'prepNote', 2500, true),
    rationale: text(entry.rationale, 'rationale', 2500, true), safetyNotes: strings(entry.safetyNotes, 'safetyNotes', 10, 2500),
    storageNote: text(entry.storageNote, 'storageNote', 2500, true), source: text(entry.source, 'source', 1000, true), servings,
  };
}
export function preferences(value: unknown): Preferences {
  const entry = record(value);
  keys(entry, ['likedIngredientIds', 'excludedIngredientIds', 'defaultDinnerPortions', 'defaultBreakfastPortions', 'maxMinutes'], 'preferences');
  const liked = ids(entry.likedIngredientIds, 'likedIngredientIds');
  const excluded = ids(entry.excludedIngredientIds, 'excludedIngredientIds');
  requireThat(!liked.some((item) => excluded.includes(item)), 'An ingredient cannot be both liked and excluded.');
  return {
    likedIngredientIds: liked, excludedIngredientIds: excluded,
    defaultDinnerPortions: integer(entry.defaultDinnerPortions, 'defaultDinnerPortions', 1, 20),
    defaultBreakfastPortions: integer(entry.defaultBreakfastPortions, 'defaultBreakfastPortions', 1, 20),
    maxMinutes: entry.maxMinutes === null ? null : integer(entry.maxMinutes, 'maxMinutes', 1, 2880),
  };
}
export function note(value: unknown): Note {
  const entry = record(value);
  keys(entry, ['text', 'verdict'], 'note');
  return { text: text(entry.text, 'text', 12000, true), verdict: choice(entry.verdict, ['untried', 'repeat', 'adjust'], 'verdict') };
}
export function references(recipe: RecipeDocument): string[] {
  return [...new Set(recipe.servings.flatMap((serving) => serving.ingredients.map((line) => line.ingredientId)))];
}
