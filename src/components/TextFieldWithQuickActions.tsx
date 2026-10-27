'use client';

import { useId, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { InputHTMLAttributes, TextareaHTMLAttributes, RefObject } from 'react';
import { IconMaximize, IconPalette } from '@/components/MeowIcons';
// This small, frequently used editor must be ready on the first click.
import ExpandedTextEditorModal from '@/components/ExpandedTextEditorModal';
import { prepareAnsiPaste } from '@/lib/ansiPaste';
import AnsiEditorPopover from '@/components/AnsiEditorPopover';
import { hasAnsiStyles } from '@/lib/ansi';

type Base = {
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  wrapperClassName?: string;
  expandedEditorTitle?: string;
};

type InputMode = Base &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'ref'> & { multiline?: false };
type TextareaMode = Base &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'ref'> & { multiline: true };

export type TextFieldWithQuickActionsProps = InputMode | TextareaMode;

/** Text field with a focus-revealed control to open the full markdown editor modal. */
export default function TextFieldWithQuickActions(props: TextFieldWithQuickActionsProps) {
  const { value, onChange, multiline, className, style, wrapperClassName, expandedEditorTitle, ...rest } = props;
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const [expandedOpen, setExpandedOpen] = useState(false);
  const ansiSessionId = useRef(0);
  const [ansiSession, setAnsiSession] = useState<{ id: number; value: string; start: number; end: number } | null>(null);
  const [pasteError, setPasteError] = useState('');
  const pasteErrorId = useId();

  const maxLengthAttr = (rest as { maxLength?: number }).maxLength;
  const placeholderAttr = (rest as { placeholder?: string }).placeholder;

  const onOpenEditor = () => {
    setExpandedOpen(true);
    ref.current?.focus();
  };
  const closeAnsiEditor = () => {
    setAnsiSession(null);
    requestAnimationFrame(() => ref.current?.focus({ preventScroll: true }));
  };

  const commonInputClass = ['text-field-expand-input', className].filter(Boolean).join(' ');

  return (
    <>
      <div className={['text-field-expand-wrap', wrapperClassName].filter(Boolean).join(' ')}>
        {multiline ? (
          <textarea
            ref={ref as RefObject<HTMLTextAreaElement>}
            value={value}
            onChange={(e) => { setPasteError(''); onChange(e.target.value); }}
            className={commonInputClass}
            style={style}
            {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)}
            readOnly={rest.readOnly || !!ansiSession}
            aria-describedby={[rest['aria-describedby'], pasteError ? pasteErrorId : ''].filter(Boolean).join(' ') || undefined}
            onPaste={event => {
              (rest as TextareaHTMLAttributes<HTMLTextAreaElement>).onPaste?.(event);
              const textarea = event.currentTarget;
              if (event.defaultPrevented || textarea.readOnly || textarea.disabled) return;
              const result = prepareAnsiPaste(textarea.value, textarea.selectionStart, textarea.selectionEnd, event.clipboardData.getData('text/plain'), maxLengthAttr ?? Infinity);
              if (!result) return;
              event.preventDefault();
              if ('error' in result) { setPasteError(result.error); return; }
              setPasteError('');
              onChange(result.edit.text);
              if (result.openEditor) setAnsiSession({ id: ++ansiSessionId.current, value: result.edit.text, start: result.edit.replaceStart ?? 0, end: (result.edit.replaceStart ?? 0) + (result.edit.replacement?.length ?? result.edit.text.length) });
              requestAnimationFrame(() => textarea.setSelectionRange(result.edit.selStart, result.edit.selEnd));
            }}
          />
        ) : (
          <input
            ref={ref as RefObject<HTMLInputElement>}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={commonInputClass}
            style={style}
            {...(rest as InputHTMLAttributes<HTMLInputElement>)}
          />
        )}

        <div className={multiline ? 'text-field-editor-actions' : 'text-field-expand-anchor'}>
          {multiline && <button type="button" className="text-field-editor-action ansi-editor-trigger" title="Open the floating text color editor" aria-label="Open text color editor" disabled={rest.disabled || rest.readOnly || !!ansiSession}
            onMouseDown={event => event.preventDefault()}
            onClick={() => setAnsiSession({ id: ++ansiSessionId.current, value, start: ref.current?.selectionStart ?? 0, end: ref.current?.selectionEnd ?? 0 })}><IconPalette size={14} aria-hidden />{hasAnsiStyles(value) ? 'Edit colors' : 'Colors'}</button>}
          <button
            type="button"
            className={multiline ? 'text-field-editor-action' : 'text-field-expand-btn'}
            title="Open full editor"
            aria-label="Open full markdown editor"
            disabled={!!ansiSession || rest.disabled}
            onClick={onOpenEditor}
          >
            <IconMaximize size={14} strokeWidth={2} />
            {multiline && <span>Expand</span>}
          </button>
        </div>
      </div>
      {pasteError && <p id={pasteErrorId} className="text-field-paste-error" role="alert">{pasteError}</p>}

      <AnimatePresence>
      {expandedOpen && <ExpandedTextEditorModal
        key="expanded-editor"
        open={expandedOpen}
        onClose={() => setExpandedOpen(false)}
        value={value}
        onApply={onChange}
        onChange={onChange}
        multiline={!!multiline}
        maxLength={maxLengthAttr}
        placeholder={placeholderAttr}
        title={expandedEditorTitle ?? 'Editor'}
        onOpenAnsi={multiline ? (text, start, end) => { setExpandedOpen(false); setAnsiSession({ id: ++ansiSessionId.current, value: text, start, end }); } : undefined}
      />}
      {ansiSession && <AnsiEditorPopover key={`ansi-editor-${ansiSession.id}`} value={ansiSession.value} selectionStart={ansiSession.start} selectionEnd={ansiSession.end} maxLength={maxLengthAttr}
        fieldLabel={expandedEditorTitle ?? 'Message text'} onPreview={onChange}
        onClose={closeAnsiEditor} onApply={text => { onChange(text); closeAnsiEditor(); }} />}
      </AnimatePresence>
    </>
  );
}
