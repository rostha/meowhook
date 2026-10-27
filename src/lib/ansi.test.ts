import { describe, expect, it } from 'vitest';
import { renderAnsiForPreview } from './ansi';
import { parseDiscordMarkdown, parseDiscordMarkdownForPreview } from './markdown';
import { buildPayload } from './payload';
import { createDefaultMessage, createDefaultEmbed } from './utils';

const ESC = '\u001b';
const gradient = `${ESC}[1;38;2;120;72;0mF${ESC}[1;38;2;255;255;255mr${ESC}[0m`;
const fenced = (text: string) => '```ansi\n' + text + '\n```';

describe('ANSI preview', () => {
  it('renders the supplied RGB gradient with bold, without leaking control codes', () => {
    const html = parseDiscordMarkdownForPreview(fenced(gradient));
    expect(html).toContain('<span style="color:rgb(120,72,0);font-weight:700">F</span>');
    expect(html).toContain('<span style="color:rgb(255,255,255);font-weight:700">r</span>');
    expect(html).toContain('class="ansi-code-block"');
    expect(html).not.toContain(ESC);
    expect(html).not.toContain('[1;38;2');
  });

  it('combines background, italic, underline and strike and resets them independently', () => {
    const html = renderAnsiForPreview(`${ESC}[1;3;4;9;48;2;1;2;3mA${ESC}[22;23;24;29;49mB`);
    expect(html).toBe('<span style="background-color:rgb(1,2,3);font-weight:700;font-style:italic;text-decoration:underline line-through">A</span>B');
  });

  it('supports palette and indexed colors, with foreground and background defaults', () => {
    const html = renderAnsiForPreview(`${ESC}[31;44mA${ESC}[39;49mB${ESC}[38;5;196;48;5;232mC`);
    expect(html).toContain('color:#de464a;background-color:#1a7ce6');
    expect(html).toContain('</span>B<span');
    expect(html).toContain('color:rgb(255,0,0);background-color:rgb(8,8,8)');
  });

  it('keeps empty resets and full resets from leaking styles', () => {
    expect(renderAnsiForPreview(`${ESC}[1mA${ESC}[mB${ESC}[3mC${ESC}[0mD`))
      .toBe('<span style="font-weight:700">A</span>B<span style="font-style:italic">C</span>D');
  });

  it('escapes hostile HTML and leaves markdown and links literal inside ANSI', () => {
    const html = parseDiscordMarkdown(fenced(`${ESC}[38;2;1;2;3m<img src=x onerror="alert(1)"> **literal** https://example.com &`));
    expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt; **literal** https://example.com &amp;');
    expect(html).not.toMatch(/<img|<script|<a |<strong/);
  });

  it('ignores terminal commands and invalid RGB values without using their channels as styles', () => {
    const html = renderAnsiForPreview(`${ESC}[2J${ESC}[38;2;999;1;4mA${ESC}[38;7;1;4mB`);
    expect(html).toBe('AB');
  });

  it('preserves indentation, blank lines and trailing spaces within ANSI fences', () => {
    expect(parseDiscordMarkdown(fenced('  A\n\nB  '))).toBe('<pre class="ansi-code-block"><code>  A\n\nB  </code></pre>');
  });

  it('isolates consecutive ANSI blocks and keeps following text unstyled', () => {
    const html = parseDiscordMarkdown(fenced(`${ESC}[31mred`) + '\n' + fenced('plain') + '\nAfter');
    expect(html.match(/class="ansi-code-block"/g)).toHaveLength(2);
    expect(html).toContain('<code>plain</code></pre>After');
  });

  it('does not interpret ANSI in ordinary code blocks', () => {
    const html = parseDiscordMarkdown('```js\n' + gradient + '<script>\n```');
    expect(html).not.toContain('style=');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('ANSI payloads', () => {
  it('preserves codes exactly in regular messages, embeds, and V2 container text', () => {
    const text = fenced(gradient);
    const message = createDefaultMessage();
    message.content = text;
    const embed = createDefaultEmbed();
    embed.description = text;
    message.embeds = [embed];
    expect(buildPayload(message).content).toBe(text);
    expect(buildPayload(message).embeds?.[0].description).toBe(text);
    message.componentMode = 'v2'; message.flags = 32768;
    message.componentBlocks = [{id:'container',type:'container',color:0xa9b9b4,blocks:[{id:'text',type:'text',content:text}]}];
    const payload = JSON.parse(JSON.stringify(buildPayload(message)));
    expect(payload.components[0].components[0].content).toBe(text);
  });
});
