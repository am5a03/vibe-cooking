import { requireThat } from './errors.ts';
import type { Ingredient, IngredientLine, Note, Preferences, RecipeDocument, Role, Serving } from './types.ts';

export function record(v: unknown, label = 'body'): Record<string, unknown> {
  requireThat(typeof v === 'object' && v !== null && !Array.isArray(v), `${label} must be an object.`);
  return v as Record<string, unknown>;
}
export function keys(v: Record<string, unknown>, allowed: string[], label: string): void {
  for (const key of Object.keys(v)) requireThat(allowed.includes(key), `${label}: unknown field ${key}.`);
}
export function text(v: unknown, label: string, max = 500, allowEmpty = false): string {
  requireThat(typeof v === 'string', `${label} must be a string.`);
  const s = v.trim();
  requireThat((allowEmpty || s.length > 0) && s.length <= max, `${label} has an invalid length (maximum ${max}).`);
  return s;
}
export function id(v: unknown, label = 'id'): string {
  const s = text(v, label, 80);
  requireThat(/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(s), `${label} must be an alphanumeric ID, with optional hyphens or underscores.`);
  return s;
}
function number(v: unknown, label: string, min: number, max: number, integer = false): number {
  requireThat(typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max && (!integer || Number.isInteger(v)), `${label} must be ${integer ? 'an integer' : 'a number'} between ${min} and ${max}.`);
  return v;
}
export function integer(v: unknown, label: string, min = 1, max = 100): number { return number(v, label, min, max, true); }
function list(v: unknown, label: string, max: number, min = 0): unknown[] {
  requireThat(Array.isArray(v) && v.length >= min && v.length <= max, `${label} must have ${min}–${max} entries.`); return v;
}
function strings(v: unknown, label: string, max: number, itemMax = 100): string[] {
  const values = list(v,label,max).map((s,i)=>text(s,`${label}[${i}]`,itemMax));
  requireThat(new Set(values).size === values.length, `${label} must not contain duplicates.`); return values;
}
export function ids(v: unknown, label: string, max = 30): string[] {
  return strings(v,label,max,80).map(s=>id(s,label));
}
function choice<T extends string>(v: unknown, options: readonly T[], label: string): T {
  requireThat(typeof v === 'string' && options.includes(v as T), `${label} must be one of: ${options.join(', ')}.`); return v as T;
}
export function ingredient(v: unknown): Ingredient {
  const o=record(v); keys(o,['name','aliases','components'],'ingredient');
  return {name:text(o.name,'name',120),aliases:strings(o.aliases,'aliases',15,120),components:ids(o.components,'components',20)};
}
function ingredientLine(v: unknown): IngredientLine {
  const o=record(v,'ingredient line'); keys(o,['ingredientId','quantity','unit','role','preparation'],'ingredient line');
  return {ingredientId:id(o.ingredientId,'ingredientId'),quantity:number(o.quantity,'quantity',0.001,100000),
    unit:text(o.unit,'unit',40),role:choice<Role>(o.role,['main','base','vegetables','fruit','sauce','finish'],'role'),
    preparation:text(o.preparation,'preparation',600,true)};
}
function serving(v: unknown): Serving {
  const o=record(v,'serving');
  keys(o,['portions','totalMinutes','activeMinutes','equipment','capacity','batches','trays','ingredients','steps'],'serving');
  const active=integer(o.activeMinutes,'activeMinutes',0,2880),total=integer(o.totalMinutes,'totalMinutes',1,2880);
  requireThat(active<=total,'activeMinutes cannot exceed totalMinutes.');
  return {portions:integer(o.portions,'portions',1,20),totalMinutes:total,activeMinutes:active,
    equipment:strings(o.equipment,'equipment',12,100),capacity:text(o.capacity,'capacity',800),
    batches:integer(o.batches,'batches',1,20),trays:integer(o.trays,'trays',0,20),
    ingredients:list(o.ingredients,'ingredients',60,1).map(ingredientLine),
    steps:list(o.steps,'steps',30,1).map((x)=>{const s=record(x,'step');keys(s,['title','instruction'],'step');
      return {title:text(s.title,'step.title',180),instruction:text(s.instruction,'step.instruction',5000)};})};
}
export function recipe(v: unknown): RecipeDocument {
  const o=record(v); keys(o,['schemaVersion','title','description','mode','main','flavor','method','status','reviewStatus','prep','prepNote','rationale','safetyNotes','storageNote','source','servings'],'recipe');
  requireThat(o.schemaVersion===1,'schemaVersion must be 1.');
  const servings=list(o.servings,'servings',12,1).map(serving);
  requireThat(new Set(servings.map(s=>s.portions)).size===servings.length,'Serving portion counts must be unique.');
  const main=id(o.main,'main');
  const ingredientSet=(s:Serving)=>[...new Set(s.ingredients.map(i=>i.ingredientId+':'+i.role))].sort().join('|');
  requireThat(servings.every(s=>ingredientSet(s)===ingredientSet(servings[0]!)), 'Serving profiles must use the same ingredient IDs and roles; use another recipe for ingredient substitutions.');
  requireThat(servings.every(s=>s.ingredients.some(i=>i.ingredientId===main&&i.role==='main')),'Every serving must include the main ingredient with role main.');
  requireThat(o.reviewStatus==='draft','This foundation only accepts reviewStatus=draft; it does not certify kitchen testing.');
  return {schemaVersion:1,title:text(o.title,'title',180),description:text(o.description,'description',1000,true),
    mode:choice(o.mode,['breakfast','dinner'],'mode'),main,flavor:id(o.flavor,'flavor'),method:id(o.method,'method'),
    status:choice(o.status,['active','archived'],'status'),reviewStatus:'draft',
    prep:choice(o.prep,['good','assemble-later','eat-fresh'],'prep'),prepNote:text(o.prepNote,'prepNote',2500,true),
    rationale:text(o.rationale,'rationale',2500,true),safetyNotes:strings(o.safetyNotes,'safetyNotes',10,2500),
    storageNote:text(o.storageNote,'storageNote',2500,true),source:text(o.source,'source',1000,true),servings};
}
export function preferences(v: unknown): Preferences {
  const o=record(v);keys(o,['likedIngredientIds','excludedIngredientIds','defaultDinnerPortions','defaultBreakfastPortions','maxMinutes'],'preferences');
  const liked=ids(o.likedIngredientIds,'likedIngredientIds'),excluded=ids(o.excludedIngredientIds,'excludedIngredientIds');
  requireThat(!liked.some(i=>excluded.includes(i)),'An ingredient cannot be both liked and excluded.');
  return {likedIngredientIds:liked,excludedIngredientIds:excluded,defaultDinnerPortions:integer(o.defaultDinnerPortions,'defaultDinnerPortions',1,20),
    defaultBreakfastPortions:integer(o.defaultBreakfastPortions,'defaultBreakfastPortions',1,20),maxMinutes:o.maxMinutes===null?null:integer(o.maxMinutes,'maxMinutes',1,2880)};
}
export function note(v: unknown): Note {
  const o=record(v);keys(o,['text','verdict'],'note');
  return {text:text(o.text,'text',12000,true),verdict:choice(o.verdict,['untried','repeat','adjust'],'verdict')};
}
export function references(r: RecipeDocument): string[] {
  return [...new Set(r.servings.flatMap(s=>s.ingredients.map(i=>i.ingredientId)))];
}
