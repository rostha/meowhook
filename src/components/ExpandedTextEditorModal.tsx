'use client';
import { useUiMotion } from '@/lib/useUiMotion';
import { useDialogFocus } from '@/lib/useDialogFocus';

import { useEffect, useRef, useState, useCallback, useMemo, useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, useIsPresent } from 'framer-motion';
import { IconX, IconCheck, IconLink, IconFileText, IconMessage, IconUndo, IconRedo, IconPalette } from '@/components/MeowIcons';
import {
  wrapSelection,
  insertRaw,
  insertFencedCodeBlock,
  insertLinkTemplate,
  insertPrefixOnLine,
  type EditResult,
} from '@/lib/textEditorInsert';
import { ESCAPE_SNIPPETS, EMOJI_PICKER_GRID } from '@/lib/discordEditorSnippets';
import LimitCounter from '@/components/LimitCounter';
import { formattingHintForTool } from '@/lib/formattingHints';
import { prepareAnsiPaste } from '@/lib/ansiPaste';

type Run = (v: string, a: number, b: number, max: number) => EditResult | null;

type ToolButtonDef = {
  type: 'button';
  id: string;
  label: ReactNode;
  title: string;
  run: Run;
  /** Larger touch target for icon-only tools */
  icon?: boolean;
};

type ToolDividerDef = { type: 'divider'; id: string };

type ToolItem = ToolButtonDef | ToolDividerDef;
type EditorHistoryEntry = { value: string; selStart: number; selEnd: number };

function mkToolItems(maxLength: number): { style: ToolItem[]; block: ToolItem[]; heading: ToolItem[]; line: ToolItem[] } {
  const m = maxLength < 0 || !Number.isFinite(maxLength) ? Infinity : maxLength;

  /** Style row: text labels only; divider between inline (B…BI) and semantic (code, block, spoiler). */
  const style: ToolItem[] = [
    {
      type: 'button',
      id: 'bold',
      title: 'Bold',
      label: <span className="ee-tool-bold">B</span>,
      run: (v, a, b) => wrapSelection(v, a, b, '**', '**', m),
    },
    {
      type: 'button',
      id: 'italic',
      title: 'Italic',
      label: <span className="ee-tool-italic">I</span>,
      run: (v, a, b) => wrapSelection(v, a, b, '*', '*', m),
    },
    {
      type: 'button',
      id: 'under',
      title: 'Underline',
      label: <span className="ee-tool-under">U</span>,
      run: (v, a, b) => wrapSelection(v, a, b, '__', '__', m),
    },
    {
      type: 'button',
      id: 'strike',
      title: 'Strikethrough',
      label: <span className="ee-tool-strike">S</span>,
      run: (v, a, b) => wrapSelection(v, a, b, '~~', '~~', m),
    },
    {
      type: 'button',
      id: 'bi',
      title: 'Bold + italic',
      label: <span className="ee-tool-bi">BI</span>,
      run: (v, a, b) => wrapSelection(v, a, b, '***', '***', m),
    },
    { type: 'divider', id: 'd-style-1' },
    {
      type: 'button',
      id: 'code',
      title: 'Inline code',
      label: <span className="ee-tool-code">&lt;/&gt;</span>,
      run: (v, a, b) => wrapSelection(v, a, b, '`', '`', m),
    },
    {
      type: 'button',
      id: 'fenced',
      title: 'Code block',
      label: <span className="ee-tool-fence">Code block</span>,
      run: (v, a, b) => insertFencedCodeBlock(v, a, b, m),
    },
    {
      type: 'button',
      id: 'spoiler',
      title: 'Spoiler',
      label: <span className="ee-tool-spoiler">Spoiler</span>,
      run: (v, a, b) => wrapSelection(v, a, b, '||', '||', m),
    },
  ];

  const block: ToolItem[] = [
    {
      type: 'button',
      id: 'quote',
      title: 'Blockquote',
      label: (
        <span className="ee-tool-block-inner">
          <IconMessage size={15} strokeWidth={2} aria-hidden />
          <span>Quote</span>
        </span>
      ),
      run: (v, a, b) => insertPrefixOnLine(v, a, '> ', m),
    },
    {
      type: 'button',
      id: 'list',
      title: 'List item',
      label: (
        <span className="ee-tool-block-inner">
          <IconFileText size={15} strokeWidth={2} aria-hidden />
          <span>List</span>
        </span>
      ),
      run: (v, a, b) => insertPrefixOnLine(v, a, '- ', m),
    },
    {
      type: 'button',
      id: 'link',
      title: 'Link',
      label: (
        <span className="ee-tool-block-inner">
          <IconLink size={14} strokeWidth={2} aria-hidden />
          <span>Link</span>
        </span>
      ),
      run: (v, a, b) => insertLinkTemplate(v, a, b, m),
    },
  ];

  const heading: ToolItem[] = [
    {
      type: 'button',
      id: 'h1',
      label: 'H1',
      title: 'Heading #',
      run: (v, a, b) => insertPrefixOnLine(v, a, '# ', m),
    },
    {
      type: 'button',
      id: 'h2',
      label: 'H2',
      title: 'Heading ##',
      run: (v, a, b) => insertPrefixOnLine(v, a, '## ', m),
    },
    {
      type: 'button',
      id: 'h3',
      label: 'H3',
      title: 'Heading ###',
      run: (v, a, b) => insertPrefixOnLine(v, a, '### ', m),
    },
  ];

  const line: ToolItem[] = [
    {
      type: 'button',
      id: 'subtext',
      title: 'Small text (-#)',
      label: 'Small text',
      run: (v, a, b) => insertPrefixOnLine(v, a, '-# ', m),
    },
    {
      type: 'button',
      id: 'task',
      title: 'Task list',
      label: <span className="ee-tool-line">Task</span>,
      run: (v, a, b) => insertPrefixOnLine(v, a, '- [ ] ', m),
    },
    {
      type: 'button',
      id: 'indent',
      title: 'Tab / indent',
      label: <span className="ee-tool-line">Tab</span>,
      run: (v, a, b) => insertRaw(v, a, b, '\t', m),
    },
  ];

  return { style, block, heading, line };
}

