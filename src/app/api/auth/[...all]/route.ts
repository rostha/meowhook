import { getAuth } from '@/lib/auth';
import { platformStatus } from '@/lib/platform/config';
import { readJson, PlatformError } from '@/lib/platform/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function handle(request: Request) {
  const path = new URL(request.url).pathname.replace(/^\/api\/auth/, '').replace(/\/$/, '') || '/';
  const allowed = new Set(['/sign-in/social', '/callback/discord', '/get-session', '/sign-out', '/list-accounts', '/list-sessions', '/revoke-session', '/revoke-sessions', '/revoke-other-sessions', '/ok', '/error']);
  if (!allowed.has(path)) return Response.json({ error: 'Not found.' }, { status: 404 });
  if (request.method === 'POST' && path !== '/callback/discord' && request.headers.get('origin') !== new URL(request.url).origin) {
    return Response.json({ message: 'Open Meowhook to sign in or manage your session.' }, { status: 403 });
  }
  if (!platformStatus().authAvailable) return Response.json({ message: 'Accounts are not configured on this deployment yet.' }, { status: 503 });
  let authRequest = request;
  if (path === '/sign-in/social' && request.method === 'POST') {
    try {
      const body = await readJson(request, 16_384);
      if (body.provider !== 'discord') throw new PlatformError('Use Discord to sign in.');
      const callbacks: Record<string, string> = { callbackURL: '/dashboard', errorCallbackURL: '/login' };
      for (const key of ['callbackURL', 'newUserCallbackURL', 'errorCallbackURL']) {
        if (body[key] === undefined) continue;
        if (typeof body[key] !== 'string') throw new PlatformError('This return address is invalid.');
        const url = new URL(body[key] as string, request.url);
        if (url.origin !== new URL(request.url).origin || url.username || url.password) throw new PlatformError('Return to Meowhook after signing in.', 403);
        callbacks[key] = url.href;
      }
      const headers = new Headers(request.headers); headers.delete('content-length');
      authRequest = new Request(request.url, { method: 'POST', headers, body: JSON.stringify({ provider: 'discord', disableRedirect: true, ...callbacks }) });
    } catch (error) { return Response.json({ message: error instanceof PlatformError ? error.message : 'This sign-in request is invalid.' }, { status: error instanceof PlatformError ? error.status : 400 }); }
  }
  const auth = await getAuth();
  const response = await auth.handler(authRequest);
  if (path !== '/get-session' || !response.ok) return response;
  const session = await response.clone().json();
  if (!session?.user) return response;
  const accounts = await (await auth.$context).internalAdapter.findAccounts(session.user.id);
  const discord = accounts.some(account => account.providerId === 'discord' && /^\d{17,20}$/.test(account.accountId));
  const headers = new Headers(response.headers); headers.delete('content-length');
  const user = { ...session.user };
  if (user.email?.endsWith('@discord.placeholder.invalid')) delete user.email;
  return Response.json(discord ? { ...session, user } : null, { status: response.status, headers });
}
export const GET = handle;
export const POST = handle;
