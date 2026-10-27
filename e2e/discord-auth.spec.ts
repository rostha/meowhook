import { test, expect, type Page, type Route } from '@playwright/test';

const status = { authAvailable: true, discordConfigured: true, discordLogin: true, botConfigured: true, schedulerConfigured: false };
const discordId = '323456789012345678';
const avatar = `https://cdn.discordapp.com/avatars/${discordId}/avatar.png`;
const user = { id: 'discord-account', name: 'Community member', image: avatar };
const identity = { id: discordId, username: 'community_member', displayName: 'Community member', avatarUrl: avatar };
const saved = { id: 'saved-message', ownerId: user.id, name: 'Community announcement', guildId: '', channelId: '', payload: { content: 'Welcome everyone' }, actionIds: [], revision: 1, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' };
const guild = { id: '223456789012345678', name: 'Test community', icon: null, botPresent: true, permissions: '32' };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2foAAAAASUVORK5CYII=', 'base64');

async function mockDashboard(page: Page, guilds: (route: Route) => Promise<void>, authStatus = 200) {
  await page.route('https://cdn.discordapp.com/**', route => route.fulfill({ contentType: 'image/png', body: png }));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/get-session') return route.fulfill({ status: authStatus, json: authStatus === 200 ? { user } : { error: 'Sign in to continue.' } });
    if (path === '/api/platform/status') return route.fulfill({ json: status });
    if (path === '/api/platform/account') return route.fulfill({ json: { user, discordLinked: true, discordUser: identity } });
    if (path === '/api/platform/guilds') return guilds(route);
    if (path === '/api/platform/messages') return route.fulfill({ json: { items: [saved] } });
    if (/^\/api\/platform\/(actions|forms|responses|schedules|commands)$/.test(path)) return route.fulfill({ json: { items: [] } });
    return route.fulfill({ status: 404, json: { error: 'Not found in this test.' } });
  });
}

test('Discord sign-in is the only account entry point when configured', async ({ page }) => {
  await page.route('**/api/platform/status', route => route.fulfill({ json: status }));
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in with Discord', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue with Discord', exact: true })).toBeEnabled();
  await expect(page.locator('input[type="email"],input[type="password"]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Back to editor' })).toBeVisible();
});

test('unconfigured Discord sign-in remains disabled and readable at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.route('**/api/platform/status', route => route.fulfill({ json: { ...status, authAvailable: false, discordLogin: false, discordConfigured: false } }));
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Continue with Discord', exact: true })).toBeDisabled();
  await expect(page.getByText('Discord sign-in is not available on this deployment yet. The webhook editor is still available.', { exact: true })).toBeVisible();
  await expect(page.locator('input[type="email"],input[type="password"]')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});

test('leaving sign-in cancels a pending OAuth response without a late redirect', async ({ page }) => {
  await page.route('**/api/platform/status', route => route.fulfill({ json: status }));
  let release!: () => void;
  let requested!: () => void;
  let delivered!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { requested = resolve; });
  const complete = new Promise<void>(resolve => { delivered = resolve; });
  let providerRequests = 0;
  await page.route('https://discord.com/**', async route => { providerRequests++; await route.abort(); });
  await page.route('**/api/auth/sign-in/social', async route => {
    expect(route.request().postDataJSON()).toMatchObject({ provider: 'discord', callbackURL: '/dashboard' });
    requested(); await pending;
    await route.fulfill({ json: { url: 'https://discord.com/oauth2/authorize?client_id=222222222222222222' } }).catch(() => {});
    delivered();
  });
  await page.goto('/login');
  await page.getByRole('button', { name: 'Continue with Discord', exact: true }).click();
  await started;
  await page.getByRole('link', { name: 'Back to editor' }).click();
  await expect(page.locator('#previewPanel')).toBeVisible();
  release(); await complete;
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(providerRequests).toBe(0);
  await expect(page).toHaveURL(/\/$/);
});

for (const failure of [429, 502]) {
  test(`a server-list ${failure} preserves Discord identity and saved messages until a retry recovers`, async ({ page }) => {
    let calls = 0;
    await mockDashboard(page, route => {
      calls++;
      return calls === 1 ? route.fulfill({ status: failure, json: { error: 'Discord servers are temporarily unavailable.' } }) : route.fulfill({ json: { connected: true, items: [guild] } });
    });
    await page.goto('/dashboard#messages');
    await expect(page.getByLabel('Signed in with Discord as Community member', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Signed in with Discord as Community member', { exact: true }).locator('img')).toHaveAttribute('src', avatar);
    await expect(page.getByText(saved.name, { exact: true })).toBeVisible();
    await expect(page.getByText('Discord servers could not be refreshed. Your saved workspace is still available.', { exact: true })).toBeVisible();
    const retry = page.getByRole('button', { name: 'Retry loading servers', exact: true });
    await expect(retry).toBeVisible();
    await retry.click();
    await expect(retry).not.toBeVisible();
    await page.getByRole('button', { name: 'Servers', exact: true }).click();
    await expect(page.getByText(guild.name, { exact: true })).toBeVisible();
    expect(calls).toBe(2);
    await expect(page).toHaveURL(/\/dashboard#servers$/);
  });
}

test('an expired account session returns to Discord sign-in', async ({ page }) => {
  await mockDashboard(page, route => route.fulfill({ json: { connected: true, items: [] } }), 401);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: 'Continue with Discord', exact: true })).toBeVisible();
  await expect(page.locator('input[type="email"],input[type="password"]')).toHaveCount(0);
});
