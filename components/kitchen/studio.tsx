'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, errorText, ingredients, type IngredientEntry } from '../../lib/kitchen/client';
import { KitchenContext, ErrorBox, Loading } from './shared';
import { KitchenHeader } from './kitchen-header';
import { ConfirmationContext, KitchenConfirmation, useConfirmationController } from './confirmation';
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
  const session = useRef({ locked: true, started: false, epoch: 0 });
  const navigation = useRef(0);
  const lockOperation = useRef<symbol | null>(null);
  const confirmations = useConfirmationController(started && !locked, route);
  const expire = useCallback(() => {
    session.current.locked = true;
    session.current.epoch++;
    navigation.current++;
    lockOperation.current = null;
    confirmations.setContext(false, currentRoute.current);
    if (session.current.started) window.history.replaceState(null, '', `#${currentRoute.current}`);
    setLocked(true);
    setLocking(false);
  }, [confirmations]);
  const setDirty = useCallback((value: boolean) => { dirty.current = value; }, []);
  const go = useCallback((target: string) => { window.location.hash = target; }, []);
  const refreshIngredients = useCallback(async () => { setEntries(await ingredients()); }, []);
  const unlock = useCallback(() => {
    session.current = { locked: false, started: true, epoch: session.current.epoch + 1 };
    confirmations.setContext(true, currentRoute.current);
    setLocked(false); setStarted(true); setChecking(false); setError('');
  }, [confirmations]);
  useEffect(() => {
    const abort = new AbortController();
    api<{ authenticated: boolean }>('/session', { signal: abort.signal }).then(({ data }) => { if (!abort.signal.aborted && data.authenticated) unlock(); }).catch((cause) => { if (!abort.signal.aborted) setError(errorText(cause)); }).finally(() => { if (!abort.signal.aborted) setChecking(false); });
    const expired = () => { abort.abort(); setChecking(false); expire(); };
    window.addEventListener('kitchen:expired', expired);
    return () => { abort.abort(); window.removeEventListener('kitchen:expired', expired); };
  }, [unlock, expire]);
  useEffect(() => {
    if (!started) return;
    const abort = new AbortController();
    ingredients(abort.signal).then((items) => { if (!abort.signal.aborted) setEntries(items); }).catch((cause) => { if (!abort.signal.aborted) setError(errorText(cause)); });
    return () => abort.abort();
  }, [started]);
  useEffect(() => {
    async function change() {
      const next = routeValue();
      const origin = currentRoute.current;
      const attempt = ++navigation.current;
      // A hash change invalidates any older decision, including feature actions.
      confirmations.cancel();
      if (next === origin) return;
      if (session.current.started && session.current.locked) {
        window.history.replaceState(null, '', `#${origin}`);
        return;
      }
      if (dirty.current) {
        // Restore the committed URL while the decision is pending. The editor
        // stays mounted; neither cancel nor session expiry consumes its draft.
        window.history.replaceState(null, '', `#${origin}`);
        const accepted = await confirmations.request({
          title: 'Leave without saving?',
          description: 'Your unsaved changes will be discarded. Stay here to keep editing.',
          confirmLabel: 'Leave without saving', cancelLabel: 'Keep editing', destructive: true,
        }, undefined, document.activeElement instanceof HTMLElement ? document.activeElement : null);
        if (!accepted || attempt !== navigation.current || session.current.locked || currentRoute.current !== origin) return;
        window.history.replaceState(null, '', `#${next}`);
      }
      confirmations.setContext(!session.current.locked, next);
      dirty.current = false; currentRoute.current = next;
      if (['all', 'saved', 'preferences', 'new'].includes(next)) setDiscovery(null);
      setRoute(next);
    }
    change(); window.addEventListener('hashchange', change);
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    return () => { window.removeEventListener('hashchange', change); window.removeEventListener('beforeunload', beforeUnload); navigation.current++; confirmations.cancel(); };
  }, [confirmations]);
  useEffect(() => {
    if (!started || locked) return;
    const abort = new AbortController();
    const epoch = session.current.epoch;
    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      try { const { data } = await api<{ authenticated: boolean }>('/session', { signal: abort.signal }); if (!abort.signal.aborted && epoch === session.current.epoch && !data.authenticated) expire(); }
      catch { /* Individual requests report connection errors without discarding edits. */ }
    };
    const timer = window.setInterval(check, 60000);
    document.addEventListener('visibilitychange', check);
    return () => { abort.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', check); };
  }, [started, locked, expire]);
  async function lock() {
    if (lockOperation.current || session.current.locked) return;
    const operation = Symbol('lock');
    const epoch = session.current.epoch;
    lockOperation.current = operation;
    try {
      if (dirty.current && !(await confirmations.request({
        title: 'Lock and discard changes?',
        description: 'Lock your kitchen and discard unsaved changes? Saved recipes and notes will stay.',
        confirmLabel: 'Lock and discard', cancelLabel: 'Keep editing', destructive: true,
      }, undefined, document.activeElement instanceof HTMLElement ? document.activeElement : null))) return;
      if (session.current.locked || epoch !== session.current.epoch) return;
      setLocking(true);
      await api('/session', { method: 'DELETE' });
      // An old logout response must never discard a draft retained by expiry or
      // lock a newly authenticated session.
      if (epoch !== session.current.epoch) return;
      confirmations.setContext(false, currentRoute.current);
      session.current = { locked: true, started: false, epoch: epoch + 1 };
      dirty.current = false; setStarted(false); setLocked(true); setEntries([]); setError('');
    } catch (cause) { if (epoch === session.current.epoch) setError(errorText(cause)); }
    finally {
      if (lockOperation.current === operation) { lockOperation.current = null; setLocking(false); }
    }
  }
  const [view = 'discover', id = ''] = route.split('/');
  return <ConfirmationContext.Provider value={confirmations}><div className="kitchen-app">
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
    <KitchenConfirmation controller={confirmations} enabled={started && !locked} />
  </div></ConfirmationContext.Provider>;
}
