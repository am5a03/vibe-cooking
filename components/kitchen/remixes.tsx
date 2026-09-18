'use client';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import { api, errorText, label } from '../../lib/kitchen/client';
import { compareServings } from '../../lib/kitchen/exploration';
import type { MealSnapshot, RemixResult, VariationCandidate, VariationConnection, VariationsResult } from '../../lib/kitchen/exploration-client';
import { DishArt, ErrorBox, Field, Loading, useKitchen } from './shared';

function axisName(axis: string, breakfast = false) { return axis === 'main' ? 'Main ingredient' : axis === 'flavor' ? 'Flavour' : breakfast ? 'Breakfast format' : 'Technique'; }
export function Comparison({ source, target, portions }: { source: MealSnapshot; target: MealSnapshot; portions: number }) {
  const { entries } = useKitchen();
  const before = source.recipe.servings.find((profile) => profile.portions === portions);
  const after = target.recipe.servings.find((profile) => profile.portions === portions);
  if (!before || !after) return <p className="notice">Both recipes need an authored profile for {portions} portions.</p>;
  const differences = compareServings(before, after);
  const name = (id: string) => entries.find((entry) => entry.id === id)?.ingredient.name ?? label(id);
  return <div className="remix-comparison">
    <div className="comparison-meals"><section><span className="eyebrow">The familiar starting point</span><h3>{source.recipe.title}</h3><p>{portions} portions · ~{before.totalMinutes} min total · {before.activeMinutes} min active</p><p className="fineprint">{before.equipment.map(label).join(' · ')}<br/>{before.capacity}</p></section><section><span className="eyebrow">Something a little different</span><h3>{target.recipe.title}</h3><p>{portions} portions · ~{after.totalMinutes} min total · {after.activeMinutes} min active</p><p className="fineprint">{after.equipment.map(label).join(' · ')}<br/>{after.capacity}</p></section></div>
    <div className="comparison-axes">{(['main', 'flavor', 'method'] as const).map((axis) => <div key={axis}><strong>{axisName(axis, source.recipe.mode === 'breakfast')}</strong><span>{label(source.recipe[axis])}{source.recipe[axis] === target.recipe[axis] ? ' · kept' : ` → ${label(target.recipe[axis])}`}</span></div>)}</div>
    <h4>Ingredients: what stays, what changes</h4>
    <ul className="component-diff">{differences.map((item) => <li key={`${item.ingredientId}-${item.role}`} className={`diff-${item.kind}`}><span className="diff-badge">{label(item.kind)}</span><div><strong>{name(item.ingredientId)}</strong><small>{label(item.role)}</small><p>{item.before.map((line) => `${line.quantity} ${line.unit}${line.preparation ? ` (${line.preparation})` : ''}`).join(' + ')}{item.kind !== 'kept' && ' → '}{item.kind !== 'kept' && (item.after.length ? item.after.map((line) => `${line.quantity} ${line.unit}${line.preparation ? ` (${line.preparation})` : ''}`).join(' + ') : 'Not used')}</p></div></li>)}</ul>
    <details className="comparison-steps"><summary>Compare complete cooking steps</summary><div className="comparison-meals">{[before, after].map((profile, index) => <section key={index === 0 ? 'source' : 'target'}><h4>{index === 0 ? 'Original' : 'Alternative'}</h4><ol>{profile.steps.map((step, order) => <li key={`${order}-${step.title}`}><strong>{step.title}</strong><p>{step.instruction}</p></li>)}</ol></section>)}</div></details>
    <p className="fineprint">The alternative has its own complete instructions. This comparison does not rewrite or automatically scale either recipe.</p>
  </div>;
}

