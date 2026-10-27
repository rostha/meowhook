/**
 * Cursor-based insert helpers for Discord-flavored markdown editors.
 * Kept pure (no DOM) for tests and reuse in modal + inline FAB.
 */

export function roomForInsert(value: string, start: number, end: number, maxLength: number): number {
  if (maxLength < 0 || !Number.isFinite(maxLength)) return Infinity;
  return maxLength - (value.length - (end - start));
}

export function clampSnippet(snippet: string, room: number): string {
  if (room === Infinity) return snippet;
  return snippet.slice(0, Math.max(0, room));
}

export type EditResult = { text: string; selStart: number; selEnd: number; replaceStart?: number; replaceEnd?: number; replacement?: string };

/** Insert raw text at selection (e.g. \\n, emoji). */
export function insertRaw(
  value: string,
  start: number,
  end: number,
  snippet: string,
  maxLength: number,
): EditResult | null {
  const room = roomForInsert(value, start, end, maxLength);
  const slice = clampSnippet(snippet, room);
  if (slice.length === 0 && snippet.length > 0) return null;
  const text = value.slice(0, start) + slice + value.slice(end);
  const pos = start + slice.length;
  return { text, selStart: pos, selEnd: pos, replaceStart: start, replaceEnd: end, replacement: slice };
}

/** Wrap selection with left/right delimiters; empty selection places caret between. */
export function wrapSelection(
  value: string,
  start: number,
  end: number,
  left: string,
  right: string,
  maxLength: number,
): EditResult | null {
  const selected = value.slice(start, end);
  const insertion = left + selected + right;
  const room = roomForInsert(value, start, end, maxLength);
  if (insertion.length > room) {
    const truncated = clampSnippet(insertion, room);
    if (!truncated) return null;
    const text = value.slice(0, start) + truncated + value.slice(end);
    const pos = start + truncated.length;
    return { text, selStart: pos, selEnd: pos, replaceStart: start, replaceEnd: end, replacement: truncated };
  }
  const text = value.slice(0, start) + insertion + value.slice(end);
  if (selected.length === 0) {
    const pos = start + left.length;
    return { text, selStart: pos, selEnd: pos, replaceStart: start, replaceEnd: end, replacement: insertion };
  }
  return {
    text,
    selStart: start + left.length,
    selEnd: start + left.length + selected.length,
    replaceStart: start,
    replaceEnd: end,
    replacement: insertion
  };
}

/** ```\n\n``` with caret on middle line. */
export function insertFencedCodeBlock(
  value: string,
  start: number,
  end: number,
  maxLength: number,
): EditResult | null {
  const block = '```\n\n```';
  const r = insertRaw(value, start, end, block, maxLength);
  if (!r) return null;
  const caret = start + 4;
  return { ...r, selStart: caret, selEnd: caret };
}

/** [](https://) with caret after opening [. */
export function insertLinkTemplate(
  value: string,
  start: number,
  end: number,
  maxLength: number,
): EditResult | null {
  const tpl = '[](https://)';
  const r = insertRaw(value, start, end, tpl, maxLength);
  if (!r) return null;
  const caret = start + 1;
  return { ...r, selStart: caret, selEnd: caret };
}

/** Insert `prefix` at the start of the line containing `cursorPos`. */
export function insertPrefixOnLine(
  value: string,
  cursorPos: number,
  prefix: string,
  maxLength: number,
): EditResult | null {
  let lineStart = cursorPos;
  while (lineStart > 0 && value[lineStart - 1] !== '\n') lineStart--;
  const r = insertRaw(value, lineStart, lineStart, prefix, maxLength);
  if (!r) return null;
  const delta = prefix.length;
  const newPos = cursorPos + delta;
  return { ...r, selStart: newPos, selEnd: newPos, replaceStart: lineStart, replaceEnd: lineStart, replacement: prefix };
}
