'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { IconImage, IconLink, IconLoader, IconUpload, IconX } from './MeowIcons';
import { AnimatedEditorList, AnimatedEditorRow } from './AnimatedEditorList';

export type MediaSourceFile = { value: string; name: string };
type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onUpload: (file: File, progress: (value: number) => void, signal: AbortSignal) => void | Promise<void>;
  accept: string;
  hint: string;
  selected?: { name: string; size?: number };
  previewUrl?: string;
  files?: MediaSourceFile[];
  fileOnly?: boolean;
  roundPreview?: boolean;
  uploadDisabledReason?: string;
};

function MediaThumbnail({ url, round }: { url?: string; round?: boolean }) {
  const [failed, setFailed] = useState(false);
  return <span className={`media-source__preview${round ? ' media-source__preview--round' : ''}`} aria-hidden>
    {url && /^(https?:|blob:)/.test(url) && !failed ? <img src={url} alt="" onError={() => setFailed(true)} /> : <IconImage size={20} />}
  </span>;
}

export default function MediaSourceControl({ label, value, onChange, onUpload, accept, hint, selected, previewUrl, files = [], fileOnly, roundPreview, uploadDisabledReason }: Props) {
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const pending = useRef<AbortController | null>(null);
  const [mode, setMode] = useState<'url' | 'upload'>(selected || fileOnly ? 'upload' : 'url');
  const [busy, setBusy] = useState(false), [progress, setProgress] = useState(0), [error, setError] = useState('');
  const hasFile = !!selected;
  useEffect(() => { setMode(hasFile || fileOnly ? 'upload' : 'url'); }, [hasFile, fileOnly]);
  useEffect(() => () => { pending.current?.abort(); pending.current = null; }, []);
  const uploadFile = async (file?: File) => {
    if (!file || uploadDisabledReason) return;
    pending.current?.abort();
    const controller = new AbortController(); pending.current = controller;
    setError(''); setBusy(true); setProgress(0);
    try { await onUpload(file, setProgress, controller.signal); }
    catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Upload failed. Please try again.'); }
    finally { if (pending.current === controller) { pending.current = null; setBusy(false); } }
  };
  const chooseMode = (next: 'url' | 'upload') => { setError(''); setMode(next); };
  const size = selected?.size ? selected.size < 1024 * 1024 ? `${Math.max(1, Math.round(selected.size / 1024))} KB` : `${(selected.size / 1024 / 1024).toFixed(1)} MB` : '';
  const showUploadHint = mode === 'upload' && (!selected || busy || !!uploadDisabledReason);
  const uploadDescription = [showUploadHint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  return <div className="media-source" aria-busy={busy}>
    <div className="media-source__header">
      <label htmlFor={mode === 'url' ? id : `${id}-file`}>{label.replace(/ URL$/, '')}</label>
      {!fileOnly && <div className="media-source__modes" role="group" aria-label={`${label} source`}>
        <button type="button" aria-pressed={mode === 'url'} disabled={busy} onClick={() => chooseMode('url')}><IconLink size={13} aria-hidden />URL</button>
        <button type="button" aria-pressed={mode === 'upload'} disabled={busy} onClick={() => chooseMode('upload')}><IconUpload size={13} aria-hidden />Upload</button>
      </div>}
    </div>
    <AnimatedEditorList gap={0} className="media-source__body"><AnimatedEditorRow key={mode}><div className="media-source__body-fields">
    {mode === 'url' && !fileOnly ? <div className="media-source__url-row">
      <MediaThumbnail key={previewUrl} url={previewUrl} round={roundPreview} />
      <input id={id} aria-label={label} type="text" inputMode="url" value={value} placeholder="https://example.com/image.png" onChange={event => { setError(''); onChange(event.target.value); }} />
      {value && <button type="button" className="media-source__clear" aria-label={`Clear ${label}`} title="Clear image" onClick={() => onChange('')}><IconX size={14} aria-hidden /></button>}
    </div> : <div className="media-source__file-row" id={`${id}-file`} tabIndex={-1} aria-label={label} aria-describedby={uploadDescription}>
      <MediaThumbnail key={previewUrl} url={selected ? previewUrl : undefined} round={roundPreview} />
      <div className="media-source__file-info">
        <span title={selected?.name}>{busy ? `Uploading${progress > 0 ? ` · ${Math.round(progress)}%` : '…'}` : selected?.name || 'Choose a file'}</span>
        {selected && size && !busy && <small>{size}</small>}
      </div>
      <button type="button" className="media-source__upload" disabled={busy || !!uploadDisabledReason} title={uploadDisabledReason || hint} aria-describedby={uploadDescription} onClick={() => fileInput.current?.click()}>
        {busy ? <IconLoader size={14} className="spin" aria-hidden /> : <IconUpload size={14} aria-hidden />}{busy ? 'Uploading' : selected ? 'Replace' : 'Browse'}
      </button>
      {selected && !busy && <button type="button" className="media-source__clear" aria-label={`Clear ${label}`} title="Remove selected file" onClick={() => onChange('')}><IconX size={14} aria-hidden /></button>}
    </div>}
    {files.length > 0 && mode === 'upload' && <select id={`${id}-existing`} className="media-source__existing" aria-label={`Use uploaded ${label}`} disabled={busy} value="" onChange={event => { setError(''); setMode('upload'); onChange(event.target.value); }}>
      <option value="">Choose from this draft…</option>{files.map(file => <option key={file.value} value={file.value}>{file.name}</option>)}
    </select>}
    {showUploadHint && <p className="media-source__hint" id={`${id}-hint`}>{uploadDisabledReason || hint}</p>}
    {error && <p className="media-source__error" id={`${id}-error`} role="alert">{error}</p>}
    </div></AnimatedEditorRow></AnimatedEditorList>
    <input ref={fileInput} type="file" accept={accept} aria-label={`Upload ${label}`} hidden disabled={busy || !!uploadDisabledReason} onChange={event => { void uploadFile(event.target.files?.[0]); event.target.value = ''; }} />
  </div>;
}
