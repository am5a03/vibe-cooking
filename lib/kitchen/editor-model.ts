import type { IngredientLine, RecipeDocument, Serving } from './types.ts';

// Symbol metadata stays in editor memory only: JSON and API field validation do not
// contain these keys. Object spreads preserve identity while controlled fields change.
export const EDIT_KEY: unique symbol = Symbol('editor-row');
export type Keyed<T> = T & { [EDIT_KEY]: string };
export type EditorServing = Keyed<Omit<Serving, 'ingredients' | 'steps'> & {
  ingredients: Keyed<IngredientLine>[];
  steps: Keyed<Serving['steps'][number]>[];
}>;
export type EditorDocument = Omit<RecipeDocument, 'servings'> & { servings: EditorServing[] };
export function keyed<T extends object>(value: T): Keyed<T> {
  return { ...value, [EDIT_KEY]: crypto.randomUUID() };
}
export function editableServing(value: Serving): EditorServing {
  return keyed({ ...value, ingredients: value.ingredients.map(keyed), steps: value.steps.map(keyed) });
}
export function editable(value: RecipeDocument): EditorDocument {
  return { ...value, servings: value.servings.map(editableServing) };
}
export function emptyRecipe(): EditorDocument {
  return editable({ schemaVersion: 1, title: '', description: '', mode: 'dinner', main: '', flavor: 'lemon-herb', method: 'pan-sear', status: 'active', reviewStatus: 'draft', prep: 'good', prepNote: '', rationale: '', safetyNotes: [], storageNote: '', source: 'Personal recipe draft.', servings: [{ portions: 3, activeMinutes: 20, totalMinutes: 30, equipment: ['stovetop', 'pan'], capacity: 'One large pan; cook in batches when necessary.', batches: 1, trays: 0, ingredients: [{ ingredientId: '', quantity: 1, unit: 'g', role: 'main', preparation: '' }], steps: [{ title: 'Prepare', instruction: '' }] }] });
}
