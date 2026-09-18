'use client';
import { useEffect, useState } from 'react';
import { ArrowLeft, Bookmark, Check, Clock3, Copy, Pencil, Users, Archive } from 'lucide-react';
import { api, ClientError, errorText, label, type Snapshot, type Favourite, type Page, type Note } from '../../lib/kitchen/client';
import { DishArt, ErrorBox, Field, Loading, useDirty, useKitchen } from './shared';

async function savedRecipe(id: string, signal: AbortSignal): Promise<Favourite> {
  let cursor = '';
  const visited = new Set<string>();
  for (;;) {
    if (visited.has(cursor)) throw new Error('The server repeated a saved-recipe cursor.');
    visited.add(cursor);
    const { data } = await api<Page<Favourite>>(`/favourites?limit=50&after=${encodeURIComponent(cursor)}`, { signal });
    const match = data.items.find((item) => item.recipeId === id);
    if (match) return match;
    if (!data.nextAfter) throw new ClientError('This saved recipe was removed. Return to My kitchen.', 404);
    cursor = data.nextAfter;
  }
}
export function RecipeDetail({ id, saved }: { id: string; saved: boolean }) {
  const { go, entries, setDirty } = useKitchen();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [portions, setPortions] = useState(0);
  const [note, setNote] = useState<Note>({ text: '', verdict: 'untried' });
  const [initialNote, setInitialNote] = useState('');
  const [noteTag, setNoteTag] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const dirty = initialNote !== '' && JSON.stringify(note) !== initialNote;
  useDirty(dirty);
  useEffect(() => {
    const abort = new AbortController();
    setSnapshot(null); setError(''); setNotice(''); setChecked(new Set());
    async function load() {
      if (saved) {
        const item = await savedRecipe(id, abort.signal);
        setSnapshot({ id, recipe: item.recipe, revision: item.recipeRevision, createdAt: item.createdAt, updatedAt: item.createdAt });
        setPortions(item.portions);
      } else {
        const result = await api<Snapshot>(`/recipes/${id}`, { signal: abort.signal });
        setSnapshot(result.data); setTag(result.tag); setPortions(result.data.recipe.servings[0]?.portions ?? 0);
      }
      const result = await api<{ note: Note; revision: number }>(`/recipes/${id}/note`, { signal: abort.signal });
      setNote(result.data.note); setInitialNote(JSON.stringify(result.data.note)); setNoteTag(result.tag);
    }
    load().catch((cause) => { if (!abort.signal.aborted) setError(errorText(cause)); });
    return () => abort.abort();
  }, [id, saved, retry]);
  async function action(task: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await task(); } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }
  function reload() {
    if (dirty && !window.confirm('Discard this unsaved note and reload the latest data?')) return;
    setDirty(false); setInitialNote(''); setRetry((n) => n + 1);
  }
  if (!snapshot) return <><button type="button" className="back-link" onClick={() => go(saved ? 'saved' : 'discover')}><ArrowLeft size={16}/>Back to recipes</button><ErrorBox message={error}/>{error ? <button type="button" className="button" onClick={reload}>Retry</button> : <Loading/>}</>;
  const recipe = snapshot.recipe;
  const serving = recipe.servings.find((profile) => profile.portions === portions);
  const name = (ingredientId: string) => entries.find((entry) => entry.id === ingredientId)?.ingredient.name ?? label(ingredientId);
  return <><button type="button" className="back-link" onClick={() => go(saved ? 'saved' : 'discover')}><ArrowLeft size={16}/>{saved ? 'Back to My kitchen' : 'Back to recipes'}</button><div className="detail-heading"><div><span className="eyebrow">{saved ? 'Your saved version' : recipe.mode === 'breakfast' ? 'Breakfast' : 'Lunch & dinner'} · Revision {snapshot.revision} · Draft</span><h1>{recipe.title}</h1><p>{recipe.description}</p></div></div><ErrorBox message={error}/>{error && <button type="button" className="button small" onClick={reload}>Reload latest data</button>}<p className="save-status" role="status">{notice}</p>{saved && <div className="notice">You’re viewing the exact version you saved. <button type="button" className="text-link" onClick={() => go(`recipe/${id}`)}>Open the current recipe</button></div>}<div className="detail-grid"><div><DishArt recipe={recipe}/><div className="panel detail-summary"><div className="recipe-meta"><span><Clock3 size={16}/>~{serving?.totalMinutes} min total</span><span>{serving?.activeMinutes} min active</span><span><Users size={16}/>{portions} portions</span></div><Field label="Portions"><select value={portions} onChange={(e) => { setPortions(Number(e.target.value)); setChecked(new Set()); }}>{recipe.servings.map((s) => <option value={s.portions} key={s.portions}>{s.portions} portions</option>)}</select></Field><p className="fineprint">Only authored portion sizes are offered; cooking times are not automatically multiplied.</p><div className="button-row">{!saved && recipe.status === 'active' && <button type="button" className="button primary" disabled={busy} onClick={() => action(async () => { const result = await api<{ alreadySaved: boolean; message: string }>(`/favourites/${id}`, { method: 'PUT', value: { recipeRevision: snapshot.revision, portions } }); setNotice(result.data.alreadySaved ? 'Already saved. The previously saved version and portions were kept.' : 'Saved this exact version and portion size to My kitchen.'); })}><Bookmark size={17}/>Save this version</button>}{saved && <button type="button" className="button" disabled={busy} onClick={() => { if (window.confirm('Remove this bookmark? The recipe and notes will stay.')) action(async () => { await api(`/favourites/${id}`, { method: 'DELETE' }); go('saved'); }); }}>Remove bookmark</button>}{!saved && <><button type="button" className="button" onClick={() => go(`edit/${id}`)}><Pencil size={16}/>Edit recipe</button><button type="button" className="button" onClick={() => go(`duplicate/${id}`)}><Copy size={16}/>Make a copy</button></>}</div></div>{recipe.rationale && <section className="rationale"><span className="eyebrow">Why this combination works</span><p>{recipe.rationale}</p></section>}<section className="panel"><h2>Make a note for next time.</h2><p className="fineprint">Your cooking note belongs to this recipe, across all its versions.</p><Field label="Your cooking note"><textarea rows={4} maxLength={12000} value={note.text} onChange={(e) => setNote({ ...note, text: e.target.value })} placeholder="A little more ginger. A crispier finish…"/></Field><Field label="Would you cook it again?"><select value={note.verdict} onChange={(e) => setNote({ ...note, verdict: e.target.value as Note['verdict'] })}><option value="untried">Not cooked yet</option><option value="repeat">Definitely repeat</option><option value="adjust">Try with adjustments</option></select></Field><button type="button" className="button primary" disabled={busy || !noteTag || !dirty} onClick={() => action(async () => { const result = await api<{ note: Note }>(`/recipes/${id}/note`, { method: 'PUT', value: note, tag: noteTag }); setNoteTag(result.tag); setInitialNote(JSON.stringify(result.data.note)); setDirty(false); setNotice('Cooking note saved.'); })}><Check size={16}/>Save note</button>{dirty && <span className="unsaved-label">Unsaved changes</span>}</section></div><div>{serving && <><section className="panel ingredients-panel"><span className="eyebrow">Everything in its place</span><h2>Ingredients</h2><p className="fineprint">For {portions} portions. Ticks are a temporary cooking checklist.</p>{serving.ingredients.map((line, index) => <label className={`ingredient-check${checked.has(index) ? ' checked' : ''}`} key={`${index}-${line.ingredientId}`}><input type="checkbox" checked={checked.has(index)} onChange={() => setChecked((current) => { const next = new Set(current); if (next.has(index)) next.delete(index); else next.add(index); return next; })}/><span><strong>{name(line.ingredientId)}</strong>{line.preparation && <small>{line.preparation}</small>}</span><span className="ingredient-quantity">{line.quantity} {line.unit}</span></label>)}</section><section className="panel"><span className="eyebrow">One step at a time</span><h2>Let’s cook.</h2><p className="equipment-line">{serving.equipment.map(label).join(' · ')}<br/>{serving.capacity}</p><ol className="cooking-steps">{serving.steps.map((step, index) => <li key={`${index}-${step.title}`}><span className="step-number">{index + 1}</span><div><h3>{step.title}</h3><p>{step.instruction}</p></div></li>)}</ol></section></>}{(recipe.prepNote || recipe.storageNote || recipe.safetyNotes.length > 0) && <section className="panel prep-notes"><h2>Plan ahead.</h2>{recipe.prepNote && <p>{recipe.prepNote}</p>}{recipe.storageNote && <><h3>Storage & reheating</h3><p>{recipe.storageNote}</p></>}{recipe.safetyNotes.map((noteText) => <p key={noteText}>{noteText}</p>)}</section>}<div className="draft-note"><strong>Recipe draft · Not kitchen-tested</strong><p>{recipe.source || 'Personal recipe. Review ingredients and cooking instructions before using.'}</p></div>{!saved && <button type="button" className="button subtle" disabled={busy || !tag} onClick={() => { if (window.confirm(recipe.status === 'active' ? 'Archive this recipe? It will leave the active list; history and bookmarks stay.' : 'Restore this recipe to the active list?')) action(async () => { const result = await api<Snapshot>(`/recipes/${id}`, recipe.status === 'active' ? { method: 'DELETE', tag } : { method: 'PUT', tag, value: { ...recipe, status: 'active' } }); setSnapshot(result.data); setTag(result.tag); setNotice(recipe.status === 'active' ? 'Recipe archived.' : 'Recipe restored.'); }); }}><Archive size={16}/>{recipe.status === 'active' ? 'Archive recipe' : 'Restore recipe'}</button>}</div></div></>;
}
