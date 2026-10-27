import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/platform/commands/sync/route';
import { getDatabase, migratePlatform, type Database } from './database';
import { PlatformRepository } from './repository';
import { requireGuild, botClient } from './discord';
import { requireSession, PlatformError } from './http';

vi.mock('./discord', () => ({ requireGuild: vi.fn(), botClient: vi.fn() }));
vi.mock('./config', () => ({ applicationId: () => '111111111111111111' }));
vi.mock('./http', async original => ({ ...await original<typeof import('./http')>(), requireSession: vi.fn() }));
const applicationId = '111111111111111111', guildId = '222222222222222222';
const sync = vi.fn().mockResolvedValue([{ id: 'published' }]);
let db: Database; let repository: PlatformRepository;
beforeAll(async () => { vi.stubEnv('NODE_ENV', 'test'); vi.stubEnv('DATABASE_URL', ''); vi.stubEnv('MEOWHOOK_LOCAL_DATABASE', ':memory:'); db = getDatabase(); await migratePlatform(db); repository = new PlatformRepository(db); });
beforeEach(async () => {
  await db.deleteFrom('platform_resource').execute(); sync.mockClear();
  vi.mocked(requireSession).mockResolvedValue({ user: { id: 'first-admin' } } as Awaited<ReturnType<typeof requireSession>>);
  vi.mocked(requireGuild).mockResolvedValue({ id: guildId, name: 'Community', icon: null, botPresent: true, permissions: '32' });
  vi.mocked(botClient).mockReturnValue({ syncGuildCommands: sync } as unknown as ReturnType<typeof botClient>);
});
afterAll(async () => { await db.destroy(); vi.unstubAllEnvs(); });
const request = () => new Request('http://localhost:3000/api/platform/commands/sync', { method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' }, body: JSON.stringify({ guildId }) });
describe('server-wide command publishing', () => {
  it('preserves other administrators and binds commands created before bot setup', async () => {
    const fields = { guildId, name: 'help', type: 1, enabled: true, response: 'Hello', description: 'Help' };
    await repository.put('commands', 'first-admin', { ...fields, botId: applicationId });
    await repository.put('commands', 'second-admin', { ...fields, name: 'apply', botId: 'meowhook' });
    await repository.put('commands', 'third-admin', { ...fields, name: 'elsewhere', botId: applicationId, guildId: '333333333333333333' });
    const response = await POST(request());
    expect(response.status).toBe(200);
    const commands = sync.mock.calls[0][2];
    expect(commands.map((command: { name: string }) => command.name).sort()).toEqual(['apply', 'help']);
    expect(commands.every((command: { botId: string }) => command.botId === applicationId)).toBe(true);
  });
  it('does not call Discord after server authorization is revoked', async () => {
    vi.mocked(requireGuild).mockRejectedValueOnce(new PlatformError('No access.', 403));
    expect((await POST(request())).status).toBe(403); expect(sync).not.toHaveBeenCalled();
  });
});
