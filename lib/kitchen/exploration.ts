import type { Axis, Ingredient, IngredientLine, Preferences, RecipeDocument, Serving } from './types.ts';

export interface MealSnapshot {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  recipe: RecipeDocument;
}
export interface DiscoveryConstraints {
  mode: 'breakfast' | 'dinner';
  portions: number;
  maxMinutes: number | null;
  requiredIngredient: string | null;
}
export interface DiscoveryRequest extends DiscoveryConstraints {
  seen: string[];
  seed: string;
}
export interface IngredientEntry { id: string; ingredient: Ingredient }
export type Ineligible = 'archived' | 'meal-type' | 'portions' | 'time' | 'required-ingredient' | 'excluded-ingredient' | 'incomplete-ingredients';

/** Follow declared compound ingredients. Missing records/cycles never imply safety. */
export function ingredientResolver(entries: IngredientEntry[]) {
  const graph = new Map(entries.map((entry) => [entry.id, entry.ingredient]));
  const cache = new Map<string, { ids: Set<string>; complete: boolean }>();
  return (root: string) => {
    const found = cache.get(root);
    if (found) return found;
    const ids = new Set<string>();
    const visiting = new Set<string>();
    let complete = true;
    function visit(id: string, depth: number) {
      if (depth > 64 || visiting.has(id)) { complete = false; return; }
      if (ids.has(id)) return;
      const entry = graph.get(id);
      if (!entry) { complete = false; return; }
      ids.add(id); visiting.add(id);
      for (const component of entry.components) visit(component, depth + 1);
      visiting.delete(id);
    }
    visit(root, 0);
    const result = { ids, complete };
    cache.set(root, result);
    return result;
  };
}
export function assessMeal(
  recipe: RecipeDocument,
  constraints: DiscoveryConstraints,
  preferences: Preferences,
  resolve: ReturnType<typeof ingredientResolver>,
): { reason: Ineligible } | { serving: Serving; liked: string[] } {
  if (recipe.status !== 'active') return { reason: 'archived' };
  if (recipe.mode !== constraints.mode) return { reason: 'meal-type' };
  const serving = recipe.servings.find((profile) => profile.portions === constraints.portions);
  if (!serving) return { reason: 'portions' };
  if (constraints.maxMinutes !== null && serving.totalMinutes > constraints.maxMinutes) return { reason: 'time' };
  // Required means a direct, substantive recipe component, not hidden seasoning or garnish.
  if (constraints.requiredIngredient && !serving.ingredients.some((line) =>
    line.ingredientId === constraints.requiredIngredient && ['main', 'base', 'vegetables', 'fruit'].includes(line.role) && line.quantity > 0)) {
    return { reason: 'required-ingredient' };
  }
  const present = new Set<string>();
  for (const line of serving.ingredients) {
    const expanded = resolve(line.ingredientId);
    if (!expanded.complete) return { reason: 'incomplete-ingredients' };
    for (const id of expanded.ids) present.add(id);
  }
  if (preferences.excludedIngredientIds.some((id) => present.has(id))) return { reason: 'excluded-ingredient' };
  return { serving, liked: preferences.likedIngredientIds.filter((id) => present.has(id)) };
}
function randomUnit(value: string): number {
  let hash = 2166136261;
  for (const char of value) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  hash ^= hash >>> 16; hash = Math.imul(hash, 0x7feb352d); hash ^= hash >>> 15;
  return ((hash >>> 0) + 1) / 4294967297;
}
export function discoverMeals(meals: MealSnapshot[], entries: IngredientEntry[], preferences: Preferences, request: DiscoveryRequest) {
  const resolve = ingredientResolver(entries);
  const seen = new Set(request.seen);
  const counts: Partial<Record<Ineligible, number>> = {};
  const eligible: { snapshot: MealSnapshot; liked: string[]; repeated: boolean; score: number }[] = [];
  for (const snapshot of meals) {
    const result = assessMeal(snapshot.recipe, request, preferences, resolve);
    if ('reason' in result) { counts[result.reason] = (counts[result.reason] ?? 0) + 1; continue; }
    const weight = 1 + Math.min(result.liked.length, 3) * 0.5;
    eligible.push({ snapshot, liked: result.liked, repeated: seen.has(snapshot.id), score: -Math.log(randomUnit(`${request.seed}:${snapshot.id}`)) / weight });
  }
  eligible.sort((a, b) => Number(a.repeated) - Number(b.repeated) || a.score - b.score || a.snapshot.id.localeCompare(b.snapshot.id));
  const selected = eligible.slice(0, 3).map(({ score: _score, ...item }) => item);
  return { items: selected, eligibleCount: eligible.length, counts, constraints: {
    mode: request.mode, portions: request.portions, maxMinutes: request.maxMinutes, requiredIngredient: request.requiredIngredient,
  }, seed: request.seed, repeatedCount: selected.filter((item) => item.repeated).length };
}
/** Tags identify candidates; only an explicit, version-pinned connection approves one. */
export function variationAxis(a: RecipeDocument, b: RecipeDocument): Axis | null {
  if (a.mode !== b.mode || a.status !== 'active' || b.status !== 'active') return null;
  const changed = (['main', 'flavor', 'method'] as const).filter((axis) => a[axis] !== b[axis]);
  return changed.length === 1 ? changed[0] : null;
}
export function commonPortions(a: RecipeDocument, b: RecipeDocument) {
  return a.servings.map((s) => s.portions).filter((n) => b.servings.some((s) => s.portions === n)).sort((x, y) => x - y);
}
export interface ComponentChange {
  ingredientId: string;
  role: IngredientLine['role'];
  kind: 'kept' | 'added' | 'removed' | 'changed';
  before: IngredientLine[];
  after: IngredientLine[];
}
export function compareServings(before: Serving, after: Serving): ComponentChange[] {
  const group = (lines: IngredientLine[]) => {
    const map = new Map<string, IngredientLine[]>();
    for (const line of lines) {
      const key = `${line.ingredientId}:${line.role}`;
      map.set(key, [...(map.get(key) ?? []), line]);
    }
    return map;
  };
  const left = group(before.ingredients);
  const right = group(after.ingredients);
  const normalize = (lines: IngredientLine[]) => JSON.stringify(lines.map((line) =>
    [line.quantity, line.unit, line.preparation]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
  return [...new Set([...left.keys(), ...right.keys()])].map((key) => {
    const oldLines = left.get(key) ?? [];
    const newLines = right.get(key) ?? [];
    const line = oldLines[0] ?? newLines[0];
    const kind = !oldLines.length ? 'added' : !newLines.length ? 'removed' : normalize(oldLines) === normalize(newLines) ? 'kept' : 'changed';
    return { ingredientId: line.ingredientId, role: line.role, kind, before: oldLines, after: newLines };
  });
}
