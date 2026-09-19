import process from 'node:process';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { image, recipe, record, id } from '../lib/kitchen/validation.ts';
import type { RecipeDocument, RecipeImage } from '../lib/kitchen/types.ts';

export interface CoverEntry { recipeId: string; title: string; image: RecipeImage }
interface Saved { id: string; recipe: RecipeDocument; revision: number }
interface Addition { entry: CoverEntry; current: Saved; tag: string }
const cooking = (doc: RecipeDocument) => JSON.stringify([doc.schemaVersion, doc.mode, doc.main, doc.flavor, doc.method, doc.servings]);
export function attachmentDecision(current: RecipeDocument, expected: RecipeDocument): string | null {
  if (current.image) return 'already has a cover (kept)';
  if (current.status !== 'active') return 'archived (kept)';
  if (cooking(current) !== cooking(expected)) return 'cooking content differs from the seed; choose a cover in the editor';
  return null;
}

/** Explicit opt-in content edits through the regular ETag API, never SQL or reseeding. */
export async function attachSeedImages(options: {
  base: string; token: string; apply: boolean; covers: CoverEntry[];
  seeds: { id: string; recipe: RecipeDocument }[];
  fetcher?: typeof fetch; log?: (message: string) => void;
}) {
  const base = new URL(options.base);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if (base.username || base.password || base.search || base.hash || base.pathname !== '/' ||
      !(base.protocol === 'https:' || (loopback && base.protocol === 'http:'))) {
    throw new Error('KITCHEN_URL must be an HTTPS origin, or loopback HTTP, with no path or credentials.');
  }
  if (!options.token || options.token.length < 32 || options.token.length > 512 || /\s/.test(options.token)) {
    throw new Error('Load your kitchen API_TOKEN (not a Cloudflare deployment token).');
  }
  const fetcher = options.fetcher ?? fetch;
  const log = options.log ?? console.log;
  const expected = new Map(options.seeds.map(row => [id(row.id), recipe(row.recipe)]));
  if (new Set(options.covers.map(row => row.recipeId)).size !== options.covers.length) throw new Error('Duplicate cover IDs.');
  // Validate the whole manifest before the first request.
  const covers = options.covers.map(row => {
    const recipeId = id(row.recipeId);
    if (!expected.has(recipeId)) throw new Error(`No seed reference for ${recipeId}.`);
    return { ...row, recipeId, image: image(row.image) };
  });
  log(`Target: ${base.origin} (${options.apply ? 'APPLY — missing covers only' : 'PREVIEW — no writes'})`);
  async function api(path: string, init: RequestInit = {}) {
    return fetcher(new URL(`/api${path}`, base), { ...init, redirect: 'error',
      headers: { Authorization: `Bearer ${options.token}`, ...init.headers }, signal: AbortSignal.timeout(20000) });
  }
  const additions: Addition[] = [];
  for (const entry of covers) {
    const response = await api(`/recipes/${entry.recipeId}`);
    if (response.status === 404) { log(`MISSING ${entry.recipeId} — not imported`); continue; }
    if (!response.ok) throw new Error(`Recipe preflight failed (${response.status}). No covers were written. Check KITCHEN_URL and the local/deployed key.`);
    const envelope = record(await response.json(), 'API response');
    const data = record(envelope.data, 'recipe snapshot');
    if (data.id !== entry.recipeId) throw new Error('Unexpected recipe ID from API. Nothing written.');
    const current = { id: entry.recipeId, recipe: recipe(data.recipe), revision: Number(data.revision) };
    const reference = expected.get(entry.recipeId);
    if (!reference) throw new Error('Missing seed reference.');
    const skip = attachmentDecision(current.recipe, reference);
    if (skip) { log(`SKIP ${entry.recipeId} — ${skip}`); continue; }
    const tag = response.headers.get('etag');
    if (!tag) throw new Error('The API did not provide an ETag. Nothing written.');
    // Assets are intentionally public. No private key is sent to the asset URL.
    const asset = await fetcher(new URL(entry.image.src, base), { method: 'HEAD', redirect: 'error', signal: AbortSignal.timeout(20000) });
    if (!asset.ok || !asset.headers.get('content-type')?.startsWith('image/')) {
      throw new Error(`Cover unavailable: ${entry.image.src}. Deploy/start the updated app first. No covers were written.`);
    }
    log(`ADD ${entry.recipeId} — ${current.recipe.title} → ${entry.image.src}`);
    additions.push({ entry, current, tag });
  }
  log(`${additions.length} missing covers ready. Existing covers and modified cooking content are never replaced.`);
  if (!options.apply) { log('Preview complete. Re-run with --apply after reviewing; it rechecks the current data.'); return 0; }
  log('Each successful change creates a recipe revision. Earlier favourites stay unchanged; affected remix links need re-review.');
  let written = 0;
  for (const { entry, current, tag } of additions) {
    const response = await api(`/recipes/${entry.recipeId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': tag },
      body: JSON.stringify({ ...current.recipe, image: entry.image }),
    });
    if (!response.ok) throw new Error(`Stopped at ${entry.recipeId}: HTTP ${response.status}. ${written} earlier covers remain attached. No overwrite/retry was attempted. Preview again before resuming.`);
    written++; log(`ATTACHED ${entry.recipeId}`);
  }
  log(`Finished: ${written} covers attached. No recipes were created or deleted.`);
  return written;
}
async function main() {
  const args: string[] = process.argv.slice(2);
  if (args.length > 1 || args.some(arg => !['--preview', '--apply'].includes(arg))) {
    throw new Error('Use covers:attach with --preview (default) or --apply. This command only attaches covers to the known personal seed pack.');
  }
  const covers = JSON.parse(await readFile(new URL('../lib/kitchen/seed-covers.json', import.meta.url), 'utf8')) as CoverEntry[];
  const seeds = JSON.parse(await readFile(new URL('../examples/personal-kitchen-seed-v1.json', import.meta.url), 'utf8'));
  await attachSeedImages({ base: process.env.KITCHEN_URL ?? 'http://localhost:3000', token: process.env.API_TOKEN ?? '', apply: args.includes('--apply'), covers, seeds: seeds.recipes });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error instanceof Error ? error.message : 'Cover attachment failed.'); process.exitCode = 1; });
}
