'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useIsPresent } from 'framer-motion';
import ColorPicker from './ColorPicker';
import LimitCounter from './LimitCounter';
import { IconCheck, IconCopy, IconGrip, IconMinimize, IconMaximize, IconUndo, IconRedo, IconX } from './MeowIcons';
import { hasAnsiStyles, parseAnsiRuns, renderAnsiForPreview, type AnsiRun, type AnsiStyle } from '@/lib/ansi';
import { ansiColorHex, ansiEditorAppearance, ansiEditorContext, ansiPlainText, ansiSelectionStyle, applyAnsiEditor, gradientAnsiSelection, serializeAnsiRuns, styleAnsiSelection } from '@/lib/ansiEditor';
import { ansiEditorSelection, readAnsiEditor, selectAnsiEditor } from '@/lib/ansiEditorDom';
import { useUiMotion } from '@/lib/useUiMotion';
import { clampFloatingPosition, floatingViewport } from '@/lib/floatingViewport';

type Props = { value: string; selectionStart: number; selectionEnd: number; maxLength?: number; fieldLabel?: string; onPreview?: (value: string) => void; onApply: (value: string) => void; onClose: () => void };
const SWATCHES = ['#ffffff', '#ed5559', '#46a36a', '#e5ad35', '#539af2', '#e35ac4', '#38b9c4', '#000000'];
const SWATCH_NAMES = ['White', 'Red', 'Green', 'Gold', 'Blue', 'Pink', 'Teal', 'Black'];
const GRADIENTS = [
  { name: 'Gold', from: '#c58b10', to: '#ffffff' },
  { name: 'Sunset', from: '#ff6575', to: '#ffd36b' },
  { name: 'Ocean', from: '#55cfff', to: '#9f90ff' },
];

