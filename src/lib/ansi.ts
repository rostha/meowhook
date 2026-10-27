/** Render SGR styling only. Text is escaped; terminal commands never become HTML. */
export type AnsiStyle = {
  foreground?: string;
  background?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
};
export type AnsiRun = { text: string; style: AnsiStyle };

// Discord's dark ANSI palette. RGB colors remain exact.
const PALETTE = ['#000000', '#de464a', '#1b8d4d', '#b36c00', '#1a7ce6', '#d53fae', '#008995', '#b6b7bc',
  '#666666', '#ff5555', '#55ff55', '#ffff55', '#5555ff', '#ff55ff', '#55ffff', '#ffffff'];

export function hasAnsiStyles(text: string): boolean {
  return /\u001b\[[\d;]*m/.test(text);
}

function escapeAnsiText(text: string): string {
  return text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function indexedColor(index: number): string | undefined {
  if (!Number.isInteger(index) || index < 0 || index > 255) return;
  if (index < 16) return PALETTE[index];
  if (index >= 232) {
    const level = 8 + (index - 232) * 10;
    return `rgb(${level},${level},${level})`;
  }
  const cube = [0, 95, 135, 175, 215, 255];
  const color = index - 16;
  return `rgb(${cube[Math.floor(color / 36)]},${cube[Math.floor(color / 6) % 6]},${cube[color % 6]})`;
}

function applyStyles(current: AnsiStyle, parameters: string): AnsiStyle {
  let style = { ...current };
  const codes = parameters.split(';').map(value => Number(value));
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];
    if (code === 0) style = {};
    else if (code === 1) style.bold = true;
    else if (code === 3) style.italic = true;
    else if (code === 4) style.underline = true;
    else if (code === 9) style.strike = true;
    else if (code === 22) delete style.bold;
    else if (code === 23) delete style.italic;
    else if (code === 24) delete style.underline;
    else if (code === 29) delete style.strike;
    else if (code === 39) delete style.foreground;
    else if (code === 49) delete style.background;
    else if (code >= 30 && code <= 37) style.foreground = PALETTE[code - 30];
    else if (code >= 40 && code <= 47) style.background = PALETTE[code - 40];
    else if (code >= 90 && code <= 97) style.foreground = PALETTE[code - 90 + 8];
    else if (code >= 100 && code <= 107) style.background = PALETTE[code - 100 + 8];
    else if (code === 38 || code === 48) {
      const target = code === 38 ? 'foreground' : 'background';
      const mode = codes[++i];
      if (mode === 2) {
        const channels = codes.slice(i + 1, i + 4);
        if (channels.length === 3 && channels.every(value => Number.isInteger(value) && value >= 0 && value <= 255)) {
          style[target] = `rgb(${channels.join(',')})`;
        }
        i += 3;
      } else if (mode === 5) {
        const color = indexedColor(codes[++i]);
        if (color) style[target] = color;
      } else {
        // Unknown extended-color formats must not reinterpret channels as style codes.
        break;
      }
    }
  }
  return style;
}

function styledText(text: string, style: AnsiStyle): string {
  const escaped = escapeAnsiText(text);
  if (!escaped) return '';
  const rules: string[] = [];
  if (style.foreground) rules.push(`color:${style.foreground}`);
  if (style.background) rules.push(`background-color:${style.background}`);
  if (style.bold) rules.push('font-weight:700');
  if (style.italic) rules.push('font-style:italic');
  const decoration = [style.underline ? 'underline' : '', style.strike ? 'line-through' : ''].filter(Boolean);
  if (decoration.length) rules.push(`text-decoration:${decoration.join(' ')}`);
  return rules.length ? `<span style="${rules.join(';')}">${escaped}</span>` : escaped;
}

export function parseAnsiRuns(text: string): AnsiRun[] {
  let style: AnsiStyle = {};
  let offset = 0;
  const output: AnsiRun[] = [];
  const add = (value: string) => {
    const clean = value.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '');
    if (clean) output.push({ text: clean, style: { ...style } });
  };
  // Consume CSI sequences, but interpret only numeric SGR codes ending in m.
  const sequences = /\u001b\[([0-?]*)([ -/]*)([@-~])/g;
  for (const match of text.matchAll(sequences)) {
    add(text.slice(offset, match.index));
    if (match[3] === 'm' && !match[2] && /^[\d;]*$/.test(match[1])) style = applyStyles(style, match[1]);
    offset = match.index + match[0].length;
  }
  add(text.slice(offset));
  return output;
}

export function renderAnsiForPreview(text: string): string {
  return parseAnsiRuns(text).map(run => styledText(run.text, run.style)).join('');
}
