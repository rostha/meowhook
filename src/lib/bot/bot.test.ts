import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { appendActionRows, buildActionRows, buildBotMessage, buildFormModal } from './components';
import { createInteractionEndpoint } from './endpoint';
import { parseFormSubmission, prepareInteraction } from './interactions';
import { assertCanSendChannel, assertSelfRolePermissions, channelPermissions, hasPermission, PERMISSIONS } from './permissions';
import { DiscordRestClient, DiscordRestError } from './rest';
import { verifyDiscordSignature } from './signature';
import type { BotAction, BotCommand, BotConnection, BotForm, BotRepository, DiscordInteraction, DiscordRole } from './types';
import { validBotEmoji, validateBotAction, validateBotCommand, validateBotForm } from './validation';
import { createDefaultMessage } from '../utils';

const guild = '111111111111111111';
const application = '222222222222222222';
const user = '333333333333333333';
const botUser = '444444444444444444';
const roleA = '555555555555555555';
const roleB = '666666666666666666';
const botRole = '777777777777777777';
const channel = '888888888888888888';
const bot: BotConnection = { id: 'meowhook', ownerId: '', applicationId: application, publicKey: '', name: 'Meowhook', token: 'secret' };
const action: BotAction = { id: 'roles', botId: bot.id, guildId: guild, type: 'role', label: 'Choose roles', style: 2, roleIds: [roleA, roleB], selection: 'buttons', enabled: true };
const form: BotForm = { id: 'application', botId: bot.id, guildId: guild, title: 'Apply', confirmation: 'Saved!', enabled: true, fields: [{ id: 'reason', type: 'paragraph', label: 'Why?', required: true, maxLength: 100 }] };
const roles: DiscordRole[] = [
  { id: guild, name: '@everyone', position: 0, permissions: '3072' },
  { id: roleA, name: 'News', position: 1, permissions: '0' },
  { id: roleB, name: 'Events', position: 2, permissions: '0' },
  { id: botRole, name: 'Meowhook', position: 10, permissions: PERMISSIONS.MANAGE_ROLES.toString() },
];

function interaction(data: DiscordInteraction['data'] = { component_type: 2, custom_id: `mh:role:roles:${roleA}` }): DiscordInteraction {
  return { id: '999999999999999999', application_id: application, type: 3, token: 'interaction-token', guild_id: guild, channel_id: channel, member: { user: { id: user, username: 'Alice' }, roles: [roleB], permissions: '0' }, data };
}

function repository(overrides: Partial<BotRepository> = {}): BotRepository {
  const seen = new Set<string>();
  return {
    getAction: vi.fn(async () => action), getForm: vi.fn(async () => form), getCommand: vi.fn(async () => null),
    claimInteraction: vi.fn(async (_botId, interactionId) => { if (seen.has(interactionId)) return false; seen.add(interactionId); return true; }),
    saveSubmission: vi.fn(async () => {}), ...overrides,
  };
}

function mockDiscord() {
  return vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/roles') && init?.method === 'GET') return Response.json(roles);
    if (url.endsWith('/channels') && init?.method === 'GET') return Response.json([]);
    if (url.endsWith('/users/@me')) return Response.json({ id: botUser, username: 'Meowhook' });
    if (url.endsWith(`/members/${botUser}`)) return Response.json({ user: { id: botUser }, roles: [botRole] });
    if (url.endsWith(`/members/${user}`)) return Response.json({ user: { id: user }, roles: [roleB] });
    if (init?.method === 'PUT' || init?.method === 'DELETE') return new Response(null, { status: 204 });
    return Response.json({ id: '123456789012345678', channel_id: channel });
  });
}