const TABS = [
  { id: 'format' as const, label: 'Formatting' },
  { id: 'escapes' as const, label: 'Escapes' },
  { id: 'emoji' as const, label: 'Emoji' },
];

const DEFAULT_PLACEHOLDER = 'Start typing...';

export type ExpandedTextEditorModalProps = {
  open: boolean;
  onClose: () => void;
  value: string;
  onApply: (next: string) => void;
  onChange?: (next: string) => void;
  multiline?: boolean;
  maxLength?: number;
  placeholder?: string;
  title?: string;
  onOpenAnsi?: (text: string, start: number, end: number) => void;
};

export default function ExpandedTextEditorModal({
  open,
  onClose,
  value,
  onApply,
  onChange,
  multiline = true,
  maxLength,
  placeholder,
  title = 'Editor',
  onOpenAnsi,
}: ExpandedTextEditorModalProps) {
  const isPresent = useIsPresent();
  const toolsId = useId();
  const [draft, setDraft] = useState(value);
  const [pasteError, setPasteError] = useState('');
  const [tab, setTab] = useState<'format' | 'escapes' | 'emoji'>('format');
  const [hintTool, setHintTool] = useState<string | null>(null);
  const [historyTick, setHistoryTick] = useState(0);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const initialValueRef = useRef(value);
  const valueRef = useRef(value);
  valueRef.current = value;
  const historyPastRef = useRef<EditorHistoryEntry[]>([]);
  const historyFutureRef = useRef<EditorHistoryEntry[]>([]);

  const max = maxLength === undefined || maxLength < 0 ? Infinity : maxLength;
  const maxFinite = Number.isFinite(max);
  const groups = useMemo(() => mkToolItems(max), [max]);

  const sanitizeForParent = useCallback(
    (next: string) => (multiline ? next : next.replace(/[\r\n]+/g, ' ')),
    [multiline],
  );

  const queueSelection = useCallback((selStart: number, selEnd: number) => {
    requestAnimationFrame(() => {
      const el = taRef.current;
      if (!el) return;
      const safeStart = Math.max(0, Math.min(selStart, el.value.length));
      const safeEnd = Math.max(0, Math.min(selEnd, el.value.length));
      el.focus();
      el.setSelectionRange(safeStart, safeEnd);
    });
  }, []);

  const resetHistory = useCallback((nextValue: string) => {
    historyPastRef.current = [
      {
        value: nextValue,
        selStart: nextValue.length,
        selEnd: nextValue.length,
      },
    ];
    historyFutureRef.current = [];
    setHistoryTick((tick) => tick + 1);
  }, []);

  const pushHistoryEntry = useCallback((entry: EditorHistoryEntry) => {
    const lastEntry = historyPastRef.current[historyPastRef.current.length - 1];
    if (
      lastEntry &&
      lastEntry.value === entry.value &&
      lastEntry.selStart === entry.selStart &&
      lastEntry.selEnd === entry.selEnd
    ) {
      return;
    }

    historyPastRef.current = [...historyPastRef.current, entry].slice(-100);
    historyFutureRef.current = [];
    setHistoryTick((tick) => tick + 1);
  }, []);

  useEffect(() => {
    if (!open) return;
    initialValueRef.current = valueRef.current;
    setPasteError('');
    setDraft(valueRef.current);
    setTab('format');
    resetHistory(valueRef.current);
  }, [open, resetHistory]);

  const handleCancel = useCallback(() => {
    if (!isPresent) return;
    onChange?.(initialValueRef.current);
    onClose();
  }, [onChange, onClose, isPresent]);

  const uiMotion = useUiMotion();
  const dialogRef = useDialogFocus(handleCancel, open && isPresent);

  useEffect(() => {
    if (!open || !isPresent) return;
    const id = requestAnimationFrame(() => {
      taRef.current?.focus();
      const len = taRef.current?.value.length ?? 0;
      taRef.current?.setSelectionRange(len, len);
    });
    return () => cancelAnimationFrame(id);
  }, [open, isPresent]);

  const updateDraft = useCallback(
    (next: string, selStart: number, selEnd: number) => {
      setPasteError('');
      setDraft(next);
      onChange?.(sanitizeForParent(next));
      pushHistoryEntry({
        value: next,
        selStart,
        selEnd,
      });
    },
    [onChange, pushHistoryEntry, sanitizeForParent],
  );

  const apply = useCallback(
    (mutator: (v: string, a: number, b: number, maxLen: number) => EditResult | null) => {
      const el = taRef.current;
      if (!el) return;
      const a = el.selectionStart ?? 0;
      const b = el.selectionEnd ?? 0;
      const r = mutator(draft, a, b, max);
      if (!r) return;

      let nextText = r.text;
      let nextSelStart = r.selStart;
      let nextSelEnd = r.selEnd;

      if (!multiline) {
        nextSelStart = nextText.slice(0, nextSelStart).replace(/[\r\n]+/g, ' ').length;
        nextSelEnd = nextText.slice(0, nextSelEnd).replace(/[\r\n]+/g, ' ').length;
        nextText = nextText.replace(/[\r\n]+/g, ' ');
      }

      setDraft(nextText);
      onChange?.(sanitizeForParent(nextText));
      pushHistoryEntry({
        value: nextText,
        selStart: nextSelStart,
        selEnd: nextSelEnd,
      });
      queueSelection(nextSelStart, nextSelEnd);
    },
    [draft, max, multiline, onChange, pushHistoryEntry, queueSelection, sanitizeForParent],
  );

  const handleDone = () => {
    const next = sanitizeForParent(draft);
    onApply(next);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const usesModifier = e.metaKey || e.ctrlKey;

    if (usesModifier && !e.altKey) {
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }
      if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }
      if (key === 'b') {
        e.preventDefault();
        apply((value, start, end, maxLen) => wrapSelection(value, start, end, '**', '**', maxLen));
        return;
      }
      if (key === 'i') {
        e.preventDefault();
        apply((value, start, end, maxLen) => wrapSelection(value, start, end, '*', '*', maxLen));
        return;
      }
      if (key === 'u') {
        e.preventDefault();
        apply((value, start, end, maxLen) => wrapSelection(value, start, end, '__', '__', maxLen));
        return;
      }
      if (key === 'k') {
        e.preventDefault();
        apply((value, start, end, maxLen) => insertLinkTemplate(value, start, end, maxLen));
        return;
      }
      if (key === 'enter') {
        e.preventDefault();
        handleDone();
        return;
      }
    }

    if (!multiline && e.key === 'Enter') {
      e.preventDefault();
      handleDone();
    }
  };

  const handleUndo = useCallback(() => {
    if (historyPastRef.current.length <= 1) return;

    const currentEntry = historyPastRef.current[historyPastRef.current.length - 1];
    const previousEntry = historyPastRef.current[historyPastRef.current.length - 2];

    historyPastRef.current = historyPastRef.current.slice(0, -1);
    historyFutureRef.current = [currentEntry, ...historyFutureRef.current].slice(0, 100);
    setHistoryTick((tick) => tick + 1);
    setDraft(previousEntry.value);
    onChange?.(sanitizeForParent(previousEntry.value));
    queueSelection(previousEntry.selStart, previousEntry.selEnd);
  }, [onChange, queueSelection, sanitizeForParent]);

  const handleRedo = useCallback(() => {
    if (historyFutureRef.current.length === 0) return;

    const nextEntry = historyFutureRef.current[0];
    historyFutureRef.current = historyFutureRef.current.slice(1);
    historyPastRef.current = [...historyPastRef.current, nextEntry].slice(-100);
    setHistoryTick((tick) => tick + 1);
    setDraft(nextEntry.value);
    onChange?.(sanitizeForParent(nextEntry.value));
    queueSelection(nextEntry.selStart, nextEntry.selEnd);
  }, [onChange, queueSelection, sanitizeForParent]);

  const canUndo = historyTick >= 0 && historyPastRef.current.length > 1;
  const canRedo = historyTick >= 0 && historyFutureRef.current.length > 0;
  const len = draft.length;
  const activeHint = hintTool ? formattingHintForTool(hintTool) : undefined;

  const renderToolRow = (items: ToolItem[]) => (
    <div className="expanded-text-editor-toolbar-row">
      {items.map((item) => {
        if (item.type === 'divider') return <span key={item.id} className="expanded-text-editor-tool-divider" role="separator" aria-hidden />;
        const hint = multiline ? formattingHintForTool(item.id) : undefined;
        return (
          <button
            key={item.id}
            type="button"
            className={`expanded-text-editor-tool ${item.icon ? 'expanded-text-editor-tool--iconish' : ''}`}
            title={`${item.title}${hint ? ` — ${hint.syntax}` : ''}`}
            aria-label={item.title}
            aria-describedby={multiline ? `${toolsId}-hint` : undefined}
            onPointerEnter={() => setHintTool(item.id)}
            onFocus={() => setHintTool(item.id)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setHintTool(item.id); apply(item.run); }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <motion.div
      className="expanded-text-editor-overlay"
      onClick={handleCancel}
      {...uiMotion.overlay}
    >
      <motion.div
        ref={dialogRef} role="dialog" inert={!isPresent} aria-hidden={!isPresent}
        aria-modal="true"
        aria-labelledby="expanded-editor-title"
        className="expanded-text-editor-dialog"
        onClick={(e) => e.stopPropagation()}
        {...uiMotion.dialog}
      >
        <header className="expanded-text-editor-header">
          <div className="expanded-text-editor-header-main">
            <div className="expanded-text-editor-header-text">
              <h2 id="expanded-editor-title" className="expanded-text-editor-title">
                {title}
              </h2>
              <p className="expanded-text-editor-sub">
                Select text to format it. Your preview updates as you write.
                {!multiline && (
                  <span className="expanded-text-editor-warn"> Single-line: line breaks become spaces when you apply.</span>
                )}
              </p>
            </div>
          </div>
          <div className="expanded-text-editor-header-actions">
            {multiline && onOpenAnsi && <button type="button" className="expanded-text-editor-color-action" aria-label="Open text color editor" title="Open the floating text color editor"
              onMouseDown={event => event.preventDefault()} onClick={() => onOpenAnsi(draft, taRef.current?.selectionStart ?? 0, taRef.current?.selectionEnd ?? 0)}><IconPalette size={15} /> Colors</button>}
            {maxFinite && (
              <LimitCounter count={len} limit={max} label={title ?? 'Editor text'} className="expanded-text-editor-count" />
            )}
            <button type="button" className="expanded-text-editor-close" onClick={handleCancel} aria-label="Close">
              <IconX size={18} strokeWidth={2} />
            </button>
          </div>
        </header>

        <div className="expanded-text-editor-main">
          <div className="expanded-text-editor-toolbar-shell">
            <div className="expanded-text-editor-tools-header">
            <div className="expanded-text-editor-tabs" role="tablist" aria-label="Editor tools">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  id={`${toolsId}-${t.id}`}
                  aria-controls={`${toolsId}-panel`}
                  tabIndex={tab === t.id ? 0 : -1}
                  aria-selected={tab === t.id}
                  className={`expanded-text-editor-tab ${tab === t.id ? 'is-active' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setTab(t.id)}
                  onKeyDown={(event) => {
                    const index = TABS.findIndex(item => item.id === tab);
                    const next = event.key === 'ArrowRight' ? (index + 1) % TABS.length
                      : event.key === 'ArrowLeft' ? (index + TABS.length - 1) % TABS.length
                      : event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : -1;
                    if (next < 0) return;
                    event.preventDefault();
                    setTab(TABS[next].id);
                    document.getElementById(`${toolsId}-${TABS[next].id}`)?.focus();
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
              <div
                className="expanded-text-editor-history-controls topbar-history-cluster"
                role="group"
                aria-label="History"
              >
                <button
                  type="button"
                  onClick={handleUndo}
                  className="btn btn-ghost topbar-history-btn"
                  title="Undo (Ctrl/Cmd+Z)"
                  aria-label="Undo"
                  disabled={!canUndo}
                >
                  <IconUndo size={16} strokeWidth={2} aria-hidden />
                  <span>Undo</span>
                </button>
                <button
                  type="button"
                  onClick={handleRedo}
                  className="btn btn-ghost topbar-history-btn"
                  title="Redo (Ctrl/Cmd+Shift+Z)"
                  aria-label="Redo"
                  disabled={!canRedo}
                >
                  <IconRedo size={16} strokeWidth={2} aria-hidden />
                  <span>Redo</span>
                </button>
              </div>
            </div>

            <div className="expanded-text-editor-panel" role="tabpanel" id={`${toolsId}-panel`} aria-labelledby={`${toolsId}-${tab}`}>
              {tab === 'format' && (
                <div className="expanded-text-editor-format">
                  <div className="expanded-text-editor-tool-section">
                    <span className="expanded-text-editor-tool-section-label">Style</span>
                    {renderToolRow(multiline ? groups.style : groups.style.filter((t) => t.id !== 'fenced'))}
                  </div>
                  {multiline && (
                    <>
                      <div className="expanded-text-editor-tool-section">
                        <span className="expanded-text-editor-tool-section-label">Block</span>
                        {renderToolRow(groups.block)}
                      </div>
                      <div className="expanded-text-editor-tool-section">
                        <span className="expanded-text-editor-tool-section-label">Heading</span>
                        {renderToolRow(groups.heading)}
                      </div>
                      <div className="expanded-text-editor-tool-section">
                        <span className="expanded-text-editor-tool-section-label">Line</span>
                        {renderToolRow(groups.line)}
                      </div>
                    </>
                  )}
                </div>
              )}

              {tab === 'escapes' && (
                <div className="expanded-text-editor-escapes">
                  <p className="expanded-text-editor-panel-hint">
                    Use these codes for line breaks or spacing, including in JSON. They become real line breaks and spaces in your message.
                  </p>
                  <div className="expanded-text-editor-toolbar-row">
                    {ESCAPE_SNIPPETS.map((s) => (
                      <button
                        key={s.insert}
                        type="button"
                        className="expanded-text-editor-tool expanded-text-editor-tool--mono"
                        title={s.title}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => apply((v, a, b, m) => insertRaw(v, a, b, s.insert, m))}
                      >
                        {s.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="expanded-text-editor-tool expanded-text-editor-tool--mono"
                      title="Custom emoji"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => apply((v, a, b, m) => insertRaw(v, a, b, '<:name:id>', m))}
                    >
                      {'<:...>'}
                    </button>
                  </div>
                </div>
              )}

              {tab === 'emoji' && (
                <div className="expanded-text-editor-emoji-panel">
                  <p className="expanded-text-editor-panel-hint">Choose an emoji below, or paste one into your text. Custom server emoji use a <code>{'<:name:id>'}</code> code copied from Discord.</p>
                  <div className="expanded-text-editor-emoji-grid" role="group" aria-label="Emoji">
                    {EMOJI_PICKER_GRID.map((em, i) => (
                      <button
                        key={`${em}-${i}`}
                        type="button"
                        className="expanded-text-editor-emoji-cell"
                        title={em}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => apply((v, a, b, m) => insertRaw(v, a, b, em, m))}
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {multiline && <div className="expanded-text-editor-tool-hint" id={`${toolsId}-hint`}>
              {tab === 'format' && activeHint ? <><strong>{activeHint.name}</strong><code>{activeHint.syntax}</code><span>{activeHint.hint}</span></>
                : tab === 'format' ? <span>Select text to style it. Point to a tool, focus it, or tap it for a formatting hint.</span>
                : tab === 'escapes' ? <span>For ordinary text, you can press Enter instead of typing <code>{'\\n'}</code>.</span>
                : <span>For a custom emoji, type a backslash before the emoji in Discord to copy its code.</span>}
            </div>}
          </div>

          <div className="expanded-text-editor-editor-wrap">
            <textarea
              ref={taRef}
              className="expanded-text-editor-textarea"
              aria-label={title}
              aria-describedby={pasteError ? `${toolsId}-paste-error` : undefined}
              value={draft}
              onChange={(e) =>
                updateDraft(
                  e.target.value,
                  e.target.selectionStart ?? e.target.value.length,
                  e.target.selectionEnd ?? e.target.value.length,
                )
              }
              onKeyDown={handleKeyDown}
              onPaste={event => {
                if (!multiline) return;
                const result = prepareAnsiPaste(draft, event.currentTarget.selectionStart, event.currentTarget.selectionEnd, event.clipboardData.getData('text/plain'), max);
                if (!result) return;
                event.preventDefault();
                if ('error' in result) { setPasteError(result.error); return; }
                updateDraft(result.edit.text, result.edit.selStart, result.edit.selEnd);
                queueSelection(result.edit.selStart, result.edit.selEnd);
                if (result.openEditor) onOpenAnsi?.(result.edit.text, result.edit.replaceStart ?? 0, (result.edit.replaceStart ?? 0) + (result.edit.replacement?.length ?? result.edit.text.length));
              }}
              placeholder={placeholder ?? DEFAULT_PLACEHOLDER}
              maxLength={Number.isFinite(max) ? max : undefined}
              spellCheck
            />
            {pasteError && <p id={`${toolsId}-paste-error`} className="text-field-paste-error" role="alert">{pasteError}</p>}
            <div className="expanded-text-editor-shortcuts" aria-hidden>
              {multiline ? (
                <>
                  <span className="expanded-text-editor-shortcut-pill">
                    <kbd>Enter</kbd>
                    <span className="expanded-text-editor-shortcut-pill__hint">new line</span>
                  </span>
                  <span className="expanded-text-editor-shortcut-pill">
                    <kbd>\n</kbd>
                    <span className="expanded-text-editor-shortcut-pill__hint">in JSON</span>
                  </span>
                </>
              ) : (
                <span className="expanded-text-editor-shortcut-pill">
                  <kbd>Enter</kbd>
                  <span className="expanded-text-editor-shortcut-pill__hint">apply</span>
                </span>
              )}
              <span className="expanded-text-editor-shortcut-pill expanded-text-editor-shortcut-pill--kbd-only">
                <kbd>Ctrl+Z</kbd>
                <span className="expanded-text-editor-shortcut-pill__hint">undo</span>
              </span>
              <span className="expanded-text-editor-shortcut-pill expanded-text-editor-shortcut-pill--kbd-only">
                <kbd>Ctrl+Shift+Z</kbd>
                <span className="expanded-text-editor-shortcut-pill__hint">redo</span>
              </span>
            </div>
          </div>
        </div>

        <footer className="expanded-text-editor-footer">
          <span className="expanded-text-editor-footer-note">Cancel restores your original text.</span>
          <div className="expanded-text-editor-footer-btns">
            <button type="button" className="btn expanded-text-editor-btn-cancel" onClick={handleCancel}>
              Cancel
            </button>
            <button type="button" className="btn expanded-text-editor-btn-apply" onClick={handleDone}>
              <IconCheck size={17} strokeWidth={2.25} aria-hidden />
              Apply
            </button>
          </div>
        </footer>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