export function RemixPanel({ source, portions }: { source: MealSnapshot; portions: number }) {
  const { go, discovery, setDiscovery, entries } = useKitchen();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<RemixResult | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const request = useMemo(() => ({ open, sourceId: source.id, sourceRevision: source.revision, mode: source.recipe.mode, portions, discovery, attempt }), [open, source.id, source.revision, source.recipe.mode, portions, discovery, attempt]);
  useEffect(() => {
    if (!request.open) return;
    const abort = new AbortController();
    setBusy(true); setResult(null); setSelected(null); setError('');
    api<RemixResult>(`/recipes/${request.sourceId}/remix-options`, { method: 'POST', signal: abort.signal, value: {
      sourceRevision: request.sourceRevision, mode: request.mode, portions: request.portions,
      ...(request.discovery ? { maxMinutes: request.discovery.maxMinutes, requiredIngredient: request.discovery.requiredIngredient } : {}),
    } }).then(({ data }) => { if (!abort.signal.aborted) setResult(data); }).catch((cause) => { if (!abort.signal.aborted) setError(errorText(cause)); }).finally(() => { if (!abort.signal.aborted) setBusy(false); });
    return () => abort.abort();
  }, [request]);
  const current = result?.items.find((item) => item.connectionId === selected);
  const name = (id: string) => entries.find((entry) => entry.id === id)?.ingredient.name ?? label(id);
  return <section className="panel remix-studio">
    <div className="remix-heading"><div><span className="eyebrow">Recipe remix</span><h2>Keep the anchor. <em>Change the experience.</em></h2><p>Preview a reviewed variation before choosing it.</p></div><button type="button" className="button primary" aria-expanded={open} onClick={() => setOpen((value) => !value)}><Sparkles size={17}/>{open ? 'Close variations' : 'Explore variations'}</button></div>
    {open && <><ErrorBox message={error}/>{error && <button type="button" className="button" onClick={() => setAttempt((value) => value + 1)}>Retry variations</button>}{busy ? <Loading/> : result && <>
      <div className="constraint-strip"><span>{result.constraints.portions} portions</span><span>{result.constraints.maxMinutes ? `Up to ${result.constraints.maxMinutes} minutes` : 'Any cooking time'}</span>{result.constraints.requiredIngredient && <span>Includes {name(result.constraints.requiredIngredient)}</span>}<span>{result.excludedIngredientIds.length ? `Excluding: ${result.excludedIngredientIds.map(name).join(', ')}` : 'No saved exclusions'}</span></div>
      {result.blockedSource ? <p className="notice">This starting recipe does not meet your current discovery choices ({label(result.blockedSource)}). It remains available to edit, but no alternatives are recommended under these constraints.</p> : result.items.length === 0 ? <p className="notice">No reviewed variations match these choices yet. You can review and connect recipes through Manage variations.</p> : <div className="remix-options">{result.items.map((item) => <button type="button" key={item.connectionId} className={`remix-option${selected === item.connectionId ? ' selected' : ''}`} aria-pressed={selected === item.connectionId} onClick={() => setSelected(item.connectionId)}><span className="eyebrow">Change {axisName(item.axis, source.recipe.mode === 'breakfast').toLowerCase()}</span><strong>{item.target.recipe.title}</strong><span>Preview the difference<ArrowRight size={14}/></span></button>)}</div>}
      {current && <div className="remix-preview"><Comparison source={result.source} target={current.target} portions={portions}/><button type="button" className="button primary" onClick={() => { setDiscovery(result.constraints); go(`recipe/${current.target.id}`); }}>Use this recipe<ArrowRight size={16}/></button><p className="fineprint">Opens the alternative. The original, your saved versions and notes stay unchanged.</p></div>}
      {(result.staleCount > 0 || result.filteredCount > 0) && <p className="fineprint">{result.staleCount} connections need review after edits. {result.filteredCount} other connections do not meet your current choices. No exclusions were relaxed.</p>}
    </>}<button type="button" className="text-link" onClick={() => go(`variations/${source.id}`)}>Manage variations</button></>}
  </section>;
}