describe('Discord signatures and endpoint', () => {
  const keys = generateKeyPairSync('ed25519');
  const publicKey = keys.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
  const now = new Date('2026-10-26T01:02:03Z');
  const timestamp = String(Math.floor(now.getTime() / 1000));
  const raw = JSON.stringify({ type: 1, application_id: application });
  const signature = sign(null, Buffer.from(timestamp + raw), keys.privateKey).toString('hex');

  it('verifies raw bytes and rejects edits, malformed keys, and old/future replays', () => {
    expect(verifyDiscordSignature(raw, signature, timestamp, publicKey, now.getTime())).toBe(true);
    expect(verifyDiscordSignature(`${raw} `, signature, timestamp, publicKey, now.getTime())).toBe(false);
    expect(verifyDiscordSignature(raw, signature, timestamp, 'bad-key', now.getTime())).toBe(false);
    expect(verifyDiscordSignature(raw, signature, timestamp, publicKey, now.getTime() + 301_000)).toBe(false);
    expect(verifyDiscordSignature(raw, signature, timestamp, publicKey, now.getTime() - 301_000)).toBe(false);
  });

  it('answers PING only after verifying Discord', async () => {
    const after = vi.fn();
    const handler = createInteractionEndpoint({ getBot: async () => ({ ...bot, publicKey }), repository: repository(), after, now: () => now });
    const response = await handler(new Request('https://meowhook.test/api/discord', { method: 'POST', body: raw, headers: { 'x-signature-ed25519': signature, 'x-signature-timestamp': timestamp } }), bot.id);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ type: 1 });
    expect(after).not.toHaveBeenCalled();
    const invalid = await handler(new Request('https://meowhook.test/api/discord', { method: 'POST', body: raw }), bot.id);
    expect(invalid.status).toBe(401);
  });

  it('bounds streamed bodies and rejects another application', async () => {
    const handler = createInteractionEndpoint({ getBot: async () => ({ ...bot, publicKey }), repository: repository(), after: vi.fn(), now: () => now });
    expect((await handler(new Request('https://meowhook.test', { method: 'POST', body: 'x'.repeat(128 * 1024 + 1) }), bot.id)).status).toBe(413);
    const body = JSON.stringify({ type: 1, application_id: user });
    const signed = sign(null, Buffer.from(timestamp + body), keys.privateKey).toString('hex');
    expect((await handler(new Request('https://meowhook.test', { method: 'POST', body, headers: { 'x-signature-ed25519': signed, 'x-signature-timestamp': timestamp } }), bot.id)).status).toBe(400);
  });
});

