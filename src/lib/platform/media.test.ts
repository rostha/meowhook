import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDatabase, migratePlatform, type Database } from './database';
import { completeMedia, getMedia, registerMedia, validMedia } from './media';

let db: Database;
const victimId = '11111111-1111-4111-8111-111111111111';
const uploadId = '22222222-2222-4222-8222-222222222222';
const metadata = { name: 'cat.png', size: 4, type: 'image/png' };
beforeAll(async () => {
  vi.stubEnv('MEOWHOOK_LOCAL_DATABASE', ':memory:'); vi.stubEnv('DATABASE_URL', ''); vi.stubEnv('NODE_ENV', 'test');
  db = getDatabase(); await migratePlatform(db);
});
beforeEach(async () => { await db.deleteFrom('platform_resource').execute(); });
afterAll(async () => { await db.destroy(); vi.unstubAllEnvs(); });

describe('account media registration boundaries', () => {
  it('ignores client-supplied identity, ownership, ready state and storage locations', async () => {
    const original = await registerMedia('victim-owner', metadata, victimId);
    const spoofed = { ...metadata, id: victimId, ownerId: 'victim-owner', ready: true, blobUrl: 'https://evil.example/file', pathname: '../other' };
    const media = await registerMedia('actual-owner', spoofed, uploadId, `platform/${uploadId}/cat.png`);
    expect(media).toEqual({ ...metadata, id: uploadId, ownerId: 'actual-owner', ready: false, pathname: `platform/${uploadId}/cat.png` });
    await completeMedia(media);
    expect(await getMedia(victimId, 'victim-owner')).toEqual(original);
    expect(await getMedia(uploadId, 'actual-owner')).toMatchObject({ id: uploadId, ownerId: 'actual-owner', ready: true });
    expect(await getMedia(uploadId, 'victim-owner')).toBeNull();
  });
  it.each([null, {}, { ...metadata, name: 123 }, { ...metadata, name: '../file' }, { ...metadata, type: undefined },
    { ...metadata, type: 123 }, { ...metadata, type: 'image/png\r\nOther: header' }, { ...metadata, size: '4' },
    { ...metadata, size: 0 }, { ...metadata, size: 20 * 1024 * 1024 + 1 }])('returns a controlled error for malformed file metadata %j', value => {
    expect(() => validMedia(value as typeof metadata)).toThrow();
    try { validMedia(value as typeof metadata); } catch (error) { expect(error).toHaveProperty('status'); }
  });
  it('accepts the exact upload boundary and refuses a daily excess', async () => {
    expect(() => validMedia({ ...metadata, size: 20 * 1024 * 1024 })).not.toThrow();
    const at = new Date().toISOString();
    await db.insertInto('platform_resource').values(Array.from({ length: 100 }, (_, i) => ({ id: `media-${i}`, owner_id: 'owner', kind: 'media', guild_id: '', data: '{}', revision: 1, created_at: at, updated_at: at }))).execute();
    await expect(registerMedia('owner', metadata, uploadId)).rejects.toMatchObject({ status: 429 });
  });
});
