import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handleBrowser } from '../lib/kitchen/browser-api.ts';
import { TestD1 } from './d1-adapter.mjs';
const key = '7d'.repeat(32);
const origin = 'https://kitchen.example';
function setup(t) {
  const DB = new TestD1();
  DB.sqlite.exec(readFileSync(new URL('../drizzle/migrations/0002_browser_sessions.sql', import.meta.url), 'utf8'));
  t.after(() => DB.close());
  const env = { DB, API_TOKEN: key };
  const call = (path, method = 'GET', value = undefined, headers = {}) => handleBrowser(new Request(`${origin}/api/${path}`, { method, headers: { Origin: origin, 'X-Kitchen-Request': '1', ...(value === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) }), env);
  return { DB, env, call };
}
test('browser unlock issues an HttpOnly cookie without exposing the private key', async (t) => {
  const { call } = setup(t);
  assert.equal((await call('recipes')).status, 401);
  const response = await call('session', 'POST', { key });
  assert.equal(response.status, 200);
  const header = response.headers.get('Set-Cookie');
  assert.match(header, /^__Host-vibe-kitchen=/);
  assert.match(header, /HttpOnly/); assert.match(header, /Secure/); assert.match(header, /SameSite=Strict/);
  assert.equal(header.includes(key), false);
  assert.equal((await response.text()).includes(key), false);
  const cookie = header.split(';')[0];
  assert.equal((await call('recipes', 'GET', undefined, { Cookie: cookie })).status, 200);
  assert.equal((await call('session', 'GET', undefined, { Cookie: cookie })).status, 200);
  // A bad explicit bearer cannot fall back to a valid browser session.
  assert.equal((await call('recipes', 'GET', undefined, { Cookie: cookie, Authorization: 'Bearer wrong' })).status, 401);
});
test('logout revokes the server-side session, including a copied old cookie', async (t) => {
  const { call } = setup(t);
  const login = await call('session', 'POST', { key });
  const Cookie = login.headers.get('Set-Cookie').split(';')[0];
  const logout = await call('session', 'DELETE', undefined, { Cookie });
  assert.equal(logout.status, 204); assert.match(logout.headers.get('Set-Cookie'), /Max-Age=0/);
  assert.equal((await call('recipes', 'GET', undefined, { Cookie })).status, 401);
});
test('cross-origin login/logout and cookie writes are rejected', async (t) => {
  const { call, env } = setup(t);
  assert.equal((await call('session', 'POST', { key }, { Origin: 'https://other.example' })).status, 403);
  assert.equal((await handleBrowser(new Request(`${origin}/api/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) }), env)).status, 403);
  const login = await call('session', 'POST', { key });
  const Cookie = login.headers.get('Set-Cookie').split(';')[0];
  assert.equal((await call('session', 'DELETE', undefined, { Cookie, Origin: 'null' })).status, 403);
  assert.equal((await call('preferences', 'PUT', {}, { Cookie, 'X-Kitchen-Request': '' })).status, 403);
});
test('expired, tampered and key-rotated sessions do not authenticate', async (t) => {
  const { call, DB, env } = setup(t);
  const login = await call('session', 'POST', { key });
  const Cookie = login.headers.get('Set-Cookie').split(';')[0];
  assert.equal((await call('recipes', 'GET', undefined, { Cookie: `${Cookie}broken` })).status, 401);
  assert.equal((await handleBrowser(new Request(`${origin}/api/recipes`, { headers: { Cookie } }), { ...env, API_TOKEN: 'ab'.repeat(32) })).status, 401);
  DB.sqlite.exec('UPDATE kitchen_browser_sessions SET expiresAt = 1');
  assert.equal((await call('recipes', 'GET', undefined, { Cookie })).status, 401);
});
test('unlock attempts are rate limited in shared database state', async (t) => {
  const { call } = setup(t);
  for (let i = 0; i < 10; i++) assert.equal((await call('session', 'POST', { key: 'bad'.repeat(20) })).status, 401);
  const blocked = await call('session', 'POST', { key });
  assert.equal(blocked.status, 429); assert.equal(blocked.headers.get('Retry-After'), '900');
});
test('the existing bearer API remains usable and local cookies are host scoped', async (t) => {
  const { call, env } = setup(t);
  assert.equal((await call('recipes', 'GET', undefined, { Authorization: `Bearer ${key}` })).status, 200);
  const response = await handleBrowser(new Request('http://localhost:3000/api/session', { method: 'POST', headers: { Origin: 'http://localhost:3000', 'X-Kitchen-Request': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) }), env);
  assert.equal(response.status, 200); assert.match(response.headers.get('Set-Cookie'), /^vibe-kitchen-dev=/); assert.doesNotMatch(response.headers.get('Set-Cookie'), /; Secure/);
  const Cookie = response.headers.get('Set-Cookie').split(';')[0];
  assert.equal((await handleBrowser(new Request('http://127.0.0.1:3000/api/recipes', { headers: { Cookie } }), env)).status, 401);
});
