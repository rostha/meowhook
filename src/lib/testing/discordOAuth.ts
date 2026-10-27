/** Test transport only. The real OAuth state, callback, account and session code still runs. */
interface TestAuth { handler(request: Request): Promise<Response> }
export interface TestDiscordProfile {
  id: string; username: string; global_name: string | null; discriminator: string;
  avatar: string | null; email?: string | null; verified?: boolean;
}
export function mockDiscordOAuth(baseURL: string) {
  let sequence = 0;
  const codes = new Map<string, TestDiscordProfile>();
  const tokens = new Map<string, TestDiscordProfile>();
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    if (url.href === 'https://discord.com/api/oauth2/token') {
      const body = new URLSearchParams(init?.body ? String(init.body) : input instanceof Request ? await input.text() : '');
      const profile = codes.get(body.get('code') || '');
      if (!profile) return Response.json({ error: 'invalid_grant' }, { status: 400 });
      const accessToken = `test-access-${profile.id}-${sequence}`;
      tokens.set(accessToken, profile);
      return Response.json({ access_token: accessToken, refresh_token: `test-refresh-${profile.id}`, token_type: 'Bearer', expires_in: 3600, scope: 'identify guilds' });
    }
    if (url.origin === 'https://discord.com' && decodeURIComponent(url.pathname) === '/api/users/@me') {
      const profile = tokens.get((headers.get('authorization') || '').replace(/^Bearer /, ''));
      return profile ? Response.json(profile) : Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    throw new Error(`Unexpected OAuth test request: ${url.origin}${url.pathname}`);
  };
  return {
    fetch: fetcher,
    async signIn(auth: TestAuth, userId: string, overrides: Partial<TestDiscordProfile> = {}, requestData: Record<string, unknown> = {}) {
      const code = `test-code-${++sequence}`;
      codes.set(code, { id: userId, username: `member_${userId}`, global_name: 'Discord member', discriminator: '0', avatar: null, ...overrides });
      const start = await auth.handler(new Request(`${baseURL}/api/auth/sign-in/social`, { method: 'POST', headers: { origin: baseURL, 'content-type': 'application/json' },
        body: JSON.stringify({ ...requestData, provider: 'discord', callbackURL: '/dashboard', errorCallbackURL: '/login' }) }));
      if (start.status !== 200) throw new Error(`OAuth start failed (${start.status}): ${await start.text()}`);
      const result = await start.json();
      const authorization = new URL(result.url);
      const state = authorization.searchParams.get('state');
      if (!state) throw new Error('OAuth state was not generated.');
      const stateCookies = start.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
      const callback = new URL('/api/auth/callback/discord', baseURL);
      callback.search = new URLSearchParams({ code, state }).toString();
      const response = await auth.handler(new Request(callback, { headers: { cookie: stateCookies } }));
      const location = new URL(response.headers.get('location') || '/login?error=missing_redirect', baseURL);
      if (response.status !== 302 || location.pathname !== '/dashboard') throw new Error(`OAuth callback failed (${response.status}): ${location.pathname}${location.search}`);
      const cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
      const sessionResponse = await auth.handler(new Request(`${baseURL}/api/auth/get-session`, { headers: { cookie } }));
      const session = await sessionResponse.json();
      if (!session?.user?.id) throw new Error('Discord OAuth did not create a session.');
      return { cookie, id: session.user.id as string, authorizationUrl: authorization.href, callbackUrl: callback.href, stateCookie: stateCookies };
    },
  };
}
