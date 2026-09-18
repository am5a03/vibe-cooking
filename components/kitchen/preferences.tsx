'use client';
import { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { api, errorText, type Preferences } from '../../lib/kitchen/client';
import { ErrorBox, Field, Loading, useDirty, useKitchen } from './shared';

export function PreferencesPanel() {
  const { entries, setDirty } = useKitchen();
  const [value, setValue] = useState<Preferences | null>(null);
  const [original, setOriginal] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const dirty = value !== null && JSON.stringify(value) !== original;
  const request = useMemo(() => ({ path: '/preferences', attempt: retry }), [retry]);
  useDirty(dirty);
  useEffect(() => {
    const controller = new AbortController();
    api<{ preferences: Preferences }>(request.path, { signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      setValue(result.data.preferences); setOriginal(JSON.stringify(result.data.preferences)); setTag(result.tag); setError('');
    }).catch((cause) => { if (!controller.signal.aborted) setError(errorText(cause)); });
    return () => controller.abort();
  }, [request]);
  function reload() {
    if (dirty && !window.confirm('Discard unsaved preferences and load the latest?')) return;
    setRetry((n) => n + 1);
  }
  async function save() {
    if (!value) return;
    const submitted = value;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api<{ preferences: Preferences }>('/preferences', { method: 'PUT', value: submitted, tag });
      setValue(result.data.preferences); setOriginal(JSON.stringify(result.data.preferences)); setTag(result.tag); setDirty(false); setNotice('Preferences saved.');
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }
  return <div className="narrow">
    <span className="eyebrow">Your tastes, your kitchen</span><h1>A little more <em>you.</em></h1><p>Keep track of the ingredients and portions you prefer.</p>
    <div className="notice">These preferences are saved for future discovery features. They do not yet filter the recipe catalogue or certify allergy safety.</div>
    <ErrorBox message={error}/>{error && <button type="button" className="button" onClick={reload}>Reload preferences</button>}
    {value ? <><fieldset disabled={busy} className="editor-fieldset">
      <section className="panel"><h2>Everyday defaults</h2><div className="form-grid">
        <Field label="Breakfast portions"><input type="number" min={1} max={20} value={value.defaultBreakfastPortions || ''} onChange={(e) => setValue({ ...value, defaultBreakfastPortions: Number(e.target.value) })}/></Field>
        <Field label="Lunch & dinner portions"><input type="number" min={1} max={20} value={value.defaultDinnerPortions || ''} onChange={(e) => setValue({ ...value, defaultDinnerPortions: Number(e.target.value) })}/></Field>
        <Field label="Preferred maximum minutes (optional)"><input type="number" min={1} max={2880} placeholder="No preference" value={value.maxMinutes ?? ''} onChange={(e) => setValue({ ...value, maxMinutes: e.target.value ? Number(e.target.value) : null })}/></Field>
      </div></section>
      <section className="panel"><h2>Ingredients you love—or leave out.</h2>
        {entries.length === 0 ? <p>Add ingredients through the recipe editor to see them here.</p> : <div className="taste-list">{entries.map((entry) => <div className="taste-row" key={entry.id}>
          <span>{entry.ingredient.name}</span>
          <label><input type="checkbox" aria-label={`Love ${entry.ingredient.name}`} checked={value.likedIngredientIds.includes(entry.id)} onChange={(e) => setValue({ ...value, likedIngredientIds: e.target.checked ? [...value.likedIngredientIds, entry.id] : value.likedIngredientIds.filter((id) => id !== entry.id), excludedIngredientIds: e.target.checked ? value.excludedIngredientIds.filter((id) => id !== entry.id) : value.excludedIngredientIds })}/>Love</label>
          <label><input type="checkbox" aria-label={`Exclude ${entry.ingredient.name}`} checked={value.excludedIngredientIds.includes(entry.id)} onChange={(e) => setValue({ ...value, excludedIngredientIds: e.target.checked ? [...value.excludedIngredientIds, entry.id] : value.excludedIngredientIds.filter((id) => id !== entry.id), likedIngredientIds: e.target.checked ? value.likedIngredientIds.filter((id) => id !== entry.id) : value.likedIngredientIds })}/>Exclude</label>
        </div>)}</div>}
      </section>
      <button type="button" className="button primary" disabled={busy || !dirty || !tag} onClick={save}><Check size={16}/>{busy ? 'Saving…' : 'Save preferences'}</button>
      {dirty && <span className="unsaved-label">Unsaved changes</span>}
    </fieldset><output className="save-status" style={{ display: 'block' }}>{notice}</output></> : !error && <Loading/>}
  </div>;
}