describe('Bot controls and modal payloads', () => {
  it('builds role buttons, allowlisted string menus, and role selects', () => {
    expect(buildActionRows([action])).toMatchObject([{ type: 1, components: [{ custom_id: `mh:role:roles:${roleA}`, style: 2 }, { custom_id: `mh:role:roles:${roleB}` }] }]);
    expect(buildActionRows([{ ...action, selection: 'string-select' }])).toMatchObject([{ components: [{ type: 3, custom_id: 'mh:action:roles', min_values: 0, max_values: 2, options: [{ value: roleA }, { value: roleB }] }] }]);
    expect(buildActionRows([{ ...action, selection: 'role-select' }])).toMatchObject([{ components: [{ type: 6 }] }]);
  });

  it('enforces standard and V2 total component budgets', () => {
    const sixMenus = Array.from({ length: 6 }, (_, index) => ({ ...action, id: `action-${index}`, selection: 'string-select' as const }));
    expect(() => appendActionRows({}, sixMenus)).toThrow('five');
    expect(() => appendActionRows({ flags: 32768, components: Array.from({ length: 39 }, () => ({ type: 10, content: 'Text' })) }, [action])).toThrow('40');
  });

  it('preserves normal embeds and strips webhook impersonation fields', () => {
    const message = { ...createDefaultMessage(), content: 'Hello', username: 'Different name', avatar_url: 'https://example.com/avatar.png', thread_name: 'ignored' };
    const payload = buildBotMessage(message, [action]);
    expect(payload.content).toBe('Hello');
    expect(payload.username).toBeUndefined();
    expect(payload.avatar_url).toBeUndefined();
    expect(payload.thread_name).toBeUndefined();
    expect(payload.allowed_mentions).toEqual({ parse: [] });
    expect(payload.components).toHaveLength(1);
  });

  it('builds modern labelled forms including selects, radio, checkbox and uploads', () => {
    const advanced: BotForm = { ...form, fields: [
      { id: 'text', label: 'Text', type: 'short', required: true, minLength: 1, maxLength: 100 },
      { id: 'select', label: 'Select', type: 'select', required: true, options: [{ label: 'A', value: 'a' }] },
      { id: 'radio', label: 'Radio', type: 'radio', required: true, options: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }] },
      { id: 'check', label: 'Agree', type: 'checkbox', required: false },
      { id: 'upload', label: 'Upload', type: 'file', required: false, maxValues: 2 },
    ] };
    const modal = buildFormModal(advanced);
    expect(modal).toMatchObject({ type: 9, data: { custom_id: 'mh:form:application', components: [{ type: 18, component: { type: 4 } }, { component: { type: 3 } }, { component: { type: 21 } }, { component: { type: 23 } }, { component: { type: 19 } }] } });
    for (const [type, expected] of [['user', 5], ['role', 6], ['mentionable', 7], ['channel', 8], ['checkboxes', 22]] as const) {
      expect(buildFormModal({ ...form, fields: [{ id: 'input', label: 'Choose', type, required: false, ...(type === 'checkboxes' ? { options: [{ label: 'A', value: 'a' }] } : {}) }] }).data?.components).toMatchObject([{ component: { type: expected } }]);
    }
  });

  it('uses optional file values and boolean checkbox answers in modern modal submissions', () => {
    const optional: BotForm = { ...form, fields: [{ id: 'check', label: 'Agree', type: 'checkbox', required: false }, { id: 'upload', label: 'File', type: 'file', required: false }] };
    const fields = buildFormModal(optional).data?.components as Array<{ component: Record<string, unknown> }>;
    expect(fields[0].component).toEqual({ type: 23, custom_id: 'check' });
    expect(fields[1].component).toMatchObject({ type: 19, required: false, min_values: 0, max_values: 1 });
    const submitted = interaction({ components: [{ type: 18, component: { type: 23, custom_id: 'check', value: false } }, { type: 18, component: { type: 19, custom_id: 'upload', values: [] } }] });
    expect(parseFormSubmission(optional, submitted).answers).toEqual({ check: false, upload: [] });
  });

  it('builds a complete V2 menu-only message and respects exact row and nested component budgets', () => {
    const menu = { ...action, selection: 'string-select' as const };
    const message = { ...createDefaultMessage(), componentMode: 'v2' as const, flags: 32768, componentBlocks: [] };
    expect(buildBotMessage(message, [menu])).toMatchObject({ flags: 32768, components: [{ type: 1, components: [{ type: 3 }] }] });
    const menus = (count: number) => Array.from({ length: count }, (_, index) => ({ ...menu, id: `menu-${index}` }));
    expect(appendActionRows({}, menus(5)).components).toHaveLength(5);
    expect(() => appendActionRows({}, menus(6))).toThrow('five');
    expect(appendActionRows({ flags: 32768 }, menus(20)).components).toHaveLength(20);
    expect(() => appendActionRows({ flags: 32768 }, menus(21))).toThrow('40');
  });

  it('validates Discord limits instead of sending unsupported forms/commands', () => {
    expect(validateBotForm({ ...form, fields: Array(6).fill(form.fields[0]) })).toContain('1–5');
    expect(validateBotForm({ ...form, fields: [{ id: 'agree', label: 'Agree', type: 'checkbox', required: true }] })).toContain('cannot be required');
    expect(validateBotAction({ ...action, roleIds: [roleA, roleA] })).toContain('distinct');
    expect(validateBotCommand({ id: 'hello', botId: bot.id, guildId: guild, name: 'Hello', type: 1, description: 'Hi', response: 'Hello', enabled: true })).toContain('lowercase');
  });

  it('accepts keycap, joined and custom emojis while rejecting text or multiple emojis', () => {
    for (const emoji of ['1️⃣', '🇳🇵', '👨‍👩‍👧', '😀', '<:meow:123456789012345678>', '<a:meow:123456789012345678>']) expect(validBotEmoji(emoji), emoji).toBe(true);
    for (const emoji of ['text', '😀😀', ':meow:', '']) expect(validBotEmoji(emoji), emoji).toBe(false);
  });
});

