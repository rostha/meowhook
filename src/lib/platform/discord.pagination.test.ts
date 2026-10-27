import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DiscordRestClient, paginateDiscordGuilds } from '@/lib/bot/rest';
import { listGuilds, requireBackgroundGuild, requireGuild } from './discord';

vi.mock('@/lib/auth', () => ({ getAuth: async () => ({
  api: { listUserAccounts: async () => [{ id: 'account', providerId: 'discord' }], getAccessToken: async () => ({ accessToken: 'user-token' }) },
  $context: Promise.resolve({ internalAdapter: { findAccounts: async () => [{ id: 'account', providerId: 'discord' }] } }),
}) }));

const guild = (index: number) => ({ id: String(BigInt('111111111111111111') + BigInt(index)), name: `Server ${index}`, icon: null, owner: false, permissions: index === 201 ? '32' : '0' });
const firstPage = Array.from({ length: 200 }, (_, index) => guild(index + 1));

beforeEach(() => {
  vi.stubEnv('DISCORD_BOT_TOKEN', 'bot-token'); vi.stubEnv('DISCORD_APPLICATION_ID', '222222222222222222'); vi.stubEnv('DISCORD_PUBLIC_KEY', 'f'.repeat(64));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('Discord guild cursor pagination', () => {
  it('finds a manageable server beyond both the user and bot first pages', async () => {
    const fetcher = vi.fn<typeof fetch>(async input => new URL(String(input)).searchParams.has('after') ? Response.json([guild(201)]) : Response.json(firstPage));
    vi.stubGlobal('fetch', fetcher);
    const result = await listGuilds(new Headers());
    expect(result).toMatchObject({ connected: true, items: [{ id: guild(201).id, botPresent: true }] });
    expect(result.items).toHaveLength(1); expect(fetcher).toHaveBeenCalledTimes(4);
    const userCalls = fetcher.mock.calls.filter(([, init]) => (init?.headers as Record<string, string>).Authorization.startsWith('Bearer'));
    const botCalls = fetcher.mock.calls.filter(([, init]) => (init?.headers as Record<string, string>).Authorization.startsWith('Bot'));
    expect(userCalls).toHaveLength(2); expect(botCalls).toHaveLength(2);
    for (const calls of [userCalls, botCalls]) {
      expect(new URL(String(calls[0][0])).searchParams.get('limit')).toBe('200');
      expect(new URL(String(calls[1][0])).searchParams.get('after')).toBe(firstPage.at(-1)!.id);
    }
  });

  it('keeps foreground and scheduled permission checks fresh across all pages', async () => {
    const fetcher = vi.fn<typeof fetch>(async input => new URL(String(input)).searchParams.has('after') ? Response.json([guild(201)]) : Response.json(firstPage));
    vi.stubGlobal('fetch', fetcher);
    await expect(requireGuild(new Headers(), guild(201).id, true)).resolves.toMatchObject({ botPresent: true });
    fetcher.mockClear();
    await expect(requireBackgroundGuild('owner', guild(201).id)).resolves.toBeUndefined(); expect(fetcher).toHaveBeenCalledTimes(2);
    for (const [, init] of fetcher.mock.calls) expect(init?.cache).toBe('no-store');
  });

  it('does not return partial access when a later user page fails or repeats', async () => {
    const fetcher = vi.fn<typeof fetch>(async input => new URL(String(input)).searchParams.has('after') ? Response.json({ error: 'revoked' }, { status: 403 }) : Response.json(firstPage));
    vi.stubGlobal('fetch', fetcher);
    await expect(listGuilds(new Headers())).rejects.toMatchObject({ status: 403 }); expect(fetcher).toHaveBeenCalledTimes(2);
    fetcher.mockReset().mockImplementation(async () => Response.json(firstPage));
    await expect(listGuilds(new Headers())).rejects.toMatchObject({ status: 502, message: expect.stringContaining('repeated') }); expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('paginates bot membership independently with a guarded cursor', async () => {
    const fetcher = vi.fn<typeof fetch>(async input => new URL(String(input)).searchParams.has('after') ? Response.json([guild(201)]) : Response.json(firstPage));
    const client = new DiscordRestClient('bot-token', { fetch: fetcher });
    expect(await client.guilds()).toHaveLength(201); expect(fetcher).toHaveBeenCalledTimes(2);
    fetcher.mockReset().mockImplementation(async () => Response.json(firstPage));
    await expect(client.guilds()).rejects.toThrow('repeated'); expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('fails clearly at the bounded page limit instead of truncating guild membership', async () => {
    let page = 0;
    const fetchPage = vi.fn(async () => { const offset = page++ * 200; return Array.from({ length: 200 }, (_, index) => guild(offset + index + 1)); });
    await expect(paginateDiscordGuilds(fetchPage)).rejects.toThrow('too many server pages'); expect(fetchPage).toHaveBeenCalledTimes(100);
  });
});
