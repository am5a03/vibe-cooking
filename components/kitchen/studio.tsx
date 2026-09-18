'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, errorText, ingredients, type IngredientEntry } from '../../lib/kitchen/client';
import { KitchenContext, ErrorBox, Loading } from './shared';
import { KitchenHeader } from './kitchen-header';
import { Unlock } from './unlock';
import { Discovery } from './discovery';
import { VariationManager } from './remixes';
import type { DiscoveryConstraints } from '../../lib/kitchen/exploration-client';
import { RecipeBrowser } from './browser';
import { RecipeDetail } from './recipe';
import { RecipeEditor } from './editor';
import { PreferencesPanel } from './preferences';

function routeValue() {
  const route = window.location.hash.slice(1);
  return /^(discover|all|saved|preferences|new|(?:recipe|favourite|edit|duplicate|variations)\/[A-Za-z0-9_-]+)$/.test(route) ? route : 'discover';
}
export function Studio() {
  const [checking, setChecking] = useState(true);
  const [started, setStarted] = useState(false);
  const [locked, setLocked] = useState(true);
  const [route, setRoute] = useState('discover');
  const [discovery, setDiscovery] = useState<DiscoveryConstraints | null>(null);
  const [entries, setEntries] = useState<IngredientEntry[]>([]);
  const [error, setError] = useState('');
  const [locking, setLocking] = useState(false);
  const dirty = useRef(false);
  const currentRoute = useRef('discover');
  const setDirty = useCallback((value: boolean) => { dirty.current = value; }, []);
  const go = useCallback((target: string) => { window.location.hash = target; }, []);
  const refreshIngredients = useCallback(async () => { setEntries(await ingredients()); }, []);
  const unlock = useCallback(() => { setLocked(false); setStarted(true); setChecking(false); setError(''); }, []);
  useEffect(() => {
    const abort = new AbortController();
    api<{ authenticated: boolean }>('/session', { signal: abort.signal }).then(({ data }) => { if (!abort.signal.aborted && data.authenticated) unlock(); }).catch((cause) => { if (!abort.signal.aborted) setError(errorText(cause)); }).finally(() => { if (!abort.signal.aborted) setChecking(false); });
    const expired = () => setLocked(true);
    window.addEventListener('kitchen:expired', expired);
    return () => { abort.abort(); window.removeEventListener('kitchen:expired', expired); };
  }, [unlock]);
  useEffect(() => {
    if (!started) return;
    const abort = new AbortController();
    ingredients(abort.signal).then((items) => { if (!abort.signal.aborted) setEntries(items); }).catch((cause) => { if (!abort.signal.aborted) setError(errorText(cause)); });
    return () => abort.abort();
  }, [started]);
  useEffect(() => {
    function change() {
      const next = routeValue();
      if (next === currentRoute.current) return;
      if (dirty.current && !window.confirm('Leave without saving your changes?')) { window.history.replaceState(null, '', `#${currentRoute.current}`); return; }
      dirty.current = false; currentRoute.current = next;
      if (['all', 'saved', 'preferences', 'new'].includes(next)) setDiscovery(null);
      setRoute(next);
    }
    change(); window.addEventListener('hashchange', change);
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    return () => { window.removeEventListener('hashchange', change); window.removeEventListener('beforeunload', beforeUnload); };
  }, []);
  useEffect(() => {
    if (!started || locked) return;
    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      try { const { data } = await api<{ authenticated: boolean }>('/session'); if (!data.authenticated) setLocked(true); }
      catch { /* Individual requests report connection errors without discarding edits. */ }
    };
    const timer = window.setInterval(check, 60000);
    document.addEventListener('visibilitychange', check);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', check); };
  }, [started, locked]);
  async function lock() {
    if (dirty.current && !window.confirm('Lock your kitchen and discard unsaved changes?')) return;
    setLocking(true);
    try { await api('/session', { method: 'DELETE' }); dirty.current = false; setStarted(false); setLocked(true); setEntries([]); setError(''); }
    catch (cause) { setError(errorText(cause)); }
    finally { setLocking(false); }
  }
  const [view = 'discover', id = ''] = route.split('/');
  return <div className="kitchen-app">
    <KitchenHeader view={view} unlocked={started && !locked} locking={locking} onNavigate={go} onLock={lock} />
    {checking ? <Loading/> : locked && <><ErrorBox message={error}/><Unlock expired={started} onUnlock={unlock}/></>}
    {started && <div hidden={locked}><KitchenContext.Provider value={{ entries, refreshIngredients, go, setDirty, discovery, setDiscovery }}>
      <main className="workspace"><ErrorBox message={error}/>
        {error && <Button variant="outline" type="button" onClick={() => { setError(''); refreshIngredients().catch((cause) => setError(errorText(cause))); }}>Retry ingredient connection</Button>}
        {view === 'discover' ? <Discovery/> : view === 'variations' ? <VariationManager key={route} id={id}/> : view === 'all' || view === 'saved' ? <>
          <div className="page-heading"><div><span className="eyebrow">{view === 'saved' ? 'Worth coming back to' : 'A little inspiration, on your terms'}</span><h1>{view === 'saved' ? <>Your personal <em>cookbook.</em></> : <>Every recipe. <em>Your way.</em></>}</h1><p>{view === 'saved' ? 'The exact recipes you saved, with room for your own notes.' : 'Start with a complete dish. Make it yours, one good idea at a time.'}</p></div><Button type="button" className="h-11 gap-2 text-[13px] font-semibold" onClick={() => go('new')}><Plus className="size-[17px]" aria-hidden="true"/>Add a recipe</Button></div>
          <RecipeBrowser key={view} saved={view === 'saved'}/>
        </> : view === 'preferences' ? <PreferencesPanel/> : ['new', 'edit', 'duplicate'].includes(view) ? <RecipeEditor key={route} mode={view as 'new' | 'edit' | 'duplicate'} id={id}/> : <RecipeDetail key={route} id={id} saved={view === 'favourite'}/>}
      </main>
    </KitchenContext.Provider><footer className="site-footer"><span>One kitchen. Many possibilities.</span><span><span className="status-dot"/>Stored in your D1 database · Recipe drafts, not kitchen-tested</span></footer></div>}
  </div>;
}
