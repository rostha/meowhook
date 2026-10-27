import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultMessage } from './utils';
import { stripTransientAttachmentsFromTabs } from './draftState';
import { getSendBlockingReason } from './payload';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
const draft = (text: string) => [{ id: 'draft', name: 'Draft', webhookUrl: '', messages: [{ ...createDefaultMessage(), content: text }] }];

function storageHarness() {
  const data = new Map<string, string>();
  const local = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  let queue = Promise.resolve<unknown>(undefined);
  vi.stubGlobal('window', { localStorage: local, sessionStorage: { getItem: () => null, setItem: () => {} } });
  vi.stubGlobal('navigator', { locks: { request: (_name: string, fn: () => unknown) => { const result = queue.then(fn); queue = result.catch(() => {}); return result; } } });
  return { data, local };
}

describe('draft persistence regression coverage', () => {
  it('rejects a stale tab write instead of overwriting newer content, even with concurrent requests', async () => {
    const { data } = storageHarness();
    data.set('meowhook_tabs', JSON.stringify(draft('original')));
    const first = await import('./storage'); first.loadTabs();
    vi.resetModules();
    const second = await import('./storage'); second.loadTabs();
    const results = await Promise.all([first.saveTabs(draft('newer')), second.saveTabs(draft('stale'))]);
    expect(results).toEqual([true, false]);
    expect(second.draftSaveFailure).toBe('conflict');
    expect(JSON.parse(data.get('meowhook_tabs')!)[0].messages[0].content).toBe('newer');
  });

  it('reports failure when custom template persistence is rejected', async () => {
    const { local } = storageHarness();
    local.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
    const storage = await import('./storage');
    expect(await storage.saveCustomTemplates([{ id: 't', name: 'Template', emoji: '', messages: draft('text')[0].messages }])).toBe(false);
  });

  it('retains file identity across serialization and import, and blocks a missing file', async () => {
    storageHarness();
    const tabs = draft('text');
    const file = new File(['hello'], 'sample.txt', { type: 'text/plain' });
    tabs[0].messages[0]._attachments = [{ fieldKey: 'content_file_0', file, previewUrl: 'blob:original' }];
    const first = stripTransientAttachmentsFromTabs(tabs);
    const second = stripTransientAttachmentsFromTabs(tabs);
    expect(first[0].messages[0]._attachments?.[0].fileId).toBe(second[0].messages[0]._attachments?.[0].fileId);
    const { parseImportedDraftData } = await import('./utils');
    const imported = parseImportedDraftData(JSON.parse(JSON.stringify(first)));
    expect(imported[0].messages[0]._attachments?.[0].name).toBe('sample.txt');
    expect(getSendBlockingReason(imported[0].messages, [1])).toContain('File needs re-uploading');
  });

  it('retains durable dashboard file identity after a local draft reload', async () => {
    storageHarness();
    const tabs = draft('text');
    const mediaId = '11111111-1111-4111-8111-111111111111';
    tabs[0].messages[0]._attachments = [{ fieldKey: 'content_file_0', file: new File(['file'], 'file.txt'), previewUrl: 'blob:opened-cloud-file', platformMediaId: mediaId }];
    const saved = stripTransientAttachmentsFromTabs(tabs);
    const { parseImportedDraftData } = await import('./utils');
    const restored = parseImportedDraftData(JSON.parse(JSON.stringify(saved)));
    expect(restored[0].messages[0]._attachments?.[0]).toMatchObject({ platformMediaId: mediaId, name: 'file.txt', previewUrl: expect.stringMatching(/^local-file:/) });
  });
});
