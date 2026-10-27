'use client';

import { useEffect, useRef } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { json } from '@codemirror/lang-json';
import { useAppStore } from '@/stores/useAppStore';

const editorTheme = (dark: boolean) => EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: '13px' },
  '.cm-scroller': { fontFamily: 'var(--font-ui-mono), ui-monospace, monospace', lineHeight: '1.6', overflow: 'auto' },
  '.cm-content': { padding: '12px 0', minHeight: '100%' },
  '.cm-line': { padding: '0 12px' },
  '.cm-gutters': { backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)', borderRight: '1px solid var(--border)' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--bg-hover)' },
  '.cm-cursor': { borderLeftColor: 'var(--text-primary)' },
  '.cm-selectionBackground': { backgroundColor: 'var(--bg-active) !important' },
  '.cm-foldPlaceholder': { backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' },
}, { dark });

export default function JsonCodeEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const dark = useAppStore(state => state.settings.theme !== 'discord-light');
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      doc: value,
      parent: hostRef.current,
      extensions: [
        basicSetup,
        json(),
        editorTheme(dark),
        EditorView.contentAttributes.of({ 'aria-label': 'Webhook JSON payload' }),
        EditorView.updateListener.of(update => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
      ],
    });
    viewRef.current = view;
    return () => { viewRef.current = null; view.destroy(); };
    // The editor owns its document after mounting; later prop updates are synchronized below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, [value]);

  return <div ref={hostRef} className="json-code-editor" />;
}