describe('Self-role safety and permissions', () => {
  const currentBot = { roles: [botRole], user: { id: botUser } };
  it('requires Manage Roles and role hierarchy, excluding managed and dangerous roles', () => {
    expect(() => assertSelfRolePermissions(guild, currentBot, roles, [roleA])).not.toThrow();
    expect(() => assertSelfRolePermissions(guild, { roles: [] }, roles, [roleA])).toThrow('Manage Roles');
    expect(() => assertSelfRolePermissions(guild, currentBot, roles.map(role => role.id === roleA ? { ...role, position: 10 } : role), [roleA])).toThrow('above');
    expect(() => assertSelfRolePermissions(guild, currentBot, roles.map(role => role.id === roleA ? { ...role, managed: true } : role), [roleA])).toThrow('managed');
    expect(() => assertSelfRolePermissions(guild, currentBot, roles.map(role => role.id === roleA ? { ...role, permissions: '8' } : role), [roleA])).toThrow('administrative');
    expect(() => assertSelfRolePermissions(guild, currentBot, roles.map(role => role.id === roleA ? { ...role, permissions: String(BigInt(1) << BigInt(22)) } : role), [roleA])).toThrow('moderation');
    expect(() => assertSelfRolePermissions(guild, currentBot, roles, [roleA], [{ id: channel, type: 0, permission_overwrites: [{ id: roleA, type: 0, allow: '16', deny: '0' }] }])).toThrow('channel permissions');
  });

  it('applies everyone then role then member channel overwrites', () => {
    const target = { id: channel, guild_id: guild, type: 0, permission_overwrites: [
      { id: guild, type: 0, deny: '2048', allow: '0' }, { id: botRole, type: 0, deny: '0', allow: '2048' }, { id: botUser, type: 1, deny: '2048', allow: '0' },
    ] };
    expect(hasPermission(channelPermissions(guild, currentBot, roles, target), PERMISSIONS.SEND_MESSAGES)).toBe(false);
    expect(() => assertCanSendChannel(guild, currentBot, roles, target)).toThrow('view and send');
    expect(() => assertCanSendChannel(guild, currentBot, roles, { ...target, guild_id: user })).toThrow('different');
  });
});

