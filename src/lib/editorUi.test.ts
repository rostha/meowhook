import { describe, expect, it } from 'vitest';

import {
  countEmbedFields,
  countPartialEmbedFields,
  getAdvancedSummary,
  getContentSummary,
  getEmbedsSummary,
  getFilesSummary,
  getProfileSummary,
} from './editorUi';
import { createDefaultEmbed, createDefaultField, createDefaultMessage } from './utils';

describe('editorUi helpers', () => {
  it('summarizes message sections', () => {
    const message = createDefaultMessage();
    const embed = createDefaultEmbed();
    const inlineField = createDefaultField();

    inlineField.name = 'Mode';
    inlineField.value = 'Compact';
    inlineField.inline = true;
    embed.fields.push(inlineField);

    message.username = 'Mashiro';
    message.content = 'Hello there';
    message.embeds.push(embed);
    message._attachments = [
      {
        file: { name: 'cat.png', type: 'image/png', size: 3 } as File,
        previewUrl: 'blob:cat',
        fieldKey: 'content_file_0',
      },
    ];
    message.flags = 4 | 4096;

    expect(getProfileSummary(message).text).toContain('custom username');
    expect(getContentSummary(message).text).toContain('11 chars');
    expect(getFilesSummary(message).text).toContain('1 file');
    expect(getEmbedsSummary(message).text).toContain('1 embed');
    expect(getAdvancedSummary(message).text).toContain('silent');
    expect(countEmbedFields(message)).toBe(1);
    expect(countPartialEmbedFields(message)).toBe(0);
  });
});
