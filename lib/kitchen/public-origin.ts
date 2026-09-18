import { ApiError } from './errors.ts';

/** Use a server-configured public origin when a framework/proxy reconstructs an
 * internal request URL. Never derive the trusted origin from the Origin header. */
export function withPublicOrigin(request: Request, configured?: string): Request {
  if (!configured) return request;
  let origin: URL;
  try {
    origin = new URL(configured);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
    if (origin.origin !== configured || origin.username || origin.password || origin.search || origin.hash || (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && loopback))) throw new Error('Invalid origin');
  } catch {
    throw new ApiError(503, 'PUBLIC_ORIGIN_NOT_CONFIGURED', 'KITCHEN_ORIGIN must be the exact HTTPS origin of this app, or a loopback HTTP origin for local development.');
  }
  const url = new URL(request.url);
  url.protocol = origin.protocol;
  url.host = origin.host;
  // Preserve the browser's original Origin, fetch-metadata, cookies and method.
  return new Request(url, request);
}