export default function AnsiEditorPopover({ value, selectionStart, selectionEnd, maxLength = Infinity, fieldLabel = 'Message text', onPreview, onApply, onClose }: Props) {
  const [context] = useState(() => ansiEditorContext(value, selectionStart, selectionEnd));
  const [appearance] = useState(() => ansiEditorAppearance(context.runs));
  const [history, setHistory] = useState(() => [{ runs: context.runs, range: { start: ansiPlainText(context.runs).length, end: ansiPlainText(context.runs).length }, original: true }]);
  const [index, setIndex] = useState(0);
  const original = history[index].original;
  const runs = history[index].runs;
  const runsRef = useRef(runs); runsRef.current = runs;
  const selection = useRef({ start: ansiPlainText(runs).length, end: ansiPlainText(runs).length });
  const [, refreshSelection] = useState(0);
  const [target, setTarget] = useState<'foreground' | 'background'>(appearance.target);
  const [colors, setColors] = useState({ foreground: '#ffd700', background: '#202225' });
  const [typingStyle, setTypingStyle] = useState<AnsiStyle>({});
  const [hexDraft, setHexDraft] = useState('#ffd700');
  const wholeGradient = useRef(false);
  const [gradientOpen, setGradientOpen] = useState(appearance.gradient);
  const [gradientFrom, setGradientFrom] = useState(appearance.gradient ? appearance.from : '#c58b10');
  const [gradientTo, setGradientTo] = useState(appearance.gradient ? appearance.to : '#ffffff');
  const [collapsed, setCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [position, setPosition] = useState({ x: 12, y: 100 });
  const [viewport, setViewport] = useState(floatingViewport);
  const panel = useRef<HTMLDivElement>(null), editor = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(null);
  const id = useId();
  const uiMotion = useUiMotion();
  const isPresent = useIsPresent();
  const result = applyAnsiEditor(value, context.start, context.end, runs);
  const output = original ? value : result;
  const tooLong = maxLength >= 0 && Number.isFinite(maxLength) && output.length > maxLength;
  const plainText = ansiPlainText(runs);
  const selectedCount = Array.from(plainText.slice(selection.current.start, selection.current.end)).length;
  const scope = selectedCount ? selection.current : { start: 0, end: plainText.length };
  const commonStyle = plainText ? ansiSelectionStyle(runs, scope.start, scope.end) : typingStyle;
  const color = commonStyle[target] ? ansiColorHex(commonStyle[target]) : colors[target];
  useEffect(() => { setHexDraft(color); }, [color]);

  const publish = (next: AnsiRun[], original = false) => {
    const nextValue = original ? value : applyAnsiEditor(value, context.start, context.end, next);
    if (maxLength < 0 || !Number.isFinite(maxLength) || nextValue.length <= maxLength) onPreview?.(nextValue);
  };

  const draw = (next: AnsiRun[], range = selection.current) => {
    if (!editor.current) return;
    // A trailing BR lets browsers place the caret after a final newline.
    editor.current.innerHTML = renderAnsiForPreview(serializeAnsiRuns(next)) + (ansiPlainText(next).endsWith('\n') ? '<br data-ansi-sentinel>' : '');
    // The custom color picker owns focus while its dialog is open.
    if (document.activeElement === editor.current || document.activeElement instanceof HTMLButtonElement && panel.current?.contains(document.activeElement)) selectAnsiEditor(editor.current, range.start, range.end);
  };
  const commit = (next: AnsiRun[], range = selection.current) => {
    if (Number.isFinite(maxLength) && maxLength >= 0 && ansiPlainText(next).length > maxLength) {
      setError('This text exceeds the field’s character limit. Shorten it before inserting.');
      draw(runsRef.current); return;
    }
    selection.current = range;
    if (serializeAnsiRuns(next) === serializeAnsiRuns(runsRef.current)) { draw(next, range); return; }
    runsRef.current = next;
    setError(''); setCopied(false);
    setHistory(current => [...current.slice(0, index + 1), { runs: next, range: { ...range }, original: false }].slice(-100));
    setIndex(current => Math.min(current + 1, 99));
    publish(next);
    draw(next, range);
  };
  const clampPosition = (x: number, y: number) => clampFloatingPosition(x, y, panel.current?.offsetWidth ?? 440, panel.current?.offsetHeight ?? 440, floatingViewport());

  useLayoutEffect(() => {
    setPosition(clampPosition(Math.max(12, window.innerWidth / 2 - 430), 130));
    if (editor.current) editor.current.innerHTML = renderAnsiForPreview(serializeAnsiRuns(context.runs)) + (ansiPlainText(context.runs).endsWith('\n') ? '<br data-ansi-sentinel>' : '');
    const previous = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => { const end = ansiPlainText(context.runs).length; if (editor.current) selectAnsiEditor(editor.current, end, end); });
    const surface = panel.current;
    return () => { cancelAnimationFrame(frame); if (surface?.contains(document.activeElement) && previous?.isConnected && !previous.closest('[inert]')) previous.focus({ preventScroll: true }); };
  // This is a draft for the field snapshot captured when the popover opens.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const remember = () => {
      if (!editor.current?.contains(document.activeElement)) return;
      const current = ansiEditorSelection(editor.current);
      if (current && (current.start !== selection.current.start || current.end !== selection.current.end)) { selection.current = current; refreshSelection(tick => tick + 1); }
    };
    const resize = () => { setViewport(floatingViewport()); setPosition(current => clampPosition(current.x, current.y)); };
    const observer = new ResizeObserver(() => setPosition(current => { const next = clampPosition(current.x, current.y); return current.x === next.x && current.y === next.y ? current : next; }));
    if (panel.current) observer.observe(panel.current);
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && panel.current?.contains(document.activeElement)) { event.preventDefault(); onClose(); } };
    document.addEventListener('selectionchange', remember);
    window.addEventListener('resize', resize); window.addEventListener('keydown', escape);
    window.visualViewport?.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('scroll', resize);
    return () => { observer.disconnect(); document.removeEventListener('selectionchange', remember); window.removeEventListener('resize', resize); window.removeEventListener('keydown', escape); window.visualViewport?.removeEventListener('resize', resize); window.visualViewport?.removeEventListener('scroll', resize); };
  }, [onClose]);

  useLayoutEffect(() => { setPosition(current => clampPosition(current.x, current.y)); }, [collapsed, gradientOpen, viewport]);

  const activeRange = () => selection.current.start === selection.current.end ? { start: 0, end: ansiPlainText(runsRef.current).length } : selection.current;
  const styleActive = (key: 'bold' | 'italic' | 'underline' | 'strike') => {
    if (!plainText) return !!typingStyle[key];
    const range = activeRange(); let offset = 0;
    const selected = runs.filter(run => { const start = offset; offset += run.text.length; return offset > range.start && start < range.end; });
    return selected.length > 0 && selected.every(run => run.style[key]);
  };
  const style = (patch: Partial<AnsiStyle>) => {
    if (!ansiPlainText(runsRef.current)) { setTypingStyle(current => ({ ...current, ...patch })); return; }
    const range = activeRange(); commit(styleAnsiSelection(runsRef.current, range.start, range.end, patch), { ...selection.current });
  };
  const toggle = (key: 'bold' | 'italic' | 'underline' | 'strike') => {
    if (!ansiPlainText(runsRef.current)) { setTypingStyle(current => ({ ...current, [key]: !current[key] })); return; }
    const range = activeRange();
    let offset = 0;
    const selected = runsRef.current.filter(run => { const start = offset; offset += run.text.length; return offset > range.start && start < range.end; });
    style({ [key]: !selected.length || !selected.every(run => run.style[key]) });
  };
  const restore = (nextIndex: number) => {
    const entry = history[nextIndex]; if (!entry) return;
    const next = entry.runs;
    selection.current = { ...entry.range };
    const range = entry.range.start === entry.range.end ? {start:0,end:ansiPlainText(next).length} : entry.range;
    let offset = 0;
    const selectedColors = next.filter(run => { const start=offset; offset+=run.text.length; return offset>range.start && start<range.end; }).map(run=>run.style[target]).filter((color):color is string=>!!color);
    const gradient = new Set(selectedColors).size > 1;
    setGradientOpen(gradient);
    wholeGradient.current = gradient && range.start === 0 && range.end === ansiPlainText(next).length;
    if (gradient) { setGradientFrom(ansiColorHex(selectedColors[0])); setGradientTo(ansiColorHex(selectedColors[selectedColors.length-1])); }
    setIndex(nextIndex); runsRef.current = next; setError(''); publish(next, entry.original); draw(next, selection.current);
  };
  const applyGradient = (from = gradientFrom, to = gradientTo) => {
    const range = activeRange();
    wholeGradient.current = range.start === 0 && range.end === ansiPlainText(runsRef.current).length;
    commit(gradientAnsiSelection(runsRef.current, range.start, range.end, from, to, target), { ...selection.current });
  };
  const chooseSolid = (hex: string) => { wholeGradient.current = false; setColors(current => ({ ...current, [target]: hex })); style({ [target]: hex }); };
  const chooseMode = (gradient: boolean) => {
    if (gradient === gradientOpen) return;
    setGradientOpen(gradient);
    if (gradient) applyGradient(); else chooseSolid(colors[target]);
  };
  const inputRuns = (next: AnsiRun[], range: { start: number; end: number }) => {
    if (!ansiPlainText(runsRef.current)) next = next.map(run => ({ ...run, style: { ...typingStyle, ...run.style } }));
    if (gradientOpen && wholeGradient.current) next = gradientAnsiSelection(next, 0, ansiPlainText(next).length, gradientFrom, gradientTo, target);
    commit(next, range);
  };
  const caretStyle = () => {
    let offset = 0;
    for (const run of runsRef.current) { offset += run.text.length; if (selection.current.start <= offset) return run.style; }
    return typingStyle;
  };
  const insert = (inserted: AnsiRun[]) => {
    const current = runsRef.current, range = (editor.current && ansiEditorSelection(editor.current)) || selection.current;
    let offset = 0;
    const before: AnsiRun[] = [], after: AnsiRun[] = [];
    for (const run of current) {
      if (offset < range.start) before.push({ ...run, text: run.text.slice(0, Math.min(run.text.length, range.start - offset)) });
      if (offset + run.text.length > range.end) after.push({ ...run, text: run.text.slice(Math.max(0, range.end - offset)) });
      offset += run.text.length;
    }
    const caret = range.start + ansiPlainText(inserted).length;
    inputRuns([...before, ...inserted, ...after].filter(run => run.text), { start: caret, end: caret });
  };
  const insertLineBreak = useRef(() => {});
  insertLineBreak.current = () => insert([{ text: '\n', style: caretStyle() }]);
  useEffect(() => {
    const field = editor.current;
    // Mobile keyboards may emit beforeinput without a corresponding keydown.
    const beforeInput = (event: InputEvent) => {
      if (event.isComposing || !['insertParagraph', 'insertLineBreak'].includes(event.inputType)) return;
      event.preventDefault(); insertLineBreak.current();
    };
    field?.addEventListener('beforeinput', beforeInput);
    return () => field?.removeEventListener('beforeinput', beforeInput);
  }, []);

  return createPortal(<motion.div ref={panel} role="dialog" aria-labelledby={`${id}-title`} inert={!isPresent} aria-hidden={!isPresent} className="ansi-editor-popover" style={{ left: position.x, top: position.y, width: Math.min(440, viewport.width - 16) }} {...uiMotion.popover}>
    <header className="ansi-editor-popover__header">
      <button type="button" className="ansi-editor-popover__move" aria-label="Move ANSI editor" title="Drag to move. Arrow keys move the window."
        onPointerDown={event => { if (drag.current || event.pointerType === 'mouse' && event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: position.x, top: position.y }; }}
        onPointerMove={event => { const start = drag.current; if (start?.pointerId !== event.pointerId || !event.currentTarget.hasPointerCapture(event.pointerId)) return; if (event.pointerType === 'mouse' && event.buttons === 0) { drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId); return; } setPosition(clampPosition(start.left + event.clientX - start.x, start.top + event.clientY - start.y)); }}
        onPointerUp={event => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
        onKeyDown={event => { if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return; event.preventDefault(); setPosition(current => clampPosition(current.x + (event.key === 'ArrowLeft' ? -10 : event.key === 'ArrowRight' ? 10 : 0), current.y + (event.key === 'ArrowUp' ? -10 : event.key === 'ArrowDown' ? 10 : 0))); }}>
        <IconGrip size={16} aria-hidden /><span><strong id={`${id}-title`}>Text colors</strong><small>{fieldLabel}</small></span>
      </button>
      <div><button type="button" onClick={() => setCollapsed(current => !current)} aria-label={collapsed ? 'Expand ANSI editor' : 'Collapse ANSI editor'}>{collapsed ? <IconMaximize size={15} /> : <IconMinimize size={15} />}</button><button type="button" onClick={onClose} aria-label="Close ANSI editor"><IconX size={17} /></button></div>
    </header>
    <motion.div initial={false} animate={{ height: collapsed ? 0 : 'auto' }} transition={uiMotion.transition} className="ansi-editor-popover__collapse" inert={collapsed} aria-hidden={collapsed}>
    <div className="ansi-editor-popover__body" style={{ maxHeight: Math.max(0, viewport.height - 88) }}>
      <div className="ansi-editor-popover__tools" role="group" aria-label="ANSI text styles">
        <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => toggle('bold')} aria-label="ANSI bold" aria-pressed={styleActive('bold')}><strong>B</strong></button>
        <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => toggle('italic')} aria-label="ANSI italic" aria-pressed={styleActive('italic')}><em>I</em></button>
        <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => toggle('underline')} aria-label="ANSI underline" aria-pressed={styleActive('underline')}><u>U</u></button>
        <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => toggle('strike')} aria-label="ANSI strikethrough" aria-pressed={styleActive('strike')}><s>S</s></button>
        <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => { wholeGradient.current = false; setGradientOpen(false); style({foreground:undefined,background:undefined,bold:false,italic:false,underline:false,strike:false}); }}>Clear style</button>
        <span />
        <button type="button" disabled={index === 0} onClick={() => restore(index - 1)} aria-label="Undo ANSI edit"><IconUndo size={15} /></button>
        <button type="button" disabled={index === history.length - 1} onClick={() => restore(index + 1)} aria-label="Redo ANSI edit"><IconRedo size={15} /></button>
      </div>
      <div ref={editor} className="ansi-editor-popover__editor" role="textbox" aria-label="Colored text" aria-multiline="true" contentEditable suppressContentEditableWarning spellCheck={false} data-placeholder="Write colored text…"
        onInput={event => { if ((event.nativeEvent as InputEvent).isComposing) return; const range = ansiEditorSelection(event.currentTarget); inputRuns(readAnsiEditor(event.currentTarget), range ?? selection.current); }}
        onCompositionEnd={event => { const range = ansiEditorSelection(event.currentTarget); inputRuns(readAnsiEditor(event.currentTarget), range ?? selection.current); }}
        onPaste={event => { event.preventDefault(); const plain = event.clipboardData.getData('text/plain'); const body = plain.match(/^```ansi\n([\s\S]*?)\n```$/i)?.[1] ?? plain; const pasted = parseAnsiRuns(body); insert(hasAnsiStyles(body) ? pasted : pasted.map(run => ({ ...run, style: caretStyle() }))); }}
        onDrop={event => event.preventDefault()}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing || event.keyCode === 229) return;
          const modifier = event.ctrlKey || event.metaKey;
          if (event.key === 'Enter') { event.preventDefault(); if (modifier) { if (!tooLong) onApply(output); } else insert([{text:'\n',style:caretStyle()}]); }
          if (modifier && ['b','i','u'].includes(event.key.toLowerCase())) { event.preventDefault(); toggle(event.key.toLowerCase() === 'b' ? 'bold' : event.key.toLowerCase() === 'i' ? 'italic' : 'underline'); }
          if (modifier && ['z','y'].includes(event.key.toLowerCase())) { event.preventDefault(); restore(event.key.toLowerCase() === 'y' || event.shiftKey ? index + 1 : index - 1); }
        }} />
      <div className="ansi-editor-popover__scope"><span title={selectedCount ? 'Color and style changes affect the selected text.' : 'With no selection, color and style changes affect the whole block.'}>{selectedCount ? `${selectedCount} characters selected` : 'Editing the whole block'}</span><button type="button" disabled={!plainText} onClick={() => { selection.current = { start: 0, end: plainText.length }; refreshSelection(tick => tick + 1); if (editor.current) selectAnsiEditor(editor.current, 0, plainText.length); }}>Select all</button></div>
      <div className="ansi-editor-popover__colors">
        <div className="ansi-editor-popover__color-heading">
          <div className="ansi-editor-popover__target" role="group" aria-label="Color target"><button type="button" aria-pressed={target === 'foreground'} onClick={() => setTarget('foreground')}>Text</button><button type="button" aria-pressed={target === 'background'} onClick={() => setTarget('background')}>Background</button></div>
          <div className="ansi-editor-popover__target" role="group" aria-label="Color style"><button type="button" aria-pressed={!gradientOpen} onClick={() => chooseMode(false)}>Solid</button><button type="button" aria-pressed={gradientOpen} onClick={() => chooseMode(true)}>Gradient</button></div>
        </div>
        <motion.div initial={false} animate={{ height: 'auto' }} transition={uiMotion.transition} className="ansi-editor-popover__color-options">
        {!gradientOpen ? <>
          <div className="ansi-editor-popover__swatches">{SWATCHES.map((swatch, i) => <button type="button" key={swatch} aria-label={`${SWATCH_NAMES[i]} ${target === 'foreground' ? 'text' : 'background'}`} title={SWATCH_NAMES[i]} aria-pressed={!!commonStyle[target] && color.toLowerCase() === swatch} style={{ backgroundColor: swatch }} onMouseDown={event => event.preventDefault()} onClick={() => chooseSolid(swatch)}>{commonStyle[target] && color.toLowerCase() === swatch && <IconCheck size={15} style={{color:i===0||i===3?'#151515':'#fff'}} />}</button>)}</div>
          <div className="ansi-editor-popover__custom"><ColorPicker color={color} label="Text custom color" onChange={chooseSolid} /><input aria-label="Custom color hex" value={hexDraft} maxLength={7} spellCheck={false} onChange={event => { setHexDraft(event.target.value); if (/^#[\da-f]{6}$/i.test(event.target.value)) chooseSolid(event.target.value); }} onBlur={() => setHexDraft(color)} /><button type="button" aria-pressed={!commonStyle[target]} onClick={() => { wholeGradient.current = false; style({ [target]: undefined }); }}>{target === 'foreground' ? 'Default color' : 'No background'}</button></div>
        </> : <>
          <div className="ansi-editor-popover__presets">{GRADIENTS.map(preset => <button type="button" key={preset.name} onClick={() => { setGradientFrom(preset.from); setGradientTo(preset.to); applyGradient(preset.from, preset.to); }}><span style={{ background: `linear-gradient(90deg,${preset.from},${preset.to})` }} />{preset.name}</button>)}</div>
          <div className="ansi-editor-popover__gradient"><label><span>Start</span><ColorPicker color={gradientFrom} onChange={hex => { setGradientFrom(hex); applyGradient(hex, gradientTo); }} label="Gradient start" /></label><span className="ansi-editor-popover__gradient-preview" style={{background:`linear-gradient(90deg,${gradientFrom},${gradientTo})`}} aria-hidden /><label><span>End</span><ColorPicker color={gradientTo} onChange={hex => { setGradientTo(hex); applyGradient(gradientFrom, hex); }} label="Gradient end" /></label></div>
        </>}
        </motion.div>
      </div>
      <div className="ansi-editor-popover__meta"><span className="ansi-editor-popover__save-status" role="status">{tooLong ? 'Last valid edit saved' : original ? 'Changes save automatically' : 'Saved to draft'}</span>{Number.isFinite(maxLength) && maxLength >= 0 && <LimitCounter count={output.length} limit={maxLength} label="Text including color codes" />}</div>
      {(tooLong || error) && <p className="text-field-paste-error" role="alert">{error || 'Too many color codes for this field. Shorten the text or use a solid color. Your last valid edit is saved.'}</p>}
      <footer><button type="button" disabled={tooLong || !plainText.trim()} title="Copy formatted text for Discord" onClick={async () => { try { await navigator.clipboard.writeText('```ansi\n' + serializeAnsiRuns(runs) + '\n```'); setCopied(true); } catch { setError('Could not copy. Your text is still saved to the draft.'); } }}>{copied ? <IconCheck size={14} /> : <IconCopy size={14} />}{copied ? 'Copied' : 'Copy'}</button><div><button type="button" title="Restore the text from when this editor opened" onClick={() => onApply(value)}>Revert</button><button type="button" className="ansi-editor-popover__apply" disabled={tooLong} onClick={() => onApply(output)}><IconCheck size={14} /> Done</button></div></footer>
    </div>
    </motion.div>
  </motion.div>, document.body);
}
