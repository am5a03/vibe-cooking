import type { Axis } from './types';
import type { ComponentChange, DiscoveryConstraints, Ineligible, MealSnapshot } from './exploration';
export type { DiscoveryConstraints, MealSnapshot, ComponentChange };
export interface DiscoveryResult {
  items: { snapshot: MealSnapshot; liked: string[]; repeated: boolean }[];
  eligibleCount: number;
  counts: Partial<Record<Ineligible, number>>;
  invalidCount: number;
  constraints: DiscoveryConstraints;
  preferenceRevision: number;
  excludedIngredientIds: string[];
  repeatedCount: number;
}
export interface RemixOption {
  connectionId: string;
  axis: Axis;
  target: MealSnapshot;
  differences: ComponentChange[];
}
export interface RemixResult {
  source: MealSnapshot;
  items: RemixOption[];
  constraints: DiscoveryConstraints;
  excludedIngredientIds: string[];
  blockedSource: string | null;
  staleCount: number;
  filteredCount: number;
}
export interface VariationCandidate { target: MealSnapshot; axis: Axis; portions: number[] }
export interface VariationConnection {
  id: string;
  revision: number;
  axis: Axis;
  sourceId: string;
  sourceRevision: number;
  targetId: string;
  targetRevision: number;
  target: MealSnapshot;
  stale: boolean;
  currentAxis: Axis | null;
  portions: number[];
  tag: string;
}
export interface VariationsResult {
  source: MealSnapshot;
  connections: VariationConnection[];
  candidates: VariationCandidate[];
  invalidCount: number;
}
