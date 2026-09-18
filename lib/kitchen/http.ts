import { ApiError } from './errors.ts';
import type { Env } from './types.ts';

export const MAX_BODY_BYTES = 128 * 1024;
export function json(value: unknown, status = 200, headers: HeadersInit = {}): Response {
  const output = new Headers(headers);
  output.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(value), { status, headers: output });
}
export function etag(kind: string, id: string, revision: number): string {
  return `"${kind}:${id}:${revision}"`;
}
export function checkRevision(request: Request, kind: string, id: string, revision: number): void {
  const expected = request.headers.get('If-Match');
  if (!expected) throw new ApiError(428, 'PRECONDITION_REQUIRED', 'Send the ETag from the latest GET in an If-Match header.');
  if (expected !== etag(kind, id, revision)) throw new ApiError(412, 'REVISION_CONFLICT', 'This record changed. Fetch it again and reconcile your edit.');
}
export async function body(request: Request): Promise<unknown> {
  if (request.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
    throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send Content-Type: application/json.');
  }
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'INVALID_JSON', 'A JSON request body is required.');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new ApiError(413, 'BODY_TOO_LARGE', `Body limit is ${MAX_BODY_BYTES} bytes.`);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new ApiError(400, 'INVALID_JSON', 'The request body must contain valid UTF-8 JSON.'); }
}
export async function authenticate(request: Request, env: Env): Promise<void> {
  const configured = env.API_TOKEN;
  if (!configured || configured.length < 32 || configured.length > 256 || /REPLACE|CHANGE_ME/.test(configured)) {
    throw new ApiError(503, 'AUTH_NOT_CONFIGURED', 'Set a random API_TOKEN secret before using this API.');
  }
  const authorization = request.headers.get('Authorization') || '';
  const token = /^Bearer ([^\s]{32,256})$/i.exec(authorization)?.[1];
  if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'A valid Bearer token is required.');
  // Fixed-size digests; compare every byte and never log credentials.
  const encoder = new TextEncoder();
  const [expected, received] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(configured)),
    crypto.subtle.digest('SHA-256', encoder.encode(token)),
  ]);
  const a = new Uint8Array(expected);
  const b = new Uint8Array(received);
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a[index] ^ b[index];
  if (difference !== 0) throw new ApiError(401, 'UNAUTHORIZED', 'A valid Bearer token is required.');
}
export function allowedOrigin(request: Request, env: Env): string | null {
  const incoming = request.headers.get('Origin');
  if (incoming === null) return null;
  const allowed = env.ALLOWED_ORIGIN || new URL(request.url).origin;
  if (incoming === 'null' || allowed === '*' || incoming !== allowed) throw new ApiError(403, 'ORIGIN_NOT_ALLOWED', 'This browser origin is not allowed.');
  try {
    const url = new URL(allowed);
    if (url.origin !== allowed || !['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid origin');
  } catch { throw new ApiError(503, 'ORIGIN_NOT_CONFIGURED', 'Configure ALLOWED_ORIGIN as one exact HTTP(S) origin without a path.'); }
  return incoming;
}
export function finalize(response: Response, requestId: string, origin: string | null): Response {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('X-Request-Id', requestId);
  headers.set('Vary', 'Origin');
  if (response.status === 401) headers.set('WWW-Authenticate', 'Bearer');
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Expose-Headers', 'ETag, X-Request-Id');
  }
  return new Response(response.body, { status: response.status, headers });
}
