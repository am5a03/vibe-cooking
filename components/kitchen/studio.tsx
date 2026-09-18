'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { BookOpen, Bookmark, Leaf, LockKeyhole, Plus, SlidersHorizontal, ArrowRight } from 'lucide-react';
import { api, errorText, ingredients, type IngredientEntry } from '../../lib/kitchen/client';
import { KitchenContext, ErrorBox, Loading } from './shared';
import { RecipeBrowser } from './browser';
import { RecipeDetail } from './recipe';
import { RecipeEditor } from './editor';
import { PreferencesPanel } from './preferences';

function routeValue() {
  const route = window.location.hash.slice(1);
  return /^(discover|saved|preferences|new|(?:recipe|favourite|edit|duplicate)\/[A-Za-z0-9_-]+)$/.test(route) ? route : 'discover';
}
function Unlock({ expired, onUnlock }: { expired: boolean; onUnlock: () => void }) {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await api('/session', { method: 'POST', value: { key } }); onUnlock(); }
    catch (cause) { setError(errorText(cause)); }
    finally { setKey(''); setBusy(false); }
  }
  return <main className="unlock-layout"><div className="unlock-story"><span className="eyebrow">A kitchen of your own</span><h1>Good food.<br/><em>Your way.</em></h1><p>Keep the recipes you love.<br/>Make room for something new.</p><div className="story-mark"><Leaf size={118} strokeWidth={0.8}/></div></div><section className="unlock-card"><LockKeyhole size={26}/><span className="eyebrow">Vibe Cooking / Personal kitchen</span><h2>{expired ? 'Welcome back.' : 'Come on in.'}</h2><p>{expired ? 'Unlock again to continue. Unsaved changes are kept in this tab.' : 'Unlock your private recipe studio with the API_TOKEN you configured on the server.'}</p><form onSubmit={submit}><label className="field"><span>Private kitchen key</span><input type="password" autoComplete="current-password" required minLength={32} maxLength={256} value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste your private key"/></label><ErrorBox message={error}/><button className="button primary full" disabled={busy}>{busy ? 'Unlocking…' : 'Unlock my kitchen'}<ArrowRight size={17}/></button></form><p className="fineprint">No registration. The key is not saved in browser storage. Your session lasts up to eight hours.</p><details className="setup-help"><summary>First time here?</summary><p>Apply the new browser-session migration with <code>npm run db:migrate:local</code>. Keep using your existing <code>API_TOKEN</code>; no second secret is required. For a remote instance, apply reviewed remote migrations instead.</p></details></section></main>;
}
export function Studio() {
  const [checking, setChecking] = useState(true);
  const [started, setStarted] = useState(false);
  const [locked, setLocked] = useState(true);
  const [route, setRoute] = useState('discover');
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
    api<{ authenticated: boolean }>('/session', { signal: abort.signal }).then(({ data }) => { if (data.authenticated) unlock(); }).catch((cause) => { if (!abort.signal.aborted) setError(errorText(cause)); }).finally(() => { if (!abort.signal.aborted) setChecking(false); });
    const expired = () => setLocked(true);
    window.addEventListener('kitchen:expired', expired);
    return () => { abort.abort(); window.removeEventListener('kitchen:expired', expired); };
  }, [unlock]);
  useEffect(() => {
    if (!started) return;
    const abort = new AbortController();
    ingredients(abort.signal).then(setEntries).catch((cause) => { if (!abort.signal.aborted) setError(errorText(cause)); });
    return () => abort.abort();
  }, [started]);
  useEffect(() => {
    function change() {
      const next = routeValue();
      if (next === currentRoute.current) return;
      if (dirty.current && !window.confirm('Leave without saving your changes?')) { window.history.replaceState(null, '', `#${currentRoute.current}`); return; }
      dirty.current = false; currentRoute.current = next; setRoute(next);
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
      try { const { data } = await api<{ authenticated: boolean }>('/session'); if (!data.authenticated) setLocked(true); } catch { /* Individual requests report connection errors without discarding edits. */ }
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
  return <div className="kitchen-app"><header className="site-header"><button className="brand" type="button" onClick={() => go('discover')} aria-label="Vibe Cooking home"><span className="brand-mark"><Leaf size={24}/></span><span>Vibe Cooking<span className="brand-sub">The personal kitchen</span></span></button>{started && !locked && <><nav aria-label="Main navigation"><button type="button" className={view === 'discover' ? 'active' : ''} onClick={() => go('discover')}><BookOpen size={17}/>Recipes</button><button type="button" className={view === 'saved' ? 'active' : ''} onClick={() => go('saved')}><Bookmark size={17}/>My kitchen</button><button type="button" className={view === 'preferences' ? 'active' : ''} onClick={() => go('preferences')}><SlidersHorizontal size={17}/>Preferences</button></nav><button type="button" className="button subtle lock-button" onClick={lock} disabled={locking}><LockKeyhole size={16}/>{locking ? 'Locking…' : 'Lock'}</button></>}</header>{checking ? <Loading/> : locked && <><ErrorBox message={error}/><Unlock expired={started} onUnlock={unlock}/></>}{started && <div hidden={locked}><KitchenContext.Provider value={{ entries, refreshIngredients, go, setDirty }}><main className="workspace"><ErrorBox message={error}/>{error && <button className="button" type="button" onClick={() => { setError(''); refreshIngredients().catch((cause) => setError(errorText(cause))); }}>Retry ingredient connection</button>}{view === 'discover' || view === 'saved' ? <><div className="page-heading"><div><span className="eyebrow">{view === 'saved' ? 'Worth coming back to' : 'A little inspiration, on your terms'}</span><h1>{view === 'saved' ? <>Your personal <em>cookbook.</em></> : <>What sounds <em>good?</em></>}</h1><p>{view === 'saved' ? 'The exact recipes you saved, with room for your own notes.' : 'Start with a complete dish. Make it yours, one good idea at a time.'}</p></div><button type="button" className="button primary" onClick={() => go('new')}><Plus size={17}/>Add a recipe</button></div><RecipeBrowser key={view} saved={view === 'saved'}/></> : view === 'preferences' ? <PreferencesPanel/> : ['new', 'edit', 'duplicate'].includes(view) ? <RecipeEditor key={route} mode={view as 'new' | 'edit' | 'duplicate'} id={id}/> : <RecipeDetail key={route} id={id} saved={view === 'favourite'}/>}</main></KitchenContext.Provider><footer className="site-footer"><span>One kitchen. Many possibilities.</span><span><span className="status-dot"/>Stored in your D1 database · Recipe drafts, not kitchen-tested</span></footer></div>}</div>;
}
