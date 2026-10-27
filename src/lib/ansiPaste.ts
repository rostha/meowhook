import { hasAnsiStyles } from './ansi';
import { insertRaw, roomForInsert, type EditResult } from './textEditorInsert';

/** Keep ANSI pastes atomic so length limits cannot cut an escape or closing fence. */
export function prepareAnsiPaste(value: string, start: number, end: number, pasted: string, maxLength: number):
  { edit: EditResult; openEditor: boolean } | { error: string } | null {
  if (!hasAnsiStyles(pasted)) return null;
  const insideCode = ((value.slice(0, start).match(/```/g)?.length ?? 0) % 2) === 1;
  const needsFence = !insideCode && !pasted.includes('```');
  const before = value.slice(0, start);
  const insideAnsi = insideCode && /^```ansi(?:\r?\n|$)/i.test(before.slice(before.lastIndexOf('```')));
  const replacement = needsFence
    ? `${start > 0 && value[start - 1] !== '\n' ? '\n' : ''}\`\`\`ansi\n${pasted}\n\`\`\`${end < value.length && value[end] !== '\n' ? '\n' : ''}`
    : pasted;
  const room = roomForInsert(value, start, end, maxLength);
  if (replacement.length > room) {
    return { error: `This ANSI block needs ${replacement.length.toLocaleString('en-US')} characters. ${Math.max(0, room).toLocaleString('en-US')} remaining; shorten it before pasting.` };
  }
  const edit = insertRaw(value, start, end, replacement, maxLength);
  return edit ? { edit, openEditor: needsFence || insideAnsi || (!insideCode && /(^|\n)```ansi\n/i.test(pasted)) } : null;
}
