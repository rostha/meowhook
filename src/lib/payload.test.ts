import { describe, it, expect } from 'vitest';
import { getSendBlockingReason, buildPayload, builtEmbedHasSendableContent, splitSendBlockingReason } from './payload';
import { createDefaultMessage, createDefaultEmbed, createDefaultField } from './utils';
import { MAX_UPLOAD_BYTES } from './uploadLimits';

describe('splitSendBlockingReason', () => {
  it('splits headline and detail on first newline', () => {
    expect(splitSendBlockingReason('Title\nBody line')).toEqual({ headline: 'Title', detail: 'Body line' });
  });
  it('returns single headline when no newline', () => {
    expect(splitSendBlockingReason('Only')).toEqual({ headline: 'Only', detail: '' });
  });
});

describe('getSendBlockingReason', () => {
  it('blocks oversized stored uploads before send while accepting the exact size boundary', () => {
    const msg = createDefaultMessage();
    msg.content = 'An upload';
    msg._attachments = [{ file: { name: 'video.mp4', size: MAX_UPLOAD_BYTES } as File, previewUrl: 'blob:video', fieldKey: 'content_file_0' }];
    expect(getSendBlockingReason([msg], [1])).toBeNull();
    msg._attachments[0].file = { name: 'video.mp4', size: MAX_UPLOAD_BYTES + 1 } as File;
    expect(getSendBlockingReason([msg], [1])).toContain('Message 1: "video.mp4"');
    expect(getSendBlockingReason([msg], [1])).toContain('20 MiB');
  });

  it('checks only active V2 uploads and leaves dormant regular uploads alone', () => {
    const msg = createDefaultMessage();
    msg.componentMode = 'v2'; msg.flags = 32768;
    msg.componentBlocks = [{ id: 'text', type: 'text', content: 'A V2 message' }];
    msg._attachments = [{ file: { name: 'old.pdf', size: MAX_UPLOAD_BYTES + 1 } as File, previewUrl: 'blob:old', fieldKey: 'content_file_0' }];
    expect(getSendBlockingReason([msg], [1])).toBeNull();
    msg.componentBlocks.push({ id: 'file', type: 'file', url: 'blob:old' });
    expect(getSendBlockingReason([msg], [1])).toContain('20 MiB');
  });

  it('does not reject a large retained Discord attachment that is not being uploaded', () => {
    const msg = createDefaultMessage(); msg.content = 'Updated description';
    msg._attachments = [{ file: { name: 'old.pdf', size: MAX_UPLOAD_BYTES + 1 } as File, previewUrl: 'https://cdn.discordapp.com/attachments/1/2/old.pdf', fieldKey: 'content_file_0', discordId: '2', name: 'old.pdf' }];
    expect(getSendBlockingReason([msg], [1])).toBeNull();
  });

  it('counts the message and embed character budgets separately', () => {
    const msg = createDefaultMessage();
    msg.content = 'm'.repeat(2000);
    msg.embeds = [createDefaultEmbed(), createDefaultEmbed()];
    msg.embeds[0].description = 'a'.repeat(4000);
    msg.embeds[1].description = 'b'.repeat(2000);
    expect(getSendBlockingReason([msg], [0])).toBeNull();
    msg.embeds[1].description += 'b';
    expect(getSendBlockingReason([msg], [0])).toContain('6,000');
  });

  it('validates imported text and fields beyond input maxLength limits', () => {
    const msg = createDefaultMessage();
    msg.content = 'a'.repeat(2001);
    expect(getSendBlockingReason([msg], [0])).toContain('2,000');
    msg.content = '';
    msg.embeds = [createDefaultEmbed()];
    msg.embeds[0].title = 'a'.repeat(257);
    expect(getSendBlockingReason([msg], [0])).toContain('256');
    msg.embeds[0].title = 'Title';
    msg.embeds[0].fields = Array.from({ length: 26 }, () => ({ ...createDefaultField(), name: 'Name', value: 'Value' }));
    expect(getSendBlockingReason([msg], [0])).toContain('25 fields');
  });

  it('ignores removed components from legacy drafts', () => {
    const msg = { ...createDefaultMessage(), components: [{ type: 1, components: [{ type: 2 }] }] };
    expect(buildPayload(msg)).not.toHaveProperty('components');
    expect(getSendBlockingReason([msg], [0])).toContain('Nothing to send');
  });
  it('blocks blank message with no attachments', () => {
    const msg = createDefaultMessage();
    msg.content = '   ';
    const r = getSendBlockingReason([msg], [0]);
    expect(r).toContain('Nothing to send');
    expect(r).toMatch(/add text/i);
  });

  it('allows message with trimmed content', () => {
    const msg = createDefaultMessage();
    msg.content = 'hi';
    expect(getSendBlockingReason([msg], [0])).toBeNull();
  });

  it('blocks empty embed slot', () => {
    const msg = createDefaultMessage();
    const emb = createDefaultEmbed();
    // Strip default color so buildPayload yields {} (Discord rejects empty embed objects)
    // @ts-expect-error — intentional for test: optional color in runtime object
    emb.color = undefined;
    msg.embeds = [emb];
    expect(buildPayload(msg).embeds?.[0]).toEqual({});
    const r = getSendBlockingReason([msg], [0]);
    expect(r).toContain('Empty embed slot');
    expect(r).toContain('embed 1');
  });

  it('blocks default color-only embed (no visible fields)', () => {
    const msg = createDefaultMessage();
    msg.embeds = [createDefaultEmbed()];
    const built = buildPayload(msg).embeds?.[0];
    expect(built).toBeDefined();
    expect(builtEmbedHasSendableContent(built!)).toBe(false);
    const r = getSendBlockingReason([msg], [0]);
    expect(r).toMatch(/title|description|field|image/i);
  });

  it('allows title-only embed', () => {
    const msg = createDefaultMessage();
    const emb = createDefaultEmbed();
    emb.title = 'Announcement';
    msg.embeds = [emb];
    expect(getSendBlockingReason([msg], [0])).toBeNull();
  });

  it('allows fields-only embed', () => {
    const msg = createDefaultMessage();
    const emb = createDefaultEmbed();
    emb.fields = [{ id: 'test-field', name: 'A', value: 'B', inline: false }];
    msg.embeds = [emb];
    expect(getSendBlockingReason([msg], [0])).toBeNull();
  });

  it('allows image-only embed', () => {
    const msg = createDefaultMessage();
    const emb = createDefaultEmbed();
    emb.image = { url: 'https://example.com/x.png' };
    msg.embeds = [emb];
    expect(getSendBlockingReason([msg], [0])).toBeNull();
  });

  it('allows embed with description only', () => {
    const msg = createDefaultMessage();
    const emb = createDefaultEmbed();
    emb.description = 'Hello world';
    msg.embeds = [emb];
    expect(getSendBlockingReason([msg], [0])).toBeNull();
  });

  it('blocks partial embed field (name without value)', () => {
    const msg = createDefaultMessage();
    const emb = createDefaultEmbed();
    const f = createDefaultField();
    f.name = 'Label';
    f.value = '';
    emb.fields = [f];
    msg.embeds = [emb];
    const r = getSendBlockingReason([msg], [0]);
    expect(r).toMatch(/field 1/i);
    expect(r).toMatch(/name|value/i);
  });

  it('blocks partial embed field (value without name)', () => {
    const msg = createDefaultMessage();
    const emb = createDefaultEmbed();
    const f = createDefaultField();
    f.name = '';
    f.value = 'Body';
    emb.fields = [f];
    msg.embeds = [emb];
    expect(getSendBlockingReason([msg], [0])).not.toBeNull();
  });
});
