import type { Ingredient, Note, Preferences, RecipeDocument } from './types.ts';
export interface Snapshot { id: string; recipe: RecipeDocument; revision: number; createdAt: string; updatedAt: string }
export interface IngredientEntry { id: string; ingredient: Ingredient }
export interface Favourite { recipeId: string; recipeRevision: number; portions: number; recipe: RecipeDocument; createdAt: string }
export interface Page<T> { items: T[]; nextAfter: string | null }
export interface Versioned<T> { data: T; tag: string | null }
export type { Note, Preferences, RecipeDocument };
export class ClientError extends Error {
  constructor(message: string, public status: number, public code = '') { super(message); }
}
export async function api<T>(path: string, options: { method?: string; value?: unknown; tag?: string | null; signal?: AbortSignal } = {}): Promise<Versioned<T>> {
  if (!/^\/[a-z]/.test(path) || path.includes('..')) throw new Error('Invalid API path.');
  const headers = new Headers({ 'X-Kitchen-Request': '1' });
  if (options.value !== undefined) headers.set('Content-Type', 'application/json');
  if (options.tag) headers.set('If-Match', options.tag);
  const response = await fetch(`/api${path}`, {
    method: options.method ?? 'GET', headers, credentials: 'same-origin', cache: 'no-store', redirect: 'error',
    ...(options.value === undefined ? {} : { body: JSON.stringify(options.value) }),
    signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),
  });
  if (response.status === 204) return { data: undefined as T, tag: null };
  const envelope = await response.json() as { data?: T; error?: { message?: string; code?: string; requestId?: string } };
  if (!response.ok) {
    if (response.status === 401 && path !== '/session') window.dispatchEvent(new Event('kitchen:expired'));
    const code = envelope.error?.code ?? '';
    let message = envelope.error?.message ?? `Request failed (${response.status}).`;
    if (response.status === 412) message = 'This changed in another tab. Your edits are still here. Copy them or reload the latest version before saving again.';
    if (response.status >= 500 && envelope.error?.requestId) message += ` Reference: ${envelope.error.requestId}`;
    throw new ClientError(message, response.status, code);
  }
  if (!('data' in envelope)) throw new ClientError('The server returned an unexpected response.', 502);
  return { data: envelope.data as T, tag: response.headers.get('ETag') };
}
export function errorText(error: unknown): string {
  if (error instanceof Error && error.name === 'TimeoutError') return 'The request timed out. Your changes are still here. Try again.';
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}
export async function ingredients(signal?: AbortSignal): Promise<IngredientEntry[]> {
  const entries: IngredientEntry[] = [];
  const cursors = new Set<string>();
  let cursor = '';
  for (;;) {
    if (cursors.has(cursor)) throw new Error('The server repeated an ingredient cursor.');
    cursors.add(cursor);
    const { data } = await api<Page<IngredientEntry>>(`/ingredients?limit=100&after=${encodeURIComponent(cursor)}`, { signal });
    entries.push(...data.items);
    if (data.nextAfter === null) return entries;
    cursor = data.nextAfter;
  }
}
export function label(value: string): string {
  return value.replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
