import type { AnsiRun, AnsiStyle } from './ansi';
import { ansiPlainText } from './ansiEditor';

/** Read only text and the supported styles. Pasted HTML is never accepted by the editor. */
export function readAnsiEditor(root: Node): AnsiRun[] {
  // Browsers leave one BR as a caret placeholder after deleting the last character.
  // Our intentional line breaks contain text newlines and a marked sentinel.
  if (root instanceof HTMLElement && root.isContentEditable && !root.textContent && root.querySelectorAll('br').length === 1 && !root.querySelector('[data-ansi-sentinel]')) return [];
  const runs: AnsiRun[] = [];
  const visit = (node: Node, inherited: AnsiStyle) => {
    if (node.nodeType === Node.TEXT_NODE) { if (node.textContent) runs.push({ text: node.textContent, style: inherited }); return; }
    if (!(node instanceof HTMLElement) && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
    const style = { ...inherited };
    if (node instanceof HTMLElement) {
      if (node.hasAttribute('data-ansi-sentinel')) return;
      if (node.tagName === 'BR') { runs.push({ text: '\n', style }); return; }
      // A browser-created empty paragraph represents one newline; its BR is only a caret placeholder.
      if (node !== root && /^(DIV|P)$/.test(node.tagName) && node.childNodes.length === 1 && node.firstChild instanceof HTMLBRElement) { runs.push({ text: '\n', style }); return; }
      if (node !== root && /^(DIV|P)$/.test(node.tagName) && runs.length && !runs.at(-1)?.text.endsWith('\n')) runs.push({ text: '\n', style });
      if (node.style.color) style.foreground = node.style.color;
      if (node.style.backgroundColor) style.background = node.style.backgroundColor;
      if (node.style.fontWeight === '700' || node.style.fontWeight === 'bold' || /^(B|STRONG)$/.test(node.tagName)) style.bold = true;
      if (node.style.fontStyle === 'italic' || /^(I|EM)$/.test(node.tagName)) style.italic = true;
      if (node.style.textDecoration.includes('underline') || node.tagName === 'U') style.underline = true;
      if (node.style.textDecoration.includes('line-through') || /^(S|STRIKE|DEL)$/.test(node.tagName)) style.strike = true;
    }
    node.childNodes.forEach(child => visit(child, style));
  };
  root.childNodes.forEach(child => visit(child, {}));
  return runs;
}

export function ansiEditorSelection(root: HTMLElement): { start: number; end: number } | null {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const before = range.cloneRange(); before.selectNodeContents(root); before.setEnd(range.startContainer, range.startOffset);
  const through = range.cloneRange(); through.selectNodeContents(root); through.setEnd(range.endContainer, range.endOffset);
  return { start: ansiPlainText(readAnsiEditor(before.cloneContents())).length, end: ansiPlainText(readAnsiEditor(through.cloneContents())).length };
}

export function selectAnsiEditor(root: HTMLElement, start: number, end: number) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange(); range.selectNodeContents(root); range.collapse(false);
  let offset = 0, foundStart = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0;
    if (!foundStart && start <= offset + length) { range.setStart(node, Math.max(0, start - offset)); foundStart = true; }
    if (foundStart && end <= offset + length) { range.setEnd(node, Math.max(0, end - offset)); break; }
    offset += length;
  }
  root.focus({ preventScroll: true });
  const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
}
