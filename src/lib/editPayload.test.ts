import { describe, expect, it } from 'vitest';
import { buildPayload } from './payload';
import { buildEditPatch, editBaseline, hasEmbeddedDiscordUpload, retainedAttachmentIdsForEdit } from './editPayload';
import { parseDiscordPayloadToMessage, parseImportedDraftData } from './utils';

describe('editing a loaded Discord message', () => {
  it('changes only rich embeds when their description changes', () => {
    const original = {
      id: '789', content: 'Hello <@123>', flags: 4,
      embeds: [
        { type: 'rich', title: 'News', description: 'Before', thumbnail: { url: 'https://example.com/thumb.png' } },
        { type: 'image', url: 'https://example.com/preview.png' },
      ],
      attachments: [],
    };
    const loaded = parseDiscordPayloadToMessage(original);
    const previous = buildPayload(loaded);
    expect(loaded.embeds[0].colorExplicit).toBe(false);
    expect(previous.embeds?.[0].color).toBeUndefined();
    loaded.embeds[0].description = 'After';
    const patch = buildEditPatch(previous, buildPayload(loaded));
    expect(patch).toEqual({ embeds: [{
      title: 'News', description: 'After',
      thumbnail: { url: 'https://example.com/thumb.png' },
    }] });
    expect(patch.content).toBeUndefined();
    expect(patch.flags).toBeUndefined();
  });

  it('adds an accent only when one is chosen for a colorless loaded embed', () => {
    const loaded = parseDiscordPayloadToMessage({ embeds: [{ type: 'rich', title: 'News' }] });
    expect(buildPayload(loaded).embeds?.[0].color).toBeUndefined();
    loaded.embeds[0].color = 0x123456;
    loaded.embeds[0].colorExplicit = true;
    expect(buildPayload(loaded).embeds?.[0].color).toBe(0x123456);
  });

  it('sends explicit empty values when text, embeds and links are removed', () => {
    expect(buildEditPatch(
      { content: 'Before', embeds: [{ title: 'Title' }], components: [{ type: 1, components: [] }], flags: 4 },
      {},
    )).toEqual({ content: '', embeds: [], components: [], flags: 0 });
  });

  it('converts a regular message to V2 by clearing the old fields in the same edit', () => {
    const patch = buildEditPatch(
      { content: 'Old text', embeds: [{ description: 'Old embed' }], components: [{ type: 1, components: [] }] },
      { flags: 32768, components: [{ type: 10, content: 'New layout' }] },
    );
    expect(patch).toEqual({ content: null, embeds: [], flags: 32768, components: [{ type: 10, content: 'New layout' }] });
  });

  it('does not overwrite a remote change to a field left untouched in the loaded draft', () => {
    const loaded = parseDiscordPayloadToMessage({ id: '789', content: 'Original', embeds: [{ type: 'rich', description: 'Before' }] });
    loaded.loadedPayload = buildPayload(loaded);
    loaded.embeds[0].description = 'After';
    const latestFromDiscord = { content: 'Changed elsewhere', embeds: [{ description: 'Before' }] };
    const patch = buildEditPatch(editBaseline(loaded, '789', latestFromDiscord), buildPayload(loaded));
    expect(patch).toHaveProperty('embeds');
    expect(patch.content).toBeUndefined();
    expect(editBaseline(loaded, 'another-id', latestFromDiscord)).toBe(latestFromDiscord);
  });

  it('tracks removal of loaded files while retaining untouched ones', () => {
    const loaded = parseDiscordPayloadToMessage({
      id: '789', embeds: [], attachments: [
        { id: '111', url: 'https://cdn.discordapp.com/attachments/1/111/a.png', filename: 'a.png' },
        { id: '222', url: 'https://cdn.discordapp.com/attachments/1/222/b.png', filename: 'b.png' },
      ],
    });
    expect(loaded._attachments?.map((file) => file.discordId)).toEqual(['111', '222']);
    loaded._attachments = loaded._attachments?.filter((file) => file.discordId !== '222');
    expect(retainedAttachmentIdsForEdit(loaded, '789', ['111', '222'])).toEqual({ ids: ['111'], conflict: false });
    expect(retainedAttachmentIdsForEdit(loaded, '789', ['111', '333'])).toEqual({ ids: ['111'], conflict: true });
  });

  it('keeps edit baseline and file IDs through a saved draft round trip', () => {
    const loaded = parseDiscordPayloadToMessage({
      id: '789', content: 'Hello', embeds: [{ type: 'rich', title: 'No accent' }],
      attachments: [{ id: '111', url: 'https://cdn.discordapp.com/attachments/1/111/a.png', filename: 'a.png' }],
    });
    loaded.loadedPayload = buildPayload(loaded);
    const serialized = JSON.parse(JSON.stringify({ id: 'tab', name: 'Draft', webhookUrl: '', messages: [loaded] }));
    const restored = parseImportedDraftData(serialized)[0].messages[0];
    expect(restored.loadedFromMessageId).toBe('789');
    expect(restored.loadedPayload).toEqual(loaded.loadedPayload);
    expect(restored._attachments?.[0].discordId).toBe('111');
    expect(restored.embeds[0].colorExplicit).toBe(false);
  });

  it('guards file removal when Discord hides an upload inside a rich embed', () => {
    expect(hasEmbeddedDiscordUpload({ embeds: [{ type: 'rich', thumbnail: { url: 'https://cdn.discordapp.com/attachments/1/999/thumb.png' } }] })).toBe(true);
    expect(hasEmbeddedDiscordUpload({ embeds: [{ type: 'rich', thumbnail: { url: 'https://example.com/thumb.png' } }] })).toBe(false);
    expect(hasEmbeddedDiscordUpload({ embeds: [{ type: 'image', image: { url: 'https://cdn.discordapp.com/attachments/1/999/thumb.png' } }] })).toBe(false);
  });
});