export function VariationManager({ id }: { id: string }) {
  const { go } = useKitchen();
  const [result, setResult] = useState<VariationsResult | null>(null);
  const [selection, setSelection] = useState<(VariationCandidate & { connection?: VariationConnection }) | null>(null);
  const [portions, setPortions] = useState(0);
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState('');
  const request = useMemo(() => ({ id, attempt }), [id, attempt]);
  useEffect(() => {
    const abort = new AbortController();
    setBusy(true); setError(''); setResult(null); setSelection(null); setReviewed(false);
    api<VariationsResult>(`/recipes/${request.id}/variations`, { signal: abort.signal }).then(({ data }) => { if (!abort.signal.aborted) setResult(data); }).catch((cause) => { if (!abort.signal.aborted) setError(errorText(cause)); }).finally(() => { if (!abort.signal.aborted) setBusy(false); });
    return () => abort.abort();
  }, [request]);
  function select(value: VariationCandidate & { connection?: VariationConnection }) {
    setSelection(value); setPortions(value.portions[0]); setReviewed(false); setNotice('');
  }
  async function confirm() {
    if (!selection || !result || !reviewed || busy) return;
    setBusy(true); setError('');
    try {
      const connection = selection.connection;
      await api(connection ? `/remixes/${connection.id}` : '/remixes', { method: connection ? 'PUT' : 'POST', tag: connection?.tag, value: {
        sourceId: result.source.id, sourceRevision: result.source.revision,
        targetId: selection.target.id, targetRevision: selection.target.revision, axis: selection.axis,
      } });
      setNotice(connection ? 'Connection reconfirmed for the reviewed versions.' : 'Reviewed connection saved in both directions.');
      setAttempt((value) => value + 1);
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }
  async function remove(connection: VariationConnection) {
    if (!window.confirm('Remove this variation link? Both recipes and their saved versions will stay.')) return;
    setBusy(true); setError('');
    try { await api(`/remixes/${connection.id}`, { method: 'DELETE', tag: connection.tag }); setNotice('Connection removed. Recipes were not deleted.'); setAttempt((value) => value + 1); }
    catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }
  return <>
    <button type="button" className="back-link" onClick={() => go(`recipe/${id}`)}><ArrowLeft size={16}/>Back to recipe</button>
    <div className="page-heading"><div><span className="eyebrow">Your catalogue, thoughtfully connected</span><h1>One change. <em>More possibilities.</em></h1><p>Review complete recipes, then connect the versions you trust as alternatives.</p></div></div>
    <ErrorBox message={error}/>{error && <button type="button" className="button" onClick={() => setAttempt((value) => value + 1)}><RefreshCw size={16}/>Reload comparisons</button>}
    <output className="save-status">{notice}</output>
    {!result ? busy && <Loading/> : <>
      <div className="notice"><strong>Managing variations for {result.source.recipe.title} · revision {result.source.revision}</strong><p>This is catalogue maintenance, not meal discovery: excluded ingredients can appear here. Discovery applies your exclusions before recommending anything.</p></div>
      <section className="panel"><h2>Reviewed connections</h2>{result.connections.length === 0 && <p>No connections yet. Start by reviewing a candidate below.</p>}<div className="connection-list">{result.connections.map((connection) => <div className="connection-row" key={connection.id}><div><strong>{connection.target.recipe.title}</strong><p><span className={connection.stale ? 'review-badge stale' : 'review-badge'}>{connection.stale ? 'Needs review' : 'Reviewed'}</span> {axisName(connection.axis, result.source.recipe.mode === 'breakfast')}</p></div><div className="button-row"><button type="button" className="button small" disabled={busy || !connection.currentAxis || !connection.portions.length} onClick={() => { if (connection.currentAxis) select({ target: connection.target, axis: connection.currentAxis, portions: connection.portions, connection }); }}>{connection.stale ? 'Review changes' : 'Review connection'}</button><button type="button" className="button small" disabled={busy} onClick={() => remove(connection)} aria-label={`Remove connection to ${connection.target.recipe.title}`}><Trash2 size={15}/></button></div>{(!connection.currentAxis || !connection.portions.length) && <p className="fineprint">This pair no longer differs by exactly one axis with a shared portion size. Edit the recipes or remove the link.</p>}</div>)}</div></section>
      <section className="panel"><h2>Possible variations</h2><p>These recipes share the meal type and two of the three main choices. They are candidates, not automatically approved remixes.</p><Field label="Search variation candidates"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by recipe title"/></Field><div className="remix-options">{result.candidates.filter((item) => item.target.recipe.title.toLowerCase().includes(search.toLowerCase())).map((candidate) => <button type="button" className="remix-option" key={candidate.target.id} disabled={busy} onClick={() => select(candidate)}><span className="eyebrow">Change {axisName(candidate.axis, result.source.recipe.mode === 'breakfast').toLowerCase()}</span><strong>{candidate.target.recipe.title}</strong><span>Review this candidate<ArrowRight size={14}/></span></button>)}</div>{!result.candidates.length && <p className="fineprint">Add another recipe with the same meal type, two matching axes, and a common portion profile. A copy alone is not a remix until one axis changes.</p>}</section>
      {selection && <section className="panel review-panel"><h2>Review before connecting.</h2><Field label="Compare portion size"><select value={portions} onChange={(event) => { setPortions(Number(event.target.value)); setReviewed(false); }}>{selection.portions.map((value) => <option key={value} value={value}>{value} portions</option>)}</select></Field><Comparison source={result.source} target={selection.target} portions={portions}/><label className="review-check"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)}/>I reviewed the ingredient changes and cooking instructions for these recipe versions.</label><button type="button" className="button primary" disabled={busy || !reviewed} onClick={confirm}><Check size={16}/>{selection.connection ? 'Reconfirm connection' : 'Confirm connection'}</button><p className="fineprint">The connection covers their shared authored portion profiles. Review each one above before confirming. Editing either recipe requires reconfirmation.</p></section>}
    </>}
  </>;
}
