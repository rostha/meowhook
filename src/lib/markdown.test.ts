import { describe, it, expect } from 'vitest';
import {
  parseDiscordMarkdown,
  expandDiscordInputEscapes,
  parseDiscordMarkdownForPreview,
  normalizeDiscordEmbedFieldText,
  parseDiscordEmbedFieldForPreview,
} from './markdown';

/**
 * Regression suite: preview must stay aligned with Discord client behavior
 * (line breaks, code fences, no stray CR / double-spacing artifacts).
 */
describe('parseDiscordMarkdown', () => {
  it('normalizes CRLF and CR to single line breaks (no stray \\r)', () => {
    const html = parseDiscordMarkdown('line1\r\nline2\rline3');
    expect(html).toContain('line1<br/>line2<br/>line3');
    expect(html).not.toMatch(/\r/);
  });

  it('normalizes Unicode line/paragraph separators', () => {
    const html = parseDiscordMarkdown('a\u2028b\u2029c');
    expect(html).toContain('a<br/>b<br/>c');
  });

  it('maps single newlines to <br/> (Discord embed body)', () => {
    const html = parseDiscordMarkdown('➯ lead\nbody text');
    expect(html).toBe('➯ lead<br/>body text');
  });

  it('preserves real newlines inside fenced code, not <br/>', () => {
    const md = '```\nline1\nline2\n```';
    const html = parseDiscordMarkdown(md);
    expect(html).toContain('<pre><code>');
    expect(html).toMatch(/line1\nline2/);
    expect(html).not.toMatch(/<pre><code>[^<]*<br\/>/);
  });

  it('does not inject <br/> into code block placeholders', () => {
    const html = parseDiscordMarkdown('intro\n```\na\nb\n```\noutro');
    const preMatch = html.match(/<pre><code>([\s\S]*?)<\/code><\/pre>/);
    expect(preMatch).toBeTruthy();
    expect(preMatch![1]).toContain('a\nb');
    expect(preMatch![1]).not.toContain('<br');
  });

  it('applies bold and escapes HTML', () => {
    const html = parseDiscordMarkdown('**hi** <script>');
    expect(html).toContain('<strong>hi</strong>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('italic stays on one line (no cross-line swallow)', () => {
    const html = parseDiscordMarkdown('*a*\nb');
    expect(html).toContain('<em>a</em><br/>b');
  });

  it('returns empty string for empty input', () => {
    expect(parseDiscordMarkdown('')).toBe('');
  });

  it('replaces NBSP with regular space so emoji + text do not wrap as one unbreakable word', () => {
    const html = parseDiscordMarkdown('🌸\u00a0How to apply');
    expect(html).toBe('🌸 How to apply');
    expect(html).not.toContain('<br/>');
  });

  it('renders custom emoji when closing > is missing before the next word', () => {
    const html = parseDiscordMarkdown('<:gwhitearrow:14876136Compliance text');
    expect(html).toContain('cdn.discordapp.com/emojis/14876136');
    expect(html).toContain('Compliance text');
    expect(html).not.toContain('&lt;:gwhitearrow:');
  });

  it('still prefers well-formed custom emoji tags', () => {
    const html = parseDiscordMarkdown('<:ok:999>after');
    expect(html).toContain('emojis/999.png');
    expect(html).toContain('after');
  });

  it('treats [label] (url) with space before ( like Discord (masked link)', () => {
    const html = parseDiscordMarkdown('[DanHeng](https://discord.gg/abc) and [x] (https://discord.gg/def)');
    expect(html).toContain('href="https://discord.gg/abc"');
    expect(html).toContain('href="https://discord.gg/def"');
    expect(html).toContain('>DanHeng<');
    expect(html).toContain('>x<');
    expect(html).not.toContain('[DanHeng]');
  });

  it('renders consecutive headings, including repeated levels, without losing a line', () => {
    const html = parseDiscordMarkdown('# Large\n## Medium\n## Another medium\n### Small\nBody');
    expect(html).toBe('<div class="md-heading md-h1">Large</div><div class="md-heading md-h2">Medium</div><div class="md-heading md-h2">Another medium</div><div class="md-heading md-h3">Small</div>Body');
  });

  it('renders each subtext line with inline formatting and keeps the next line normal', () => {
    const html = parseDiscordMarkdown('-# A **quiet** note\n-# Another note\nNormal text');
    expect(html).toBe('<div class="md-subtext">A <strong>quiet</strong> note</div><div class="md-subtext">Another note</div>Normal text');
  });

  it('preserves blank lines around headings and subtext without adding extra breaks', () => {
    const html = parseDiscordMarkdown('Intro\n\n# Heading\n\n-# Note\n\nBody');
    expect(html).toBe('Intro<br/><div class="md-heading md-h1">Heading</div><br/><div class="md-subtext">Note</div><br/>Body');
  });

  it('requires a space and a line-start marker for headings and subtext', () => {
    const html = parseDiscordMarkdown('#no space\n##no space\n###no space\n-#no space\n#### Too many\nInline # heading\nInline -# note\n # Indented');
    expect(html).not.toContain('md-heading');
    expect(html).not.toContain('md-subtext');
  });

  it('leaves escaped heading and subtext markers as literal text', () => {
    expect(parseDiscordMarkdown('\\# Literal\n\\-# Literal')).toBe('# Literal<br/>-# Literal');
  });

  it('keeps heading and subtext examples literal inside inline and fenced code', () => {
    const html = parseDiscordMarkdown('`# **literal**`\n`-# literal`\n```md\n# Large\n## Medium\n### Small\n-# Note\n```');
    expect(html).toContain('<code class="inline-code"># **literal**</code>');
    expect(html).toContain('<code class="inline-code">-# literal</code>');
    expect(html).not.toContain('md-heading');
    expect(html).not.toContain('md-subtext');
    expect(html).toContain('# Large\n## Medium\n### Small\n-# Note');
  });

  it('escapes HTML while supporting links and emphasis in heading and subtext blocks', () => {
    const html = parseDiscordMarkdown('## **Hello** <script>\n-# [Details](https://example.com)');
    expect(html).toContain('<div class="md-heading md-h2"><strong>Hello</strong> &lt;script&gt;</div>');
    expect(html).toContain('<div class="md-subtext"><a href="https://example.com"');
    expect(html).not.toContain('<script>');
  });
});

describe('expandDiscordInputEscapes', () => {
  it('turns \\n into a real newline', () => {
    expect(expandDiscordInputEscapes('a\\nb')).toBe('a\nb');
  });

  it('supports \\t, \\r, and escaped backslash', () => {
    expect(expandDiscordInputEscapes('x\\tz')).toBe('x\tz');
    expect(expandDiscordInputEscapes('\\\\n')).toBe('\\n');
  });
});

describe('parseDiscordMarkdownForPreview', () => {
  it('expands \\n then markdown → line break in HTML', () => {
    const html = parseDiscordMarkdownForPreview('line1\\nline2');
    expect(html).toContain('line1<br/>line2');
  });

  it('renders all heading sizes and subtext after expanding typed line breaks', () => {
    const html = parseDiscordMarkdownForPreview('# Large\\n## Medium\\n### Small\\n-# Note');
    expect(html).toContain('md-h1');
    expect(html).toContain('md-h2');
    expect(html).toContain('md-h3');
    expect(html).toContain('<div class="md-subtext">Note</div>');
  });
});

describe('normalizeDiscordEmbedFieldText / parseDiscordEmbedFieldForPreview', () => {
  it('trims leading/trailing whitespace after escapes (matches Discord field UI)', () => {
    expect(normalizeDiscordEmbedFieldText('\\n **hi** \\n')).toBe('**hi**');
    const html = parseDiscordEmbedFieldForPreview('\\n **1. [a](https://example.com)** \\n');
    expect(html).not.toMatch(/^<br\/>/);
    expect(html).toContain('<strong>1.');
    expect(html).toContain('href="https://example.com"');
  });

  it('keeps internal line breaks', () => {
    const html = parseDiscordEmbedFieldForPreview('a\\nb');
    expect(html).toBe('a<br/>b');
  });
});
