'use client';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowRight, Clock3, Users, Search, Bookmark } from 'lucide-react';
import { api, errorText, label, type Page, type Snapshot, type Favourite } from '../../lib/kitchen/client';
import { DishArt, Empty, ErrorBox, Loading, useKitchen } from './shared';

export function RecipeBrowser({ saved }: { saved: boolean }) {
  const { entries, go } = useKitchen();
  const [mode, setMode] = useState('');
  const [main, setMain] = useState('');
  const [status, setStatus] = useState('active');
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<(Snapshot | Favourite)[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  function endpoint(cursor = '') {
    if (saved) return `/favourites?limit=24&after=${encodeURIComponent(cursor)}`;
    const query = new URLSearchParams({ limit: '24', status, after: cursor });
    if (mode) query.set('mode', mode);
    if (main) query.set('main', main);
    if (q) query.set('q', q);
    return `/recipes?${query}`;
  }
  const path = endpoint();
  // A retry starts a new request identity even when its URL is unchanged.
  const request = useMemo(() => ({ path, attempt: retry }), [path, retry]);
  useEffect(() => {
    const abort = new AbortController();
    setBusy(true); setError(''); setItems([]); setNext(null);
    api<Page<Snapshot | Favourite>>(request.path, { signal: abort.signal })
      .then(({ data }) => { if (!abort.signal.aborted) { setItems(data.items); setNext(data.nextAfter); } })
      .catch((cause) => { if (!abort.signal.aborted) setError(errorText(cause)); })
      .finally(() => { if (!abort.signal.aborted) setBusy(false); });
    return () => abort.abort();
  }, [request]);
  async function more() {
    if (!next || busy) return;
    setBusy(true); setError('');
    try {
      const { data } = await api<Page<Snapshot | Favourite>>(endpoint(next));
      setItems((current) => [...current, ...data.items]); setNext(data.nextAfter);
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }
  function search(event: FormEvent) { event.preventDefault(); if (!busy) setQ(input.trim()); }
  return <>
    {!saved && <div className="filter-bar">
      <form className="search-form" onSubmit={search}>
        <Search size={17} aria-hidden="true"/>
        <input aria-label="Search recipe titles" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Find a recipe…" maxLength={160}/>
        <button type="submit" className="button small" disabled={busy}>Search</button>
      </form>
      <select aria-label="Meal type" value={mode} disabled={busy} onChange={(e) => setMode(e.target.value)}>
        <option value="">All meals</option><option value="breakfast">Breakfast</option><option value="dinner">Lunch & dinner</option>
      </select>
      <select aria-label="Main ingredient filter" value={main} disabled={busy} onChange={(e) => setMain(e.target.value)}>
        <option value="">Any main ingredient</option>{entries.map((entry) => <option value={entry.id} key={entry.id}>{entry.ingredient.name}</option>)}
      </select>
      <select aria-label="Recipe status" value={status} disabled={busy} onChange={(e) => setStatus(e.target.value)}>
        <option value="active">Active recipes</option><option value="archived">Archived recipes</option><option value="all">All recipes</option>
      </select>
    </div>}
    <ErrorBox message={error}/>
    {error && <button type="button" className="button" onClick={() => setRetry((n) => n + 1)}>Retry loading recipes</button>}
    {busy && items.length === 0 ? <Loading/> : !error && items.length === 0 ?
      <Empty title={saved ? 'Save something you look forward to.' : 'A fresh page in your cookbook.'}>
        <p>{saved ? 'Open a recipe and choose Save this version. It will be waiting here.' : q || mode || main || status !== 'active' ? 'No recipes match these filters. Try another search or clear the filters.' : 'Your database is connected. Add your first recipe, or import the starter catalogue from the README.'}</p>
        <button type="button" className="button primary" onClick={() => go(saved ? 'discover' : 'new')}>{saved ? 'Explore recipes' : 'Add your first recipe'}<ArrowRight size={16}/></button>
      </Empty> : <div className="recipe-grid">{items.map((item) => {
        const isFavourite = 'recipeId' in item;
        const id = isFavourite ? item.recipeId : item.id;
        const recipe = item.recipe;
        const portion = isFavourite ? recipe.servings.find((s) => s.portions === item.portions) : recipe.servings[0];
        const open = () => go(`${isFavourite ? 'favourite' : 'recipe'}/${id}`);
        return <article className="recipe-card" key={id}>
          <DishArt recipe={recipe}/><div className="card-body">
            <span className="eyebrow">{isFavourite ? 'Saved version' : recipe.mode === 'breakfast' ? 'A different kind of morning' : 'Lunch & dinner'}{recipe.status === 'archived' ? ' · Archived' : ''}</span>
            <h2><button type="button" className="title-button" onClick={open}>{recipe.title}</button></h2>
            <p>{recipe.description || 'A little room for your own finishing touch.'}</p>
            <div className="recipe-meta"><span><Clock3 size={15}/>~{portion?.totalMinutes ?? '—'} min</span><span><Users size={15}/>{portion?.portions ?? '—'} portions</span><span>{label(recipe.main)}</span></div>
            <button type="button" className="button card-link" onClick={open}>{isFavourite && <Bookmark size={16}/>}{isFavourite ? 'Open saved version' : 'Let’s cook'}<ArrowRight size={16}/></button>
          </div>
        </article>;
      })}</div>}
    {next && <div className="load-more"><button type="button" className="button" disabled={busy} onClick={more}>{busy ? 'Loading…' : 'Load more recipes'}</button></div>}
  </>;
}
