import { describe, expect, it } from 'vitest';
import { embedTextLength, limitState } from './editorLimits';
import { createDefaultEmbed, createDefaultMessage, calculateTotalEmbedLength } from './utils';
import { buildPayload } from './payload';

describe('editor limit indicators', () => {
  it('uses the same embed text total as the payload, including escapes and complete fields', () => {
    const embed = createDefaultEmbed();
    embed.title = '  A title  ';
    embed.description = 'First\\nSecond 🐈';
    embed.author.name = ' Author ';
    embed.footer.text = ' Footer ';
    embed.url = 'https://example.com';
    embed.fields = [
      {id:'complete',name:' Label ',value:' One\\nTwo ',inline:false},
      {id:'partial',name:'Not sent yet',value:'',inline:false},
    ];
    const message = createDefaultMessage(); message.embeds = [embed];
    const payload = buildPayload(message).embeds![0];
    const expected = [payload.title, payload.description, payload.author?.name, payload.footer?.text,
      ...(payload.fields ?? []).flatMap(field => [field.name, field.value])]
      .reduce((total, text) => total + (text ?? '').trim().length, 0);
    expect(embedTextLength(embed)).toBe(expected);
    expect(calculateTotalEmbedLength(message)).toBe(expected);
  });

  it('counts all embeds toward the shared 6,000-character budget', () => {
    const first = createDefaultEmbed(); first.description = 'a'.repeat(4000);
    const second = createDefaultEmbed(); second.footer.text = 'b'.repeat(2000);
    expect([first, second].reduce((total, embed) => total + embedTextLength(embed), 0)).toBe(6000);
    expect(limitState(6000, 6000)).toBe('warn');
    second.footer.text += 'b';
    expect(limitState(embedTextLength(first) + embedTextLength(second), 6000)).toBe('error');
  });

  it('warns near a limit while keeping the inclusive boundary valid', () => {
    expect(limitState(3599, 4000)).toBe('normal');
    expect(limitState(3600, 4000)).toBe('warn');
    expect(limitState(4000, 4000)).toBe('warn');
    expect(limitState(4001, 4000)).toBe('error');
  });

  it.each([{componentMode:'v2' as const,flags:0}, {componentMode:'standard' as const,flags:32768}])('ignores dormant regular embeds in V2 mode (%j)', mode => {
    const message = createDefaultMessage();
    const embed = createDefaultEmbed(); embed.description = 'a'.repeat(7000);
    message.embeds = [embed];
    expect(calculateTotalEmbedLength(message)).toBe(7000);
    Object.assign(message, mode);
    expect(calculateTotalEmbedLength(message)).toBe(0);
    expect(message.embeds[0].description.length).toBe(7000);
  });
});
