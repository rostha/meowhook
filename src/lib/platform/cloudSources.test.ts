import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cloudSource, rememberCloudSource } from './cloudSources';

const memory = new Map<string, string>();
beforeEach(() => {
  memory.clear();
  vi.stubGlobal('localStorage', { getItem: (key: string) => memory.get(key) || null, setItem: (key: string, value: string) => memory.set(key, value) });
});
afterEach(() => vi.unstubAllGlobals());
describe('dashboard identity across editor reloads', () => {
  it('restores the same account message and revision from storage after a new module load', async () => {
    expect(rememberCloudSource('local-message', { id: 'cloud-message', ownerId: 'first-account', revision: 3 })).toBe(true);
    vi.resetModules();
    const reloaded = await import('./cloudSources');
    expect(reloaded.cloudSource('local-message', 'first-account')).toEqual({ id: 'cloud-message', ownerId: 'first-account', revision: 3 });
    expect(reloaded.cloudSource('local-message', 'other-account')).toBeUndefined();
  });
  it('stores only ownership and version metadata, excluding payloads and credentials', () => {
    const source = { id: 'cloud', ownerId: 'owner', revision: 1, payload: { content: 'private' }, webhookUrl: 'secret' };
    rememberCloudSource('local', source);
    expect([...memory.values()].join('')).not.toMatch(/private|secret|payload|webhook/);
  });
  it('fails safely on corrupt or unavailable browser storage', () => {
    memory.set('meowhook_cloud_sources_v1', '{invalid');
    expect(cloudSource('local', 'owner')).toBeUndefined();
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('Unavailable'); }, setItem: () => { throw new Error('Full'); } });
    expect(cloudSource('local', 'owner')).toBeUndefined();
    expect(rememberCloudSource('local', { id: 'cloud', ownerId: 'owner', revision: 1 })).toBe(false);
  });
});
