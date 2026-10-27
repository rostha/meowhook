import { generateKeyPairSync, sign } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { getDatabase, migratePlatform } from '../platform/database';
import { PlatformRepository } from '../platform/repository';
import { platformBotRepository } from '../platform/botRepository';
import { createInteractionEndpoint } from './endpoint';
import type { BotConnection } from './types';

describe('Signed interactions with the persistent platform repository', () => {
  const keys = generateKeyPairSync('ed25519');
  const applicationId = '222222222222222222';
  const guildId = '111111111111111111';
  const userId = '333333333333333333';
  const bot: BotConnection = { id: applicationId, ownerId: 'system', applicationId, name: 'Meowhook', publicKey: keys.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex'), token: 'test-token' };
  const now = new Date('2026-10-26T01:02:03Z');
  const timestamp = String(Math.floor(now.getTime() / 1000));
  let formId = '';
  let repository: PlatformRepository;

  const request = (data: Record<string, unknown>) => {
    const raw = JSON.stringify(data);
    return new Request('https://meowhook.test/api/discord/interactions/app', { method: 'POST', body: raw,
      headers: { 'x-signature-ed25519': sign(null, Buffer.from(timestamp + raw), keys.privateKey).toString('hex'), 'x-signature-timestamp': timestamp } });
  };

  beforeAll(async () => {
    vi.stubEnv('NODE_ENV', 'test'); vi.stubEnv('VERCEL', ''); vi.stubEnv('DATABASE_URL', ''); vi.stubEnv('MEOWHOOK_LOCAL_DATABASE', ':memory:');
    await migratePlatform(getDatabase());
    repository = new PlatformRepository();
    const form = await repository.put('forms', 'owner-alice', { botId: applicationId, guildId, title: 'Volunteer', enabled: true, confirmation: 'Thank you', fields: [{ id: 'reason', type: 'short', label: 'Why?', required: true, maxLength: 100 }] });
    formId = form.id;
  });

  afterAll(async () => { await getDatabase().destroy(); vi.unstubAllEnvs(); });

  it('acknowledges first, then persists a private form response to its owning account exactly once', async () => {
    const queued: Array<() => Promise<void>> = [];
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({}));
    const handler = createInteractionEndpoint({ getBot: async () => bot, repository: platformBotRepository, after: work => queued.push(work), fetch: fetcher, now: () => now });
    const data = { id: '999999999999999999', application_id: applicationId, type: 5, token: 'test-response-token', guild_id: guildId, channel_id: '888888888888888888', member: { roles: [], user: { id: userId, username: 'Alice' } }, data: { custom_id: `mh:form:${formId}`, components: [{ type: 18, component: { type: 4, custom_id: 'reason', value: 'Helping the community' } }] } };
    const first = await handler(request(data), bot.id);
    expect(await first.json()).toEqual({ type: 5, data: { flags: 64 } });
    expect(await repository.list('responses', 'owner-alice')).toEqual([]);
    await queued.shift()!();
    expect(await repository.list('responses', 'owner-alice')).toMatchObject([{ formId, ownerId: 'owner-alice', userId, answers: { reason: 'Helping the community' } }]);
    expect(await repository.list('responses', 'owner-bob')).toEqual([]);
    await handler(request(data), bot.id); await queued.shift()!();
    expect(await repository.list('responses', 'owner-alice')).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const stored = await getDatabase().selectFrom('platform_resource').select('data').where('kind', '=', 'responses').executeTakeFirst();
    expect(stored?.data).not.toContain('test-response-token');
  });

  it('does not expose another server’s form and honours disabled configuration', async () => {
    const queued = vi.fn();
    const handler = createInteractionEndpoint({ getBot: async () => bot, repository: platformBotRepository, after: queued, now: () => now });
    const data = { id: '999999999999999998', application_id: applicationId, type: 3, token: 'test-response-token', guild_id: userId, member: { roles: [], user: { id: userId } }, data: { custom_id: `mh:form:${formId}`, component_type: 2 } };
    expect((await (await handler(request(data), bot.id)).json()).data.content).toContain('no longer available');
    const form = await repository.get('forms', 'owner-alice', formId);
    await repository.put('forms', 'owner-alice', { ...form!, enabled: false }, form!);
    expect((await (await handler(request({ ...data, guild_id: guildId }), bot.id)).json()).data.content).toContain('no longer available');
    expect(queued).not.toHaveBeenCalled();
  });

  it('atomically claims an interaction once across simultaneous workers', async () => {
    const claims = await Promise.all(Array.from({ length: 5 }, () => platformBotRepository.claimInteraction(bot.id, 'concurrent-request')));
    expect(claims.filter(Boolean)).toHaveLength(1);
  });
});
