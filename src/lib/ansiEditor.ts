import { parseAnsiRuns, type AnsiRun, type AnsiStyle } from './ansi';

const RGB = /^(?:#([\da-f]{6})|rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\))$/i;
function channels(color: string): number[] {
  const match = color.match(RGB);
  if (!match) return [255, 255, 255];
  return match[1] ? [0, 2, 4].map(index => parseInt(match[1].slice(index, index + 2), 16)) : match.slice(2).map(Number);
}

export function ansiPlainText(runs: AnsiRun[]): string { return runs.map(run => run.text).join(''); }

export function ansiColorHex(color: string): string {
  return '#' + channels(color).map(channel => channel.toString(16).padStart(2, '0')).join('');
}

export function ansiEditorAppearance(runs: AnsiRun[]) {
  const target = !runs.some(run => run.style.foreground) && runs.some(run => run.style.background) ? 'background' as const : 'foreground' as const;
  const colors = runs.map(run => run.style[target]).filter((color): color is string => !!color);
  return { target, gradient: new Set(colors).size > 1, from: colors.length ? ansiColorHex(colors[0]) : '#c58b10', to: colors.length ? ansiColorHex(colors[colors.length - 1]) : '#ffffff' };
}

export function ansiSelectionStyle(runs: AnsiRun[], start: number, end: number): AnsiStyle {
  let offset = 0;
  const selected = runs.filter(run => { const from = offset; offset += run.text.length; return offset > start && from < end; });
  if (!selected.length) return {};
  const common = { ...selected[0].style };
  for (const key of Object.keys(common) as (keyof AnsiStyle)[]) {
    if (!selected.every(run => run.style[key] === common[key])) delete common[key];
  }
  return common;
}

export function serializeAnsiRuns(runs: AnsiRun[]): string {
  let previous: AnsiStyle = {};
  let output = '';
  for (const { text, style } of runs) {
    if (!text) continue;
    const codes: number[] = [];
    for (const [key, on, off] of [['bold', 1, 22], ['italic', 3, 23], ['underline', 4, 24], ['strike', 9, 29]] as const) {
      if (!!style[key] !== !!previous[key]) codes.push(style[key] ? on : off);
    }
    for (const [key, set, reset] of [['foreground', 38, 39], ['background', 48, 49]] as const) {
      if (style[key] !== previous[key]) codes.push(...(style[key] ? [set, 2, ...channels(style[key])] : [reset]));
    }
    if (codes.length) output += '\u001b[' + codes.join(';') + 'm';
    output += text;
    previous = style;
  }
  if (Object.values(previous).some(Boolean)) output += '\u001b[0m';
  return output;
}

/** Style only the selection, retaining formatting outside it. Offsets use DOM UTF-16 positions. */
export function styleAnsiSelection(runs: AnsiRun[], start: number, end: number, patch: Partial<AnsiStyle>): AnsiRun[] {
  let offset = 0;
  return runs.flatMap(run => {
    const from = Math.max(0, start - offset), to = Math.min(run.text.length, end - offset);
    offset += run.text.length;
    if (from >= to) return [run];
    const next = { ...run.style, ...patch };
    return [
      { text: run.text.slice(0, from), style: run.style },
      { text: run.text.slice(from, to), style: next },
      { text: run.text.slice(to), style: run.style },
    ].filter(item => item.text);
  });
}

export function gradientAnsiSelection(runs: AnsiRun[], start: number, end: number, from: string, to: string, target: 'foreground' | 'background'): AnsiRun[] {
  const a = channels(from), b = channels(to);
  const length = Array.from(ansiPlainText(runs).slice(start, end)).length;
  let offset = 0, index = 0;
  return runs.flatMap(run => Array.from(run.text).map(character => {
    const selected = offset >= start && offset < end;
    offset += character.length;
    if (!selected) return { text: character, style: run.style };
    const progress = length <= 1 ? 0 : index++ / (length - 1);
    const rgb = a.map((channel, i) => Math.round(channel + (b[i] - channel) * progress));
    return { text: character, style: { ...run.style, [target]: 'rgb(' + rgb.join(',') + ')' } };
  }));
}

export function ansiEditorContext(value: string, selectionStart: number, selectionEnd: number) {
  const blocks: { start: number; end: number; runs: AnsiRun[] }[] = [];
  for (const match of value.matchAll(/(^|\n)```ansi\n([\s\S]*?)```(?=\n|$)/gi)) {
    const start = match.index + match[1].length, end = match.index + match[0].length;
    const block = { start, end, runs: parseAnsiRuns(match[2].replace(/\n$/, '')) };
    if (selectionStart >= start && selectionEnd <= end) return block;
    blocks.push(block);
  }
  // Reopen a nearby block instead of wrapping existing fences inside another fence.
  const overlapping = blocks.find(block => selectionStart <= block.start && selectionEnd >= block.end);
  if (overlapping) return overlapping;
  if (selectionStart === selectionEnd && blocks.length) return [...blocks].reverse().find(block => block.start < selectionStart) ?? blocks[0];
  const start = selectionStart === selectionEnd ? 0 : selectionStart;
  const end = selectionStart === selectionEnd ? value.length : selectionEnd;
  return { start, end, runs: parseAnsiRuns(value.slice(start, end)) };
}

export function applyAnsiEditor(value: string, start: number, end: number, runs: AnsiRun[]): string {
  if (!ansiPlainText(runs)) return value.slice(0, start) + value.slice(end);
  const block = '```ansi\n' + serializeAnsiRuns(runs) + '\n```';
  return value.slice(0, start) + (start > 0 && value[start - 1] !== '\n' ? '\n' : '') + block
    + (end < value.length && value[end] !== '\n' ? '\n' : '') + value.slice(end);
}
