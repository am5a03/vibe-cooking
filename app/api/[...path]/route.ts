import { getCloudflareContext } from '@opennextjs/cloudflare';
import { handleBrowser } from '../../../lib/kitchen/browser-api.ts';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
async function route(request: Request) {
  if (new URL(request.url).pathname === '/api/health' && request.method === 'GET') {
    return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
  }
  try {
    const { env } = await getCloudflareContext({ async: true });
    return await handleBrowser(request, env);
  } catch {
    return Response.json({ error: { code: 'RUNTIME_NOT_READY', message: 'Start using the documented OpenNext configuration.' } }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
export { route as GET, route as POST, route as PUT, route as DELETE, route as PATCH, route as OPTIONS };
