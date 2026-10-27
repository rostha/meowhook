import { describe, expect, it } from 'vitest';
import { componentAttachmentUrl, findComponentAttachment } from './componentAttachments';
import { validateComponentBlocks } from './messageComponents';
import type { FileAttachment } from './types';

describe('component uploaded-file reuse', () => {
  it('retains the owned hosted URL when a saved dashboard file is reused', () => {
    const attachment: FileAttachment = { fieldKey: 'component_file_saved', name: 'guide.pdf', previewUrl: 'https://meowhook.com/api/platform/media/12345678-1234-1234-1234-123456789abc', platformMediaId: '12345678-1234-1234-1234-123456789abc' };
    const url = componentAttachmentUrl(attachment);
    expect(url).toBe(attachment.previewUrl);
    expect(findComponentAttachment(url, [attachment])).toBe(attachment);
    expect(validateComponentBlocks([{ id: 'file', type: 'file', url }], 'Message 1', false, [attachment])).toBeNull();
  });

  it('still keeps Discord attachment references for files loaded from a sent webhook', () => {
    expect(componentAttachmentUrl({ fieldKey: 'component_file_old', name: 'guide.pdf', discordId: '123456789012345678', previewUrl: 'https://cdn.discordapp.com/attachments/guide.pdf' })).toBe('attachment://guide.pdf');
  });

  it('does not accept a remote file URL without upload metadata as a Discord file block', () => {
    const attachment: FileAttachment = { fieldKey: 'component_file_remote', name: 'guide.pdf', previewUrl: 'https://example.com/guide.pdf' };
    expect(validateComponentBlocks([{ id: 'file', type: 'file', url: attachment.previewUrl }], 'Message 1', false, [attachment])).toContain('upload or select an attached file');
  });
});
