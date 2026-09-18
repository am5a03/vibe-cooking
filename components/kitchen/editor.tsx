'use client';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, Check, Copy, Plus, Trash2 } from 'lucide-react';
import { api, errorText, label, type RecipeDocument, type Snapshot } from '../../lib/kitchen/client';
import type { IngredientLine } from '../../lib/kitchen/types';
import { recipe as validateRecipe } from '../../lib/kitchen/validation';
import { EDIT_KEY, editable, editableServing, emptyRecipe, keyed, type EditorDocument, type EditorServing } from '../../lib/kitchen/editor-model';
import { ErrorBox, Field, Loading, useDirty, useKitchen } from './shared';

export function RecipeEditor({ mode, id }: { mode: 'new' | 'edit' | 'duplicate'; id: string }) {
  const { entries, refreshIngredients, go, setDirty } = useKitchen();
  const [doc, setDoc] = useState<EditorDocument | null>(() => mode === 'new' ? emptyRecipe() : null);
  const [original, setOriginal] = useState(() => mode === 'new' ? JSON.stringify(emptyRecipe()) : '');
  const [newRecipeId] = useState(() => crypto.randomUUID());
  const [tag, setTag] = useState<string | null>(null);
  const [profileIndex, setProfileIndex] = useState(0);
  const [reviewNeeded, setReviewNeeded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [newName, setNewName] = useState('');
  const [newId, setNewId] = useState('');
  const [newComponents, setNewComponents] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [ingredientBusy, setIngredientBusy] = useState(false);
  const dirty = doc !== null && JSON.stringify(doc) !== original;
  const request = useMemo(() => ({ mode, id, attempt: retry }), [mode, id, retry]);
  useDirty(dirty);
  useEffect(() => {
    if (request.mode === 'new') return;
    const abort = new AbortController();
    api<Snapshot>(`/recipes/${request.id}`, { signal: abort.signal }).then((result) => {
      if (abort.signal.aborted) return;
      const recipe = request.mode === 'duplicate' ? {
        ...result.data.recipe, title: `${result.data.recipe.title.slice(0, 170)} (copy)`, status: 'active' as const,
        source: `Personal variation of ${request.id}, revision ${result.data.revision}. ${result.data.recipe.source}`.slice(0, 1000),
      } : result.data.recipe;
      setDoc(editable(recipe)); setOriginal(JSON.stringify(recipe)); setTag(result.tag); setProfileIndex(0); setError(''); setReviewNeeded(false);
    }).catch((cause) => { if (!abort.signal.aborted) setError(errorText(cause)); });
    return () => abort.abort();
  }, [request]);
  function update<K extends keyof EditorDocument>(key: K, value: EditorDocument[K]) {
    setDoc((current) => current ? { ...current, [key]: value } : current);
  }
  function updateServing<K extends keyof EditorServing>(key: K, value: EditorServing[K]) {
    setDoc((current) => current ? { ...current, servings: current.servings.map((serving, index) => index === profileIndex ? { ...serving, [key]: value } : serving) } : current);
  }
  function ingredientRow(index: number, change: Partial<IngredientLine>) {
    const selected = doc?.servings[profileIndex];
    if (selected) updateServing('ingredients', selected.ingredients.map((line, i) => i === index ? { ...line, ...change } : line));
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!doc || reviewNeeded || busy || ingredientBusy) return;
    setBusy(true); setError('');
    try {
      const validated = validateRecipe({ ...doc, safetyNotes: doc.safetyNotes.map((line) => line.trim()).filter(Boolean), servings: doc.servings.map((serving) => ({ ...serving, equipment: serving.equipment.map((item) => item.trim()).filter(Boolean) })) });
      const result = await api<Snapshot>(mode === 'edit' ? `/recipes/${id}` : '/recipes', mode === 'edit' ? { method: 'PUT', value: validated, tag } : { method: 'POST', value: { id: newRecipeId, recipe: validated } });
      setOriginal(JSON.stringify(result.data.recipe)); setDoc(editable(result.data.recipe)); setDirty(false); go(`recipe/${result.data.id}`);
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }
  async function addIngredient() {
    setIngredientBusy(true); setError(''); setNotice('');
    try {
      const idValue = newId.trim();
      await api('/ingredients', { method: 'POST', value: { id: idValue, ingredient: { name: newName.trim(), aliases: [], components: newComponents } } });
      await refreshIngredients();
      setNotice(`Added ${newName}. Select it in the ingredient rows below.`); setNewName(''); setNewId(''); setNewComponents([]);
      setDoc((current) => current && !current.main ? { ...current, main: idValue, servings: current.servings.map((serving) => ({ ...serving, ingredients: serving.ingredients.map((line) => line.ingredientId ? line : { ...line, ingredientId: idValue }) })) } : current);
    } catch (cause) { setError(errorText(cause)); }
    finally { setIngredientBusy(false); }
  }
  function reload() {
    if (dirty && !window.confirm('Discard unsaved edits and reload the current recipe?')) return;
    setDirty(false); setRetry((n) => n + 1);
  }
  async function copyDraft() {
    try { await navigator.clipboard.writeText(JSON.stringify(doc, null, 2)); setNotice('Draft JSON copied. Keep it privately before reloading.'); }
    catch { setError('Clipboard access failed. Your edits are still in this form. Do not reload until you have copied the text you need.'); }
  }
  const selected = doc?.servings[profileIndex];
  return <div className="editor">
    <button type="button" className="back-link" onClick={() => go(mode === 'edit' ? `recipe/${id}` : 'discover')}><ArrowLeft size={16}/>Back</button>
    <div className="page-heading"><div><span className="eyebrow">{mode === 'edit' ? 'A small change, a new revision' : mode === 'duplicate' ? 'A familiar anchor, your own experiment' : 'A fresh page in your cookbook'}</span><h1>{mode === 'edit' ? 'Make it ' : 'Something '}<em>{mode === 'edit' ? 'yours.' : 'worth keeping.'}</em></h1><p>{mode === 'duplicate' ? 'This becomes a separate recipe. The original will stay unchanged.' : 'Ingredients, instructions, and your own finishing touches.'}</p></div></div>
    {mode === 'edit' && <div className="notice"><strong>Related variations</strong><p>Link reviewed recipes that change one flavour, main ingredient or cooking method. Save recipe edits first.</p><button type="button" className="button" disabled={dirty || busy} onClick={() => go(`variations/${id}`)}>Manage variations</button></div>}
    <ErrorBox message={error}/>
    {error && <div className="button-row"><button type="button" className="button small" onClick={copyDraft}><Copy size={15}/>Copy unsaved draft</button>{mode !== 'new' && <button type="button" className="button small" onClick={reload}>Reload latest recipe</button>}</div>}
    <output className="save-status" style={{ display: 'block' }}>{notice}</output>
    {!doc || !selected ? !error && <Loading/> : <form onSubmit={save}><fieldset disabled={busy || ingredientBusy} className="editor-fieldset">
      <section className="panel"><span className="eyebrow">01 / The idea</span><h2>Give it a name.</h2><div className="form-grid">
        <Field label="Recipe title" wide><input required maxLength={180} value={doc.title} onChange={(e) => update('title', e.target.value)} placeholder="Your next favourite dish"/></Field>
        <Field label="Description" wide><textarea rows={2} maxLength={1000} value={doc.description} onChange={(e) => update('description', e.target.value)} placeholder="What makes this one special?"/></Field>
        <Field label="Meal type"><select value={doc.mode} onChange={(e) => update('mode', e.target.value as RecipeDocument['mode'])}><option value="dinner">Lunch & dinner</option><option value="breakfast">Breakfast</option></select></Field>
        <Field label="Main ingredient"><select required value={doc.main} onChange={(e) => update('main', e.target.value)}><option value="">Choose an ingredient</option>{entries.map((entry) => <option key={entry.id} value={entry.id}>{entry.ingredient.name}</option>)}</select></Field>
        <Field label="Flavour profile ID"><input required pattern="[A-Za-z0-9][A-Za-z0-9_-]*" maxLength={80} value={doc.flavor} onChange={(e) => update('flavor', e.target.value)} placeholder="ginger-sesame"/></Field>
        <Field label={doc.mode === 'breakfast' ? 'Format ID' : 'Technique ID'}><input required pattern="[A-Za-z0-9][A-Za-z0-9_-]*" maxLength={80} value={doc.method} onChange={(e) => update('method', e.target.value)} placeholder={doc.mode === 'breakfast' ? 'bowl' : 'stir-fry'}/></Field>
      </div><p className="fineprint">Use short labels such as ginger-sesame, roast, or wrap. These describe the recipe; they do not create automatic remixes.</p></section>
      <details className="panel ingredient-creator" open={entries.length === 0}>
        <summary>Add an ingredient to your catalogue</summary><p className="fineprint">Create it once, then use it in any recipe. Definitions are immutable in this first version.</p>
        <div className="form-grid">
          <Field label="New ingredient name"><input value={newName} maxLength={120} onChange={(e) => { setNewName(e.target.value); setNewId(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)); }}/></Field>
          <Field label="New ingredient ID"><input value={newId} maxLength={80} onChange={(e) => setNewId(e.target.value)}/></Field>
          <Field label="Contains these catalogue ingredients (optional)" wide><select multiple value={newComponents} onChange={(e) => setNewComponents(Array.from(e.target.selectedOptions, (option) => option.value))}>{entries.map((entry) => <option key={entry.id} value={entry.id}>{entry.ingredient.name}</option>)}</select></Field>
        </div><p className="fineprint">For a compound ingredient, record known components—for example, sesame in tahini. This is not an allergy certification.</p>
        <button type="button" className="button" disabled={ingredientBusy || !newName.trim() || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(newId)} onClick={addIngredient}><Plus size={16}/>{ingredientBusy ? 'Adding…' : 'Create ingredient'}</button>
      </details>
      <section className="panel"><span className="eyebrow">02 / Quantities & method</span><h2>Write the recipe you’ll cook.</h2>
        <div className="profile-tabs">{doc.servings.map((serving, index) => <button type="button" className={`button small${index === profileIndex ? ' primary' : ''}`} aria-pressed={index === profileIndex} key={serving[EDIT_KEY]} onClick={() => setProfileIndex(index)}>{serving.portions} portions</button>)}
          <button type="button" className="button small" disabled={doc.servings.length >= 12} onClick={() => {
            const number = Array.from({ length: 20 }, (_, i) => i + 1).find((n) => !doc.servings.some((s) => s.portions === n));
            if (number === undefined) return;
            update('servings', [...doc.servings, editableServing({ ...selected, portions: number })]); setProfileIndex(doc.servings.length); setReviewNeeded(true);
          }}><Plus size={14}/>Add portion size</button>
        </div>
        <p className="fineprint">Each portion size has its own quantities, timings, and instructions. Adding a size copies the current values unchanged—review them rather than scaling cooking time automatically.</p>
        <div className="form-grid three">
          <Field label="Number of portions"><input required type="number" min={1} max={20} value={selected.portions || ''} onChange={(e) => { updateServing('portions', Number(e.target.value)); setReviewNeeded(true); }}/></Field>
          <Field label="Active minutes"><input required type="number" min={0} max={2880} value={selected.activeMinutes} onChange={(e) => updateServing('activeMinutes', Number(e.target.value))}/></Field>
          <Field label="Total minutes"><input required type="number" min={1} max={2880} value={selected.totalMinutes || ''} onChange={(e) => updateServing('totalMinutes', Number(e.target.value))}/></Field>
          <Field label="Equipment (comma-separated)" wide><input required value={selected.equipment.join(', ')} onChange={(e) => updateServing('equipment', e.target.value.split(',').map((s) => s.trim()))}/></Field>
          <Field label="Pan capacity / batch guidance" wide><input required maxLength={800} value={selected.capacity} onChange={(e) => updateServing('capacity', e.target.value)}/></Field>
          <Field label="Batches"><input required type="number" min={1} max={20} value={selected.batches || ''} onChange={(e) => updateServing('batches', Number(e.target.value))}/></Field>
          <Field label="Oven trays"><input required type="number" min={0} max={20} value={selected.trays} onChange={(e) => updateServing('trays', Number(e.target.value))}/></Field>
        </div>
        <h3 className="section-label">Ingredients for {selected.portions} portions</h3><p className="fineprint">Every portion profile must contain the same ingredient IDs and roles. Include the selected main ingredient with the Main role.</p>
        <div className="ingredient-edit-list">{selected.ingredients.map((line, index) => <div className="ingredient-edit" key={line[EDIT_KEY]}>
          <Field label={`Ingredient ${index + 1}`}><select required value={line.ingredientId} onChange={(e) => ingredientRow(index, { ingredientId: e.target.value })}><option value="">Choose ingredient</option>{entries.map((entry) => <option key={entry.id} value={entry.id}>{entry.ingredient.name}</option>)}</select></Field>
          <Field label="Quantity"><input required aria-label={`Quantity ${index + 1}`} type="number" min={0.001} step="any" max={100000} value={line.quantity || ''} onChange={(e) => ingredientRow(index, { quantity: Number(e.target.value) })}/></Field>
          <Field label="Unit"><input required aria-label={`Unit ${index + 1}`} maxLength={40} value={line.unit} onChange={(e) => ingredientRow(index, { unit: e.target.value })}/></Field>
          <Field label="Role"><select aria-label={`Role ${index + 1}`} value={line.role} onChange={(e) => ingredientRow(index, { role: e.target.value as IngredientLine['role'] })}>{['main', 'base', 'vegetables', 'fruit', 'sauce', 'finish'].map((role) => <option key={role} value={role}>{label(role)}</option>)}</select></Field>
          <Field label="Preparation / state" wide><input aria-label={`Preparation ${index + 1}`} maxLength={600} placeholder="e.g. dry weight, drained, sliced" value={line.preparation} onChange={(e) => ingredientRow(index, { preparation: e.target.value })}/></Field>
          <button type="button" className="button small remove-row" aria-label={`Remove ingredient ${index + 1}`} disabled={selected.ingredients.length === 1} onClick={() => updateServing('ingredients', selected.ingredients.filter((_, i) => i !== index))}><Trash2 size={15}/>Remove</button>
        </div>)}</div>
        <button type="button" className="button" disabled={selected.ingredients.length >= 60} onClick={() => updateServing('ingredients', [...selected.ingredients, keyed({ ingredientId: '', quantity: 1, unit: 'g', role: 'vegetables' as const, preparation: '' })])}><Plus size={16}/>Add ingredient row</button>
        <h3 className="section-label">Cooking steps</h3>
        {selected.steps.map((step, index) => <div className="step-editor" key={step[EDIT_KEY]}><span className="step-number">{index + 1}</span><div>
          <Field label={`Step ${index + 1} title`}><input required maxLength={180} value={step.title} onChange={(e) => updateServing('steps', selected.steps.map((s, i) => i === index ? { ...s, title: e.target.value } : s))}/></Field>
          <Field label={`Step ${index + 1} instructions`}><textarea required rows={3} maxLength={5000} value={step.instruction} onChange={(e) => updateServing('steps', selected.steps.map((s, i) => i === index ? { ...s, instruction: e.target.value } : s))}/></Field>
          <button type="button" className="button small" disabled={selected.steps.length === 1} onClick={() => updateServing('steps', selected.steps.filter((_, i) => i !== index))}>Remove step {index + 1}</button>
        </div></div>)}
        <button type="button" className="button" disabled={selected.steps.length >= 30} onClick={() => updateServing('steps', [...selected.steps, keyed({ title: '', instruction: '' })])}><Plus size={16}/>Add cooking step</button>
        {doc.servings.length > 1 && <button type="button" className="button subtle" onClick={() => { if (window.confirm('Remove this portion profile?')) { update('servings', doc.servings.filter((_, i) => i !== profileIndex)); setProfileIndex(0); } }}>Remove this portion size</button>}
      </section>
      <section className="panel"><span className="eyebrow">03 / The finishing touches</span><h2>Make the next time easier.</h2><div className="form-grid">
        <Field label="Meal-prep suitability"><select value={doc.prep} onChange={(e) => update('prep', e.target.value as RecipeDocument['prep'])}><option value="good">Good for meal prep</option><option value="assemble-later">Assemble later</option><option value="eat-fresh">Best cooked fresh</option></select></Field>
        <Field label="Recipe status"><select value={doc.status} onChange={(e) => update('status', e.target.value as RecipeDocument['status'])}><option value="active">Active</option><option value="archived">Archived</option></select></Field>
        <Field label="Why the combination works" wide><textarea rows={2} maxLength={2500} value={doc.rationale} onChange={(e) => update('rationale', e.target.value)}/></Field>
        <Field label="Preparation notes" wide><textarea rows={2} maxLength={2500} value={doc.prepNote} onChange={(e) => update('prepNote', e.target.value)}/></Field>
        <Field label="Storage and reheating notes" wide><textarea rows={2} maxLength={2500} value={doc.storageNote} onChange={(e) => update('storageNote', e.target.value)}/></Field>
        <Field label="Safety notes (one per line)" wide><textarea rows={2} value={doc.safetyNotes.join('\n')} onChange={(e) => update('safetyNotes', e.target.value.split('\n'))}/></Field>
        <Field label="Source / attribution" wide><input maxLength={1000} value={doc.source} onChange={(e) => update('source', e.target.value)}/></Field>
      </div><p className="fineprint">Recipes are saved as drafts, not certified or kitchen-tested. Review food-safety instructions before cooking.</p></section>
      {reviewNeeded && <label className="notice review-check"><input type="checkbox" onChange={(e) => { if (e.target.checked) setReviewNeeded(false); }}/>I have reviewed the quantities, timings, and steps for every new or changed portion size.</label>}
      <div className="editor-save"><button type="submit" className="button primary" disabled={busy || ingredientBusy || reviewNeeded || (mode === 'edit' && (!dirty || !tag))}><Check size={17}/>{busy ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Save new recipe'}</button><span>{dirty ? 'Unsaved changes · Your draft stays here if saving fails.' : 'No changes yet.'}</span></div>
    </fieldset></form>}
  </div>;
}
