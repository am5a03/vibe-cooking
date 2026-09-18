'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, RefreshCw, Sparkles, Clock3, Users } from 'lucide-react';
import { api, errorText, label, type Preferences } from '../../lib/kitchen/client';
import type { DiscoveryConstraints, DiscoveryResult } from '../../lib/kitchen/exploration-client';
import { DishArt, ErrorBox, Field, Loading, useKitchen } from './shared';

export function Discovery() {
  const { entries, go, discovery, setDiscovery } = useKitchen();
  const [filters, setFilters] = useState<DiscoveryConstraints>(discovery ?? { mode: 'dinner', portions: 3, maxMinutes: null, requiredIngredient: null });
  const [defaults, setDefaults] = useState<Preferences | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DiscoveryResult | null>(null);
  const [error, setError] = useState('');
  const [selection, setSelection] = useState<(DiscoveryConstraints & { seen: string[]; seed: string }) | null>(null);
  const seen = useRef<string[]>([]);
  const controller = useRef<AbortController | null>(null);
  const name = (id: string) => entries.find((entry) => entry.id === id)?.ingredient.name ?? label(id);
  useEffect(() => {
    const abort = new AbortController();
    api<{ preferences: Preferences }>('/preferences', { signal: abort.signal }).then(({ data }) => {
      if (abort.signal.aborted) return;
      setDefaults(data.preferences);
      const initial = discovery ?? { mode: 'dinner' as const, portions: data.preferences.defaultDinnerPortions, maxMinutes: data.preferences.maxMinutes, requiredIngredient: null };
      setFilters(initial); setSelection({ ...initial, seen: [], seed: crypto.randomUUID() });
      setReady(true);
    }).catch((cause) => { if (!abort.signal.aborted) setError(errorText(cause)); });
    return () => { abort.abort(); controller.current?.abort(); };
  }, [discovery]);
  // Explicit submission replaces the result set; edits invalidate previews immediately.
  useEffect(() => {
    if (!selection) return;
    const request = new AbortController();
    controller.current?.abort(); controller.current = request;
    setBusy(true); setError(''); setResult(null);
    api<DiscoveryResult>('/discover', { method: 'POST', value: selection, signal: request.signal })
      .then(({ data }) => {
        if (request.signal.aborted) return;
        setResult(data);
        seen.current = [...new Set([...data.items.map((item) => item.snapshot.id), ...seen.current])].slice(0, 60);
      }).catch((cause) => { if (!request.signal.aborted) setError(errorText(cause)); })
      .finally(() => { if (!request.signal.aborted) setBusy(false); });
    return () => request.abort();
  }, [selection]);
  function change<K extends keyof DiscoveryConstraints>(key: K, value: DiscoveryConstraints[K]) {
    controller.current?.abort(); setBusy(false); setResult(null);
    setFilters((current) => ({ ...current, [key]: value }));
  }
  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!ready || busy) return;
    seen.current = [];
    setSelection({ ...filters, seen: seen.current, seed: crypto.randomUUID() });
  }
  function open(id: string) {
    if (!result) return;
    setDiscovery(result.constraints); go(`recipe/${id}`);
  }
  return <>
    <div className="page-heading"><div><span className="eyebrow">A familiar anchor. A fresh idea.</span><h1>What sounds <em>good?</em></h1><p>Three possibilities from your kitchen. Pick a dish, then explore what it could become.</p></div><button type="button" className="button" onClick={() => go('all')}>Browse all recipes<ArrowRight size={16}/></button></div>
    <form className="panel discovery-controls" onSubmit={submit}>
      <div className="form-grid discovery-fields">
        <Field label="Meal"><select disabled={!ready || busy} value={filters.mode} onChange={(event) => {
          const mode = event.target.value as DiscoveryConstraints['mode'];
          controller.current?.abort(); setResult(null); seen.current = [];
          setFilters({ ...filters, mode, portions: mode === 'breakfast' ? defaults?.defaultBreakfastPortions ?? 1 : defaults?.defaultDinnerPortions ?? 3 });
        }}><option value="dinner">Lunch & dinner</option><option value="breakfast">Breakfast</option></select></Field>
        <Field label="Discovery portions"><input disabled={!ready || busy} type="number" min={1} max={20} required value={filters.portions || ''} onChange={(event) => change('portions', Number(event.target.value))}/></Field>
        <Field label="Maximum minutes"><input disabled={!ready || busy} type="number" min={1} max={2880} placeholder="Any time" value={filters.maxMinutes ?? ''} onChange={(event) => change('maxMinutes', event.target.value ? Number(event.target.value) : null)}/></Field>
        <Field label="Include an ingredient"><select disabled={!ready || busy} value={filters.requiredIngredient ?? ''} onChange={(event) => change('requiredIngredient', event.target.value || null)}><option value="">Anything sounds good</option>{entries.map((entry) => <option key={entry.id} value={entry.id}>{entry.ingredient.name}</option>)}</select></Field>
      </div>
      <div className="discovery-actions"><p className="fineprint">Your exclusions always apply here, including recorded sauce components. Required ingredients must be a main, base, vegetable or fruit—not just a garnish.</p><button type="submit" className="button primary" disabled={!ready || busy}><Sparkles size={17}/>{busy ? 'Finding ideas…' : 'Find meal ideas'}</button></div>
    </form>
    <ErrorBox message={error}/>{error && <button type="button" className="button" onClick={() => ready ? setSelection({ ...filters, seen: seen.current, seed: crypto.randomUUID() }) : window.location.reload()}>Retry discovery</button>}
    {(!ready && !error) || busy ? <Loading/> : result ? <>
      <div className="results-heading"><div><span className="eyebrow">Your tasting menu</span><h2>{result.items.length ? 'Start with something appealing.' : 'Let’s try another direction.'}</h2></div><span>{result.eligibleCount} matching {result.eligibleCount === 1 ? 'recipe' : 'recipes'}</span></div>
      <div className="constraint-strip"><span>{result.constraints.portions} portions</span><span>{result.constraints.maxMinutes ? `Up to ${result.constraints.maxMinutes} minutes` : 'Any cooking time'}</span>{result.constraints.requiredIngredient && <span>Includes {name(result.constraints.requiredIngredient)}</span>}<span>{result.excludedIngredientIds.length ? `Excluding: ${result.excludedIngredientIds.map(name).join(', ')}` : 'No saved exclusions'}</span></div>
      {result.items.length === 0 ? <section className="empty"><h3>No recipes match all your choices.</h3><p>Try another portion size, time limit or required ingredient. Exclusions have not been relaxed.</p><button type="button" className="button" onClick={() => go('all')}>Open all recipes to edit your catalogue</button></section> : <div className="recipe-grid discovery-grid">{result.items.map(({ snapshot, liked, repeated }) => {
        const serving = snapshot.recipe.servings.find((profile) => profile.portions === result.constraints.portions);
        return <article className="recipe-card" key={snapshot.id}><DishArt recipe={snapshot.recipe}/><div className="recipe-card-body"><span className="eyebrow">{label(snapshot.recipe.flavor)} · {label(snapshot.recipe.method)}</span><h2><button type="button" onClick={() => open(snapshot.id)}>{snapshot.recipe.title}</button></h2><p>{snapshot.recipe.description}</p><div className="recipe-meta"><span><Clock3 size={15}/>~{serving?.totalMinutes} min</span><span><Users size={15}/>{result.constraints.portions} portions</span></div><p className="recommendation-reason">{liked.length ? `Includes ingredients you like: ${liked.map(name).join(', ')}.` : 'A match for your current choices.'}{repeated ? ' Shown recently.' : ''}</p><button type="button" className="button primary full" onClick={() => open(snapshot.id)}>Explore this dish<ArrowRight size={16}/></button></div></article>;
      })}</div>}
      {(result.invalidCount > 0 || result.counts['incomplete-ingredients']) && <p className="notice">Some recipes have incomplete definitions and were not suggested. Review them in All recipes.</p>}
      {result.items.length > 0 && <div className="discovery-bottom"><button type="button" className="button" disabled={busy} onClick={() => setSelection({ ...filters, seen: seen.current, seed: crypto.randomUUID() })}><RefreshCw size={16}/>Show other ideas</button><p className="fineprint">{result.repeatedCount ? 'Some familiar dishes returned because the matching selection is small.' : 'Previously shown dishes move behind alternatives when alternatives exist.'} No recipes are generated or changed.</p></div>}
    </> : ready && !error && <p className="notice">Your choices changed. Select Find meal ideas to update your suggestions.</p>}
  </>;
}
