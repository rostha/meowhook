import { renderAnsiForPreview } from './ansi';

/**
 * Expands typed backslash escapes so single-line inputs (e.g. field `<input>`) can produce
 * newlines like Discord. Sent to the API in `buildPayload` and used before `parseDiscordMarkdown` in preview.
 *
 * Supported: `\n` newline, `\t` tab, `\r` carriage return, `\\` literal `\`.
 */
export function expandDiscordInputEscapes(text: string): string {
  if (!text) return '';
  let out = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\' && i + 1 < text.length) {
      const n = text[i + 1];
      if (n === 'n') {
        out += '\n';
        i++;
        continue;
      }
      if (n === 't') {
        out += '\t';
        i++;
        continue;
      }
      if (n === 'r') {
        out += '\r';
        i++;
        continue;
      }
      if (n === '\\') {
        out += '\\';
        i++;
        continue;
      }
    }
    out += text[i];
  }
  return out;
}

/** Preview pipeline: escapes → Discord markdown → safe HTML. */
export function parseDiscordMarkdownForPreview(text: string): string {
  return parseDiscordMarkdown(expandDiscordInputEscapes(text).trim());
}

/**
 * Embed field name/value: expand `\\n` etc., then trim edges like the Discord client
 * (leading/trailing whitespace and newlines are not shown in field UI).
 */
export function normalizeDiscordEmbedFieldText(text: string): string {
  return expandDiscordInputEscapes(text).trim();
}

/** Preview for embed field value only — uses Discord's field edge trim rules. */
export function parseDiscordEmbedFieldForPreview(text: string): string {
  return parseDiscordMarkdown(normalizeDiscordEmbedFieldText(text));
}

/** Preview for embed field name only — uses Discord's field edge trim rules, but DOES NOT parse links. */
export function parseDiscordEmbedFieldNameForPreview(text: string): string {
  return parseDiscordMarkdown(normalizeDiscordEmbedFieldText(text), { disableLinks: true });
}

/** Preview for embed title only — uses Discord's field edge trim rules, but DOES NOT parse links. */
export function parseDiscordEmbedTitleForPreview(text: string): string {
  return parseDiscordMarkdown(normalizeDiscordEmbedFieldText(text), { disableLinks: true });
}

/** Preview for embed author only — uses Discord's field edge trim rules, but DOES NOT parse links. */
export function parseDiscordEmbedAuthorForPreview(text: string): string {
  return parseDiscordMarkdown(normalizeDiscordEmbedFieldText(text), { disableLinks: true });
}

/** Preview for embed footer only — uses Discord's field edge trim rules, but DOES NOT parse links. */
export function parseDiscordEmbedFooterForPreview(text: string): string {
  return parseDiscordMarkdown(normalizeDiscordEmbedFieldText(text), { disableLinks: true });
}

/**
 * Discord-flavored markdown → safe HTML for the live preview only.
 *
 * Invariants (regression-tested in `markdown.test.ts` — run `npm test`):
 * 1. Line endings normalize to `\n` (CRLF/CR/U+2028/U+2029); NBSP/U+202F become normal spaces.
 * 2. Single `\n` in embed description / field text becomes one `<br/>` (matches Discord line breaks).
 * 3. Fenced ``` blocks use placeholders `{{{MHFBn}}}` (no `__`) so underline rules cannot corrupt them.
 * 4. Italic `*` / `_` does not span across newlines (avoids broken multi-line layout).
 * 5. Source HTML is always escaped; only known safe tags are injected by this parser.
 * 6. Custom emoji `<:n:id>` with a missing `>` before the next word still renders the emoji image.
 */
function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Match Discord-style line breaks: CRLF, CR, Unicode line/paragraph separators */
function normalizeLineEndings(text: string): string {
  return text
    // NBSP / narrow NBSP between emoji and text glue into one "word" and force ugly wraps (emoji alone on a line)
    .replace(/\u00a0|\u202f/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u2028|\u2029/g, '\n');
}

