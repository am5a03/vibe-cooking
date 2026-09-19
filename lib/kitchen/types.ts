export interface Env { API_TOKEN?: string; ALLOWED_ORIGIN?: string }
export interface Ingredient { name: string; aliases: string[]; components: string[] }
export type Role = 'main' | 'base' | 'vegetables' | 'fruit' | 'sauce' | 'finish';
export interface IngredientLine {
  ingredientId: string; quantity: number; unit: string; role: Role; preparation: string;
}
export interface Serving {
  portions: number; totalMinutes: number; activeMinutes: number;
  equipment: string[]; capacity: string; batches: number; trays: number;
  ingredients: IngredientLine[]; steps: { title: string; instruction: string }[];
}
export interface RecipeImage {
  src: string; alt: string; width: number; height: number;
  kind: 'illustration' | 'photo'; credit: string;
}
export interface RecipeDocument {
  image?: RecipeImage;
  schemaVersion: 1; title: string; description: string;
  mode: 'breakfast' | 'dinner'; main: string; flavor: string; method: string;
  status: 'active' | 'archived'; reviewStatus: 'draft';
  prep: 'good' | 'assemble-later' | 'eat-fresh'; prepNote: string;
  rationale: string; safetyNotes: string[]; storageNote: string;
  source: string; servings: Serving[];
}
export interface RecipeRow {
  id: string; document: string; revision: number; created_at: string; updated_at: string;
}
export interface Preferences {
  likedIngredientIds: string[]; excludedIngredientIds: string[];
  defaultDinnerPortions: number; defaultBreakfastPortions: number; maxMinutes: number | null;
}
export interface Note { text: string; verdict: 'untried' | 'repeat' | 'adjust' }
export type Axis = 'main' | 'flavor' | 'method';
