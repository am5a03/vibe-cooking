import * as V from "./validation.ts";
import { requireThat } from "./errors.ts";

export const FLAVOR_STYLES = {
  chinese: "Chinese-inspired",
  japanese: "Japanese-inspired",
  korean: "Korean-inspired",
  indian: "Indian-inspired",
  mediterranean: "Mediterranean-inspired",
  italian: "Italian-inspired",
  french: "French-inspired",
  "cross-style": "Cross-style",
  "sweet-breakfast": "Sweet breakfast",
} as const;
export type FlavorStyle = keyof typeof FLAVOR_STYLES;
export const APPLICATIONS = [
  "dressing",
  "glaze",
  "marinade",
  "dry-seasoning",
  "cooked-sauce",
  "finishing-mixture",
] as const;
export interface FlavorProfile {
  name: string;
  description: string;
  styles: FlavorStyle[];
  tasteTags: string[];
  keyIngredients: { name: string; ingredientId: string | null }[];
  applications: (typeof APPLICATIONS)[number][];
  usage: string;
}
export interface FlavorEntry {
  id: string;
  origin: "builtin" | "custom";
  revision: number;
  profile: FlavorProfile;
}
export function validateFlavor(value: unknown): FlavorProfile {
  const p = V.record(value, "flavour profile");
  V.keys(
    p,
    ["name", "description", "styles", "tasteTags", "keyIngredients", "applications", "usage"],
    "flavour profile",
  );
  const list = (value: unknown, label: string, max: number): unknown[] => {
    requireThat(
      Array.isArray(value) && value.length <= max,
      `${label} must be an array with at most ${max} entries.`,
    );
    return value;
  };
  const words = (value: unknown, label: string, max: number, length = 60): string[] => {
    const items = list(value, label, max).map((item) => V.text(item, label, length));
    requireThat(
      new Set(items.map((item) => item.toLowerCase())).size === items.length,
      `${label} must not contain duplicates.`,
    );
    return items;
  };
  const styles = words(p.styles, "Styles", 9);
  requireThat(
    styles.every((style) => Object.hasOwn(FLAVOR_STYLES, style)),
    "Choose a supported style.",
  );
  const applications = words(p.applications, "Applications", 6);
  requireThat(
    applications.every((item) => APPLICATIONS.includes(item as (typeof APPLICATIONS)[number])),
    "Choose a supported application.",
  );
  const keyIngredients = list(p.keyIngredients, "Key ingredients", 20).map((value) => {
    const ingredient = V.record(value, "Key ingredient");
    V.keys(ingredient, ["name", "ingredientId"], "Key ingredient");
    return {
      name: V.text(ingredient.name, "Ingredient name", 120),
      ingredientId: ingredient.ingredientId === null ? null : V.id(ingredient.ingredientId),
    };
  });
  requireThat(
    new Set(keyIngredients.map((item) => item.name.toLowerCase())).size === keyIngredients.length,
    "Key ingredient names must be distinct.",
  );
  const refs = keyIngredients.flatMap((item) =>
    item.ingredientId === null ? [] : [item.ingredientId],
  );
  requireThat(new Set(refs).size === refs.length, "An ingredient reference cannot be repeated.");
  return {
    name: V.text(p.name, "Flavour name", 120),
    description: V.text(p.description, "Description", 800, true),
    styles: styles as FlavorStyle[],
    tasteTags: words(p.tasteTags, "Taste tags", 8),
    keyIngredients,
    applications: applications as FlavorProfile["applications"],
    usage: V.text(p.usage, "Application notes", 1600, true),
  };
}
export function friendlyLabel(id: string): string {
  return id.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
export function flavorName(id: string, entries: FlavorEntry[]): string {
  return (
    entries.find((entry) => entry.id === id)?.profile.name ??
    (/^custom-[0-9a-f-]{36}$/i.test(id) ? "Custom combination" : friendlyLabel(id))
  );
}
export function matchesFlavor(entry: FlavorEntry, query: string, style: string): boolean {
  if (style === "mine" && entry.origin !== "custom") return false;
  if (style && style !== "mine" && !entry.profile.styles.includes(style as FlavorStyle))
    return false;
  const profile = entry.profile;
  const haystack = [
    profile.name,
    profile.description,
    ...profile.tasteTags,
    ...profile.keyIngredients.map((item) => item.name),
    ...profile.styles.map((key) => FLAVOR_STYLES[key]),
    ...profile.applications.map(friendlyLabel),
  ]
    .join(" ")
    .toLowerCase();
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .every((word) => haystack.includes(word));
}
export const TECHNIQUES = {
  roast: "Roast",
  "stir-fry": "Stir-fry",
  "pan-sear": "Pan-sear",
  simmer: "Simmer",
  steam: "Steam",
  bake: "Bake",
  grill: "Grill",
  braise: "Braise",
  "no-cook": "No-cook",
} as const;
export const BREAKFAST_FORMATS = {
  toast: "Toast",
  bowl: "Bowl",
  wrap: "Wrap",
  pancake: "Pancake",
  congee: "Congee",
  porridge: "Porridge",
  omelette: "Omelette",
  sandwich: "Sandwich",
} as const;
export const blankFlavor = (): FlavorProfile => ({
  name: "",
  description: "",
  styles: [],
  tasteTags: [],
  keyIngredients: [],
  applications: [],
  usage: "",
});