describe('Bot interactions', () => {
  it('opens forms immediately without REST calls or deferred acknowledgement', async () => {
    const fetcher = mockDiscord();
    const repo = repository();
    const plan = await prepareInteraction(interaction({ custom_id: 'mh:form:application', component_type: 2 }), bot, repo, { fetch: fetcher });
    expect(plan.response.type).toBe(9);
    expect(plan.run).toBeUndefined();
    expect(repo.claimInteraction).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('defers role changes and deduplicates repeats while preserving unrelated roles', async () => {
    const fetcher = mockDiscord(), repo = repository();
    const plan = await prepareInteraction(interaction(), bot, repo, { fetch: fetcher });
    expect(plan.response).toEqual({ type: 5, data: { flags: 64 } });
    expect(fetcher).not.toHaveBeenCalled();
    await plan.run!(); await plan.run!();
    const changes = fetcher.mock.calls.filter(([, init]) => init?.method === 'PUT' || init?.method === 'DELETE');
    expect(changes).toHaveLength(1);
    expect(changes[0][0]).toBe(`https://discord.com/api/v10/guilds/${guild}/members/${user}/roles/${roleA}`);
    expect(fetcher.mock.calls.at(-1)?.[1]?.body).toContain('1 added');
  });

  it('replaces only allowlisted menu roles and rejects arbitrary role selections', async () => {
    const repo = repository({ getAction: vi.fn(async () => ({ ...action, selection: 'string-select' as const })) }), fetcher = mockDiscord();
    const plan = await prepareInteraction(interaction({ custom_id: 'mh:action:roles', component_type: 3, values: [roleA] }), bot, repo, { fetch: fetcher });
    await plan.run!();
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'DELETE')[0]?.[0]).toContain(`/roles/${roleB}`);
    const invalid = await prepareInteraction(interaction({ custom_id: 'mh:action:roles', component_type: 3, values: [botRole] }), bot, repo, { fetch: fetcher });
    expect(invalid.response.data?.content).toContain('only the roles');
    expect(invalid.run).toBeUndefined();
  });

  it('fails closed for disabled/cross-server actions and wrong component types', async () => {
    const disabled = await prepareInteraction(interaction(), bot, repository({ getAction: async () => ({ ...action, enabled: false }) }));
    expect(disabled.response.data?.content).toContain('no longer available');
    const crossServer = await prepareInteraction(interaction(), bot, repository({ getAction: async () => ({ ...action, guildId: user }) }));
    expect(crossServer.run).toBeUndefined();
    const wrongType = await prepareInteraction(interaction({ custom_id: `mh:role:roles:${roleA}`, component_type: 3 }), bot, repository());
    expect(wrongType.run).toBeUndefined();
  });

  it('validates and persists modal submissions once, then confirms privately', async () => {
    const repo = repository(), fetcher = mockDiscord();
    const submitted = { ...interaction({ custom_id: 'mh:form:application', components: [{ type: 18, component: { type: 4, custom_id: 'reason', value: 'I want to help' } }] }), type: 5 };
    const plan = await prepareInteraction(submitted, bot, repo, { fetch: fetcher });
    expect(plan.response.type).toBe(5);
    await plan.run!(); await plan.run!();
    expect(repo.saveSubmission).toHaveBeenCalledTimes(1);
    expect(repo.saveSubmission).toHaveBeenCalledWith(expect.objectContaining({ formId: form.id, userId: user, answers: { reason: 'I want to help' } }));
    expect(fetcher.mock.calls.at(-1)?.[1]?.body).toContain('Saved!');
  });

  it('keeps form notifications inside their configured server', async () => {
    const repo = repository({ getForm: async () => ({ ...form, responseChannelId: channel }) });
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ id: channel, guild_id: user, type: 0 }));
    const submitted = { ...interaction({ custom_id: 'mh:form:application', components: [{ type: 18, component: { type: 4, custom_id: 'reason', value: 'I want to help' } }] }), type: 5 };
    const plan = await prepareInteraction(submitted, bot, repo, { fetch: fetcher });
    await plan.run!();
    expect(repo.saveSubmission).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
  });

  it('rejects changed forms, overlong answers and untrusted upload URLs', () => {
    const submitted = interaction({ custom_id: 'mh:form:application', components: [{ type: 18, component: { type: 4, custom_id: 'reason', value: 'x'.repeat(101) } }] });
    expect(() => parseFormSubmission(form, submitted)).toThrow('length');
    expect(() => parseFormSubmission({ ...form, fields: [{ ...form.fields[0], id: 'renamed' }] }, submitted)).toThrow('changed');
    const uploadForm: BotForm = { ...form, fields: [{ id: 'upload', type: 'file', label: 'File', required: true }] };
    const uploaded = interaction({ components: [{ type: 18, component: { type: 19, custom_id: 'upload', values: [roleA] } }], resolved: { attachments: { [roleA]: { id: roleA, filename: 'test.png', url: 'https://attacker.test/private', size: 2 } } } });
    expect(() => parseFormSubmission(uploadForm, uploaded)).toThrow('upload URLs');
  });

  it('supports slash, user and message command responses and permission restrictions', async () => {
    for (const type of [1, 2, 3] as const) {
      const command: BotCommand = { id: 'hello', botId: bot.id, guildId: guild, type, name: type === 1 ? 'hello' : 'Hello', description: 'Say hello', response: 'Hi {{username}} / {{target}}', enabled: true };
      const request = { ...interaction({ name: command.name, type, target_id: roleA }), type: 2 };
      const plan = await prepareInteraction(request, bot, repository({ getCommand: async () => command }));
      expect(plan.response.data?.content).toBe(`Hi Alice / ${roleA}`);
      const denied = await prepareInteraction(request, bot, repository({ getCommand: async () => ({ ...command, defaultMemberPermissions: '0' }) }));
      expect(denied.response.data?.content).toContain('permission');
    }
  });
});

