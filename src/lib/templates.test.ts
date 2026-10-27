import { describe, expect, it } from 'vitest';
import { builtinTemplates } from './templates';
import { getSendBlockingReason, buildPayload } from './payload';

describe('built-in template payloads', () => {
  it.each(builtinTemplates)('$name fits Discord limits and has no accidental notifications', (template) => {
    expect(getSendBlockingReason(template.messages, template.messages.map(() => 0))).toBeNull();
    for (const message of template.messages) {
      const payload = JSON.stringify(buildPayload(message));
      expect(payload).not.toMatch(/@everyone|@here|<@|<#/);
      expect(payload).not.toContain('customize');
      expect(message.embeds.every(embed => embed.timestamp === '')).toBe(true);
    }
  });

  it('gives every editable item a unique ID across the library', () => {
    const ids = builtinTemplates.flatMap(t => t.messages.flatMap(m => [m.id, ...m.embeds.flatMap(e => [e.id, ...e.fields.map(f => f.id)])]));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
