import test from 'node:test';
import assert from 'node:assert/strict';
import { withPublicOrigin } from '../lib/kitchen/public-origin.ts';
import { allowedOrigin } from '../lib/kitchen/http.ts';

test('public origin defaults to the request URL without trusting browser-supplied headers', () => {
  const request = new Request('https://kitchen.example/api/recipes', { headers: { Origin: 'https://other.example' } });
  assert.equal(withPublicOrigin(request), request);
  assert.throws(() => allowedOrigin(withPublicOrigin(request), {}), (error) => error.status === 403);
});
test('configured origin preserves the path, query, body and untrusted Origin for validation', async () => {
  const request = new Request('https://internal.example/api/session?test=1', { method: 'POST', headers: { Origin: 'http://127.0.0.1:8787', 'Content-Type': 'application/json' }, body: '{"key":"test"}' });
  const publicRequest = withPublicOrigin(request, 'http://127.0.0.1:8787');
  assert.equal(publicRequest.url, 'http://127.0.0.1:8787/api/session?test=1');
  assert.equal(publicRequest.method, 'POST');
  assert.equal(await publicRequest.text(), '{"key":"test"}');
  assert.equal(allowedOrigin(publicRequest, {}), 'http://127.0.0.1:8787');
});
test('configured origin does not let an attacker supply a trusted Origin or downgrade a public site', () => {
  const request = new Request('https://internal.example/api/preferences', { headers: { Origin: 'https://attacker.example' } });
  assert.throws(() => allowedOrigin(withPublicOrigin(request, 'https://kitchen.example'), {}), (error) => error.status === 403);
  for (const origin of ['http://kitchen.example', 'https://kitchen.example/', 'https://user:pass@kitchen.example', 'https://kitchen.example/path', 'null', '*']) {
    assert.throws(() => withPublicOrigin(request, origin), (error) => error.status === 503);
  }
});