describe('Discord REST transport', () => {
  it('sends authenticated requests only to the fixed Discord origin and disables mentions', async () => {
    const fetcher = mockDiscord(), rest = new DiscordRestClient('private-token', { fetch: fetcher });
    await rest.createMessage(channel, { content: '@everyone', allowed_mentions: { parse: ['everyone'] } }, 'schedule-stable-nonce');
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(`https://discord.com/api/v10/channels/${channel}/messages`);
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bot private-token');
    expect(JSON.parse(String(init?.body))).toMatchObject({ allowed_mentions: { parse: [] }, nonce: 'schedule-stable-nonce', enforce_nonce: true });
    await expect(rest.request('GET', '//attacker.test')).rejects.toThrow('Invalid');
    await rest.editInteraction(application, 'interaction-token', { content: 'Done' });
    expect((fetcher.mock.calls[1][1]?.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('builds multipart attachment IDs and lets fetch set the multipart boundary', async () => {
    const fetcher = mockDiscord(), rest = new DiscordRestClient('token', { fetch: fetcher });
    await rest.createMessageWithFiles(channel, { components: [{ type: 13, file: { url: 'attachment://file.txt' } }], flags: 32768 }, [{ name: 'file.txt', bytes: new Uint8Array([1, 2, 3]), contentType: 'text/plain' }], 'nonce');
    const init = fetcher.mock.calls[0][1]!;
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
    expect(init.body).toBeInstanceOf(FormData);
    expect(JSON.parse(String((init.body as FormData).get('payload_json')))).toMatchObject({ attachments: [{ id: 0, filename: 'file.txt' }], nonce: 'nonce', enforce_nonce: true });
    expect((init.body as FormData).get('files[0]')).toBeInstanceOf(Blob);
    expect(() => rest.createMessageWithFiles(channel, {}, [{ name: '../private', bytes: new Uint8Array() }])).toThrow('names');
  });

  it('returns rate-limit metadata without silently retrying side effects', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ retry_after: 2, code: 20028 }, { status: 429 }));
    const rest = new DiscordRestClient('token', { fetch: fetcher });
    await expect(rest.createMessage(channel, { content: 'Hi' })).rejects.toMatchObject({ status: 429, retryAfterMs: 2000, code: 20028 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(new DiscordRestError(403, 50013).message).not.toContain('token');
  });

  it('rejects a multipart request over 25 MiB while preserving the 20 MiB per-file limit', () => {
    const fetcher = mockDiscord(), rest = new DiscordRestClient('token', { fetch: fetcher });
    const size = 13 * 1024 * 1024;
    expect(() => rest.createMessageWithFiles(channel, {}, [{ name: 'one.bin', bytes: new Uint8Array(size) }, { name: 'two.bin', bytes: new Uint8Array(size) }])).toThrow('25 MiB');
    expect(() => rest.createMessageWithFiles(channel, {}, [{ name: 'one.bin', bytes: new Uint8Array(20 * 1024 * 1024 + 1) }])).toThrow('20 MiB');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('registers legal slash/context commands and rejects cross-server overwrites', async () => {
    const fetcher = mockDiscord(), rest = new DiscordRestClient('token', { fetch: fetcher });
    const command: BotCommand = { id: 'hello', botId: bot.id, guildId: guild, type: 2, name: 'Say hello', response: 'Hello', enabled: true };
    await rest.syncGuildCommands(application, guild, [command]);
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual([{ name: 'Say hello', type: 2, default_member_permissions: null }]);
    expect(() => rest.syncGuildCommands(application, guild, [{ ...command, guildId: user }])).toThrow('different');
  });
});
