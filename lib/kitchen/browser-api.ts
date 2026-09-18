import { sealData, unsealData } from 'iron-session';
import { handle, type KitchenEnv } from './api.ts';
import { ApiError } from './errors.ts';
import { authenticate, body, finalize, json } from './http.ts';
import * as V from './validation.ts';

const TTL = 8 * 60 * 60;
const WINDOW = 15 * 60;
type Session = { id: string; origin: string; expiresAt: number };

async function digest(value: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
function secret(env: KitchenEnv): string {
  const value = env.API_TOKEN;
  if (!value || value.length < 32 || value.length > 256 || /REPLACE|CHANGE_ME/.test(value)) {
    throw new ApiError(503, 'AUTH_NOT_CONFIGURED', 'Configure your private API_TOKEN in .dev.vars or Worker secrets.');
  }
  return value;
}
function cookieName(request: Request): string {
  const url = new URL(request.url);
  if (url.protocol === 'https:') return '__Host-vibe-kitchen';
  if (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return 'vibe-kitchen-dev';
  throw new ApiError(403, 'HTTPS_REQUIRED', 'Private browser access requires HTTPS outside localhost.');
}
function setCookie(request: Request, value: string, age: number): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${cookieName(request)}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure}`;
}
function sameOrigin(request: Request, required: boolean): void {
  const origin = request.headers.get('Origin');
  const site = request.headers.get('Sec-Fetch-Site');
  if ((required && !origin) || (origin && origin !== new URL(request.url).origin) || site === 'cross-site') {
    throw new ApiError(403, 'ORIGIN_NOT_ALLOWED', 'Use the kitchen from the same site.');
  }
  if (required && request.headers.get('X-Kitchen-Request') !== '1') {
    throw new ApiError(403, 'CSRF_CHECK_FAILED', 'Use the kitchen interface to make this change.');
  }
}
async function readSession(request: Request, env: KitchenEnv): Promise<Session | null> {
  const password = await digest(`vibe-kitchen/session/v1:${secret(env)}`);
  const name = cookieName(request);
  const values = (request.headers.get('Cookie') ?? '').split(';').map((part) => part.trim()).filter((part) => part.startsWith(`${name}=`));
  if (values.length !== 1) return null;
  const entry = values[0];
  if (!entry || entry.length > 4096) return null;
  let session: Partial<Session>;
  try {
    session = await unsealData<Partial<Session>>(decodeURIComponent(entry.slice(name.length + 1)), { password, ttl: TTL });
  } catch { return null; }
  if (typeof session.id !== 'string' || !/^[a-f0-9]{64}$/.test(session.id) || session.origin !== new URL(request.url).origin || typeof session.expiresAt !== 'number' || session.expiresAt <= Math.floor(Date.now() / 1000)) return null;
  const row = await env.DB.prepare('SELECT expiresAt FROM kitchen_browser_sessions WHERE tokenHash = ?').bind(await digest(session.id)).first<{ expiresAt: number }>();
  return row && row.expiresAt === session.expiresAt ? session as Session : null;
}
async function throttle(request: Request, env: KitchenEnv): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  // CF-Connecting-IP is supplied by Cloudflare in production. No raw IPs are stored.
  const key = await digest(`login:${request.headers.get('CF-Connecting-IP') ?? 'local'}`);
  await env.DB.prepare('DELETE FROM kitchen_login_limits WHERE resetsAt <= ?').bind(now).run();
  const row = await env.DB.prepare(`INSERT INTO kitchen_login_limits(key, attempts, resetsAt) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET attempts = attempts + 1 RETURNING attempts`).bind(key, now + WINDOW).first<{ attempts: number }>();
  if (!row || row.attempts > 10) throw new ApiError(429, 'TOO_MANY_ATTEMPTS', 'Too many unlock attempts. Wait 15 minutes before trying again.');
}

/** Cookie access is an adapter over the existing bearer API. Never sends the key to the browser. */
export async function handleBrowser(request: Request, env: KitchenEnv): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const path = new URL(request.url).pathname.replace(/\/$/, '');
    if (path === '/api/health') return handle(request, env);
    if (path === '/api/session') {
      sameOrigin(request, request.method !== 'GET');
      secret(env);
      if (!env.DB) throw new ApiError(503, 'DATABASE_NOT_CONFIGURED', 'Bind your D1 database as DB.');
      if (request.method === 'GET') {
        const session = await readSession(request, env);
        return finalize(json({ data: { authenticated: session !== null, expiresAt: session?.expiresAt ?? null } }), requestId, null);
      }
      if (request.method === 'POST') {
        await throttle(request, env);
        const input = V.record(await body(request));
        V.keys(input, ['key'], 'unlock');
        const key = V.text(input.key, 'Private key', 256);
        await authenticate(new Request(request.url, { headers: { Authorization: `Bearer ${key}` } }), env);
        const now = Math.floor(Date.now() / 1000);
        const previous = await readSession(request, env);
        if (previous) await env.DB.prepare('DELETE FROM kitchen_browser_sessions WHERE tokenHash = ?').bind(await digest(previous.id)).run();
        await env.DB.prepare('DELETE FROM kitchen_browser_sessions WHERE expiresAt <= ?').bind(now).run();
        const bytes = crypto.getRandomValues(new Uint8Array(32));
        const session: Session = { id: Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(''), origin: new URL(request.url).origin, expiresAt: now + TTL };
        const value = await sealData(session, { password: await digest(`vibe-kitchen/session/v1:${secret(env)}`), ttl: TTL });
        await env.DB.prepare('INSERT INTO kitchen_browser_sessions(tokenHash, expiresAt) VALUES (?, ?)').bind(await digest(session.id), session.expiresAt).run();
        return finalize(json({ data: { authenticated: true, expiresAt: session.expiresAt } }, 200, { 'Set-Cookie': setCookie(request, value, TTL) }), requestId, null);
      }
      if (request.method === 'DELETE') {
        const session = await readSession(request, env);
        if (session) await env.DB.prepare('DELETE FROM kitchen_browser_sessions WHERE tokenHash = ?').bind(await digest(session.id)).run();
        return finalize(new Response(null, { status: 204, headers: { 'Set-Cookie': setCookie(request, '', 0) } }), requestId, null);
      }
      throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Use GET, POST or DELETE.');
    }
    // A supplied bearer header is always checked as-is. Never fall back from a bad key to a cookie.
    if (request.headers.has('Authorization') || request.method === 'OPTIONS') return handle(request, env);
    sameOrigin(request, !['GET', 'HEAD'].includes(request.method));
    const session = await readSession(request, env);
    if (!session) throw new ApiError(401, 'SESSION_EXPIRED', 'Unlock your kitchen again. Unsaved changes remain in this tab.');
    const headers = new Headers(request.headers);
    headers.set('Authorization', `Bearer ${secret(env)}`);
    return handle(new Request(request, { headers }), { ...env, ALLOWED_ORIGIN: new URL(request.url).origin });
  } catch (error) {
    if (error instanceof ApiError) {
      const response = json({ error: { code: error.code, message: error.message, requestId } }, error.status);
      if (error.status === 429) response.headers.set('Retry-After', String(WINDOW));
      return finalize(response, requestId, null);
    }
    console.error(JSON.stringify({ event: 'kitchen_session_failed', requestId }));
    return finalize(json({ error: { code: 'SESSION_STORAGE_NOT_READY', message: 'Browser access needs migration 0002. Run npm run db:migrate:local for your local database, then retry.', requestId } }, 503), requestId, null);
  }
}
