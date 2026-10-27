import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadTabs } from './storage';

afterEach(() => vi.unstubAllGlobals());
describe('saved draft recovery', () => {
  it('recovers valid tabs alongside malformed browser data', () => {
    const data = [null, { id: 'good', name: 'Saved', webhookUrl: '', messages: [{ content: 'Keep this', embeds: [{}] }] }];
    vi.stubGlobal('window', {
      localStorage: { getItem: (key: string) => key === 'meowhook_tabs' ? JSON.stringify(data) : null },
      sessionStorage: { getItem: () => '{"unexpected":true}' },
    });
    const tabs = loadTabs();
    expect(tabs).toHaveLength(1);
    expect(tabs?.[0].id).toBe('good');
    expect(tabs?.[0].messages[0].content).toBe('Keep this');
    expect(tabs?.[0].messages[0].embeds[0].fields).toEqual([]);
  });
});