function customEmojiToImg(animated: string | undefined, name: string, id: string): string {
  const ext = animated ? 'gif' : 'png';
  return `<img class="emoji" src="https://cdn.discordapp.com/emojis/${id}.${ext}" alt="${name}" title="${name}" />`;
}

export function parseDiscordMarkdown(text: string, options?: { disableLinks?: boolean }): string {
  if (!text) return '';

  const normalized = normalizeLineEndings(text);
  // Fenced code blocks — preserve real newlines inside (do not turn into <br/> later).
  // Placeholders MUST NOT contain `__` or they are eaten by the underline rule below.
  const codeBlocks: string[] = [];
  const protectedText = normalized.replace(/(^|\n)```([\w-]*)\n?([\s\S]*?)```(?=\n|$)/g, (_m, prefix, language: string, code: string) => {
    const i = codeBlocks.length;
    codeBlocks.push(language.toLowerCase() === 'ansi'
      ? `<pre class="ansi-code-block"><code>${renderAnsiForPreview(code.replace(/\n$/, ''))}</code></pre>`
      : `<pre><code>${escapeHtml(code.trim())}</code></pre>`);
    return `${prefix}{{{MHFB${i}}}}`;
  });
  let html = escapeHtml(protectedText).replace(/(\{\{\{MHFB\d+\}\}\})\n/g, '$1');

  // Protect inline code too, so formatting examples remain literal.
  const inlineCode: string[] = [];
  html = html.replace(/`([^`]+)`/g, (_m, code) => {
    const i = inlineCode.length;
    inlineCode.push(`<code class="inline-code">${code}</code>`);
    return `{{{MHIC${i}}}}`;
  });

  const literalMarkers: string[] = [];
  html = html.replace(/^\\(#{1,3}|-#)(?= )/gm, (_m, marker) => {
    const i = literalMarkers.length;
    literalMarkers.push(marker);
    return `{{{MHEM${i}}}}`;
  });

  // Match each line without consuming the next line's boundary.
  html = html.replace(/^(#{1,3}|-#) (.+)$/gm, (_m, marker, content) =>
    marker === '-#'
      ? `<div class="md-subtext">${content}</div>`
      : `<div class="md-heading md-h${marker.length}">${content}</div>`,
  );

  // Blockquotes
  html = html.replace(
    /(^|\n)((?:&gt; .+(?:\n|$))+)/g,
    (_m, prefix, block: string) => {
      const items = block.trim().split('\n')
        .map(line => line.replace(/^&gt; /, ''))
        .join('\n');
      return `${prefix}<blockquote class="md-blockquote">${items}</blockquote>`;
    }
  );

  // Bold + Italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Underline
  html = html.replace(/__(.+?)__/g, '<u>$1</u>');
  // Italic (single line only — avoids swallowing line breaks and odd blocks)
  html = html.replace(/\*([^\n*]+?)\*/g, '<em>$1</em>');
  html = html.replace(/_([^\n_]+?)_/g, '<em>$1</em>');
  // Strikethrough
  html = html.replace(/~~(.+?)~~/g, '<s>$1</s>');
  // Spoiler
  html = html.replace(/\|\|(.+?)\|\|/g, '<span class="spoiler" onclick="this.classList.toggle(\'revealed\')">$1</span>');

  // Links [text](url) — only http/https. Discord allows optional whitespace between ] and (.
  // Also supports [text](<url>)
  if (!options?.disableLinks) {
    html = html.replace(/\[([^\]]+)\]\s*\((<)?(https?:\/\/[^\s)]+)(>)?\)/g, (_m, text, hasLeftAng, href, hasRightAng) => {
      // If unbalanced angles, treat as literal text or let it fail gracefully
      if (!!hasLeftAng !== !!hasRightAng) {
        // Reconstruct what it matched if unbalanced, or just let it pass to try-catch
        href = (hasLeftAng || '') + href + (hasRightAng || '');
      }
      // Sanitize href: only allow http/https schemes after decoding
      try {
        const url = new URL(href.replace(/&amp;/g, '&'));
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return _m;
        return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="md-link">${text}</a>`;
      } catch {
        return _m; // return original text if invalid URL
      }
    });
  }

  // Custom emojis <:name:id> or <a:name:id>
  html = html.replace(/&lt;(a?):(\w+):(\d+)&gt;/g, (_m, animated, name, id) =>
    customEmojiToImg(animated, name, id),
  );
  // Missing `>` before the next word or space (e.g. <:name:1234567890 ) — still render the emoji
  html = html.replace(/&lt;(a?):(\w+):(\d+)/g, (_m, animated, name, id) =>
    customEmojiToImg(animated, name, id),
  );

  // Mentions
  html = html.replace(/&lt;@(\d+)&gt;/g, '<span class="mention">@user</span>');
  html = html.replace(/&lt;@&amp;(\d+)&gt;/g, '<span class="mention">@role</span>');
  html = html.replace(/&lt;#(\d+)&gt;/g, '<span class="mention">#channel</span>');

  // Auto-link bare URLs (skip URLs already inside href="...")
  if (!options?.disableLinks) {
    html = html.replace(/(^|[^"=\/])(https?:\/\/[^\s<]+)/g, (_m, prefix, href) => {
      try {
        const url = new URL(href.replace(/&amp;/g, '&'));
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return `${prefix}${href}`;
        return `${prefix}<a href="${href}" target="_blank" rel="noopener noreferrer" class="md-link">${href}</a>`;
      } catch {
        return `${prefix}${href}`;
      }
    });
  }

  // Ordered & unordered lists — collect consecutive list lines into <ol>/<ul> blocks.
  // Discord renders `1. text`, `- text`, `* text` as proper indented lists.
  // Preserve start number so a split block (blank line between items) keeps its numbering.
  html = html.replace(
    /(^|\n)((?:(?:\d+)\. .+(?:\n|$))+)/g,
    (_m, prefix, block: string) => {
      const lines = block.trim().split('\n');
      const startMatch = lines[0].match(/^(\d+)\./);
      const start = startMatch ? parseInt(startMatch[1], 10) : 1;
      const items = lines
        .map(line => line.replace(/^\d+\.\s+/, ''))
        .map(li => `<li>${li}</li>`)
        .join('');
      return `${prefix}<ol class="md-ol" start="${start}">${items}</ol>`;
    },
  );
  html = html.replace(
    /(^|\n)((?:[-*] .+(?:\n|$))+)/g,
    (_m, prefix, block: string) => {
      const items = block.trim().split('\n')
        .map(line => line.replace(/^[-*]\s+/, ''))
        .map(li => `<li>${li}</li>`)
        .join('');
      return `${prefix}<ul class="md-ul">${items}</ul>`;
    },
  );

  // Blocks already create a line break. Keep additional blank lines, but do not
  // add an extra <br/> at each block boundary. Consume each newline run once.
  html = html.replace(/(<\/div>)(\n+)|(\n+)(?=<div class="md-(?:heading|subtext))/g,
    (_m, closing, after, before) => closing ? closing + after.slice(1) : before.slice(1));

  // Newlines to <br/> (except inside protected code)
  html = html.replace(/\n/g, '<br/>');

  html = html.replace(/\{\{\{MHEM(\d+)\}\}\}/g, (marker, index) => literalMarkers[Number(index)] ?? marker);
  html = html.replace(/\{\{\{MHIC(\d+)\}\}\}/g, (marker, index) => inlineCode[Number(index)] ?? marker);
  for (let i = codeBlocks.length - 1; i >= 0; i--) {
    html = html.split(`{{{MHFB${i}}}}`).join(codeBlocks[i]);
  }

  return html;
}
