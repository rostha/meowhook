'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { motion, Reorder, useDragControls } from 'framer-motion';
import { IconArrowDown, IconArrowUp, IconChevronDown, IconChevronRight, IconGrip, IconImage, IconLink, IconTrash, IconUpload } from '@/components/MeowIcons';
import LimitCounter from '@/components/LimitCounter';
import ComponentOptionCheck from './ComponentOptionCheck';
import { componentAttachmentUrl, componentPreviewUrl, findComponentAttachment } from '@/lib/componentAttachments';
import { getUploadSizeError, UPLOAD_LIMIT_LABEL } from '@/lib/uploadLimits';
import { uid } from '@/lib/utils';
import { useUiMotion } from '@/lib/useUiMotion';
import type { ComponentBlock, FileAttachment } from '@/lib/types';

type GalleryItem = Extract<ComponentBlock, { type: 'gallery' }>['items'][number];
type Props = {
  items: GalleryItem[];
  attachments: FileAttachment[];
  onChange: (items: GalleryItem[], attachment?: FileAttachment) => void;
};

function GalleryThumbnail({ url, video }: { url: string; video: boolean }) {
  const [failed, setFailed] = useState(false);
  return <span className="gallery-item__thumbnail" aria-hidden>
    {url && /^(https?:|blob:)/.test(url) && !failed
      ? video ? <video src={url} preload="metadata" muted onError={() => setFailed(true)} /> : <img src={url} alt="" onError={() => setFailed(true)} />
      : <IconImage size={19} />}
  </span>;
}

function GalleryItemEditor({ item, index, count, attachments, onChange, onMove, onRemove }: {
  item: GalleryItem; index: number; count: number; attachments: FileAttachment[];
  onChange: (change: Partial<GalleryItem>, attachment?: FileAttachment) => void;
  onMove: (direction: -1 | 1) => void; onRemove: () => void;
}) {
  const controls = useDragControls();
  const uiMotion = useUiMotion();
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const urlInput = useRef<HTMLInputElement>(null);
  const sourcePopover = useRef<HTMLDivElement>(null);
  const sourceTrigger = useRef<HTMLButtonElement>(null);
  const [dragging, setDragging] = useState(false);
  const activeDrag = useRef(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [error, setError] = useState('');
  const selected = findComponentAttachment(item.url, attachments);
  const previewUrl = componentPreviewUrl(item.url, attachments);
  const available = attachments.filter(attachment => attachment.fieldKey !== 'avatar' && /^(image|video)\//.test(attachment.mimeType ?? attachment.file?.type ?? ''));
  const label = `Gallery image ${index + 1}`;
  const mimeType = selected?.mimeType ?? selected?.file?.type ?? item.mimeType;
  const size = selected?.file?.size ?? selected?.size;
  const closeSource = () => sourcePopover.current?.hidePopover();
  useEffect(() => {
    if (!sourceOpen) return;
    const close = () => sourcePopover.current?.hidePopover();
    const scroll = (event: Event) => { if (!sourcePopover.current?.contains(event.target as Node)) close(); };
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', close);
    return () => { window.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', close); };
  }, [sourceOpen]);
  const upload = (file?: File) => {
    if (!file) return;
    const sizeError = getUploadSizeError(file);
    if (sizeError) { setError(sizeError); return; }
    if (!/^(image|video)\//.test(file.type)) { setError('Choose an image or video.'); return; }
    const attachment: FileAttachment = { file, previewUrl: URL.createObjectURL(file), fieldKey: `component_file_${uid()}`, name: file.name, size: file.size, mimeType: file.type };
    setError('');
    onChange({ url: attachment.previewUrl, mimeType: file.type }, attachment);
  };

  return <Reorder.Item as="div" value={item.id} dragListener={false} dragControls={controls} dragMomentum={false}
    layout="position" transition={uiMotion.reorder} dragTransition={uiMotion.dragTransition}
    className="gallery-item" data-gallery-item-id={item.id} data-dragging={dragging || undefined}
    onDragStart={() => { closeSource(); activeDrag.current = true; setDragging(true); }}
    onDragEnd={() => { activeDrag.current = false; }}
    onDragTransitionEnd={() => { if (!activeDrag.current) setDragging(false); }}
    onPointerCancel={() => { activeDrag.current = false; setDragging(false); }}>
    <div className="gallery-item__head">
      <div className="gallery-item__heading">
        <button type="button" className="gallery-item__grip" disabled={count < 2} aria-label={`Reorder ${label.toLowerCase()}`}
          title="Drag to reorder, or use the arrow keys"
          onPointerDown={event => { event.stopPropagation(); event.preventDefault(); event.currentTarget.focus({ preventScroll: true }); controls.start(event, { snapToCursor: false, distanceThreshold: 4 }); }}
          onKeyDown={event => { if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); event.stopPropagation(); onMove(event.key === 'ArrowUp' ? -1 : 1); } }}>
          <IconGrip size={16} aria-hidden />
        </button>
        <span>Image {index + 1}</span>
      </div>
      <div className="gallery-item__actions">
        <button type="button" aria-label={`Move ${label.toLowerCase()} up`} title="Move up" disabled={index === 0} onClick={() => onMove(-1)}><IconArrowUp size={14} aria-hidden /></button>
        <button type="button" aria-label={`Move ${label.toLowerCase()} down`} title="Move down" disabled={index === count - 1} onClick={() => onMove(1)}><IconArrowDown size={14} aria-hidden /></button>
        <button type="button" className="gallery-item__delete" aria-label={`Remove ${label.toLowerCase()}`} title="Remove image" onClick={onRemove}><IconTrash size={15} aria-hidden /></button>
      </div>
    </div>
    <div className="gallery-item__source">
      <GalleryThumbnail key={previewUrl} url={previewUrl} video={!!mimeType?.startsWith('video/')} />
      {selected ? <div className="gallery-item__file" tabIndex={-1} aria-label={`${label} URL`}>
        <span title={selected.file?.name ?? selected.name}>{selected.file?.name ?? selected.name ?? 'Attached file'}</span>
        <small>{size ? size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB` : 'Uploaded file'}</small>
      </div> : <input ref={urlInput} aria-label={`${label} URL`} aria-describedby={error ? `${id}-error` : undefined}
        inputMode="url" value={item.url} placeholder="Paste an image or video URL"
        onChange={event => { setError(''); onChange({ url: event.target.value, mimeType: undefined }); }} />}
      <button ref={sourceTrigger} type="button" className="gallery-item__change" popoverTarget={`${id}-source`} aria-haspopup="dialog" aria-label={`Change ${label.toLowerCase()} source`}
        onClick={event => {
          const rect = event.currentTarget.getBoundingClientRect();
          const popover = sourcePopover.current;
          if (popover) { popover.style.left = `${Math.max(8, Math.min(rect.right - 224, window.innerWidth - 232))}px`; popover.style.top = `${rect.bottom + 180 < window.innerHeight ? rect.bottom + 6 : Math.max(8, rect.top - 174)}px`; }
        }}>Change<IconChevronDown size={12} aria-hidden /></button>
      <div ref={sourcePopover} id={`${id}-source`} popover="auto" role="dialog" aria-label={`${label} source`} className="gallery-source-popover" onToggle={event => {
        const open = event.newState === 'open'; setSourceOpen(open);
        const rect = sourceTrigger.current?.getBoundingClientRect();
        const popover = sourcePopover.current;
        if (open && rect && popover) { const height = popover.getBoundingClientRect().height; popover.style.top = `${rect.bottom + height + 14 < window.innerHeight ? rect.bottom + 6 : Math.max(8, rect.top - height - 6)}px`; }
      }}>
        <button type="button" onClick={() => { closeSource(); setError(''); if (selected) onChange({ url: '', mimeType: undefined }); requestAnimationFrame(() => urlInput.current?.focus()); }}><IconLink size={15} aria-hidden />Use an image URL</button>
        <button type="button" onClick={() => { closeSource(); fileInput.current?.click(); }}><IconUpload size={15} aria-hidden />Upload from device</button>
        {available.length > 0 && <label><span>Choose from this draft</span><select aria-label={`Use uploaded ${label} URL`} value="" onChange={event => {
          const attachment = available.find(file => componentAttachmentUrl(file) === event.target.value);
          if (attachment) { setError(''); onChange({ url: componentAttachmentUrl(attachment), mimeType: attachment.mimeType ?? attachment.file?.type }); closeSource(); }
        }}><option value="">Select a file…</option>{available.map(file => <option key={file.fieldKey} value={componentAttachmentUrl(file)}>{file.file?.name ?? file.name ?? 'Attached file'}</option>)}</select></label>}
        <small>Images & video · Up to {UPLOAD_LIMIT_LABEL} per file</small>
      </div>
      <input ref={fileInput} type="file" accept="image/*,video/*" aria-label={`Upload ${label} URL`} hidden onChange={event => { upload(event.target.files?.[0]); event.target.value = ''; }} />
    </div>
    <div className="gallery-item__details" data-gallery-options>
      <button type="button" className="gallery-item__options-trigger" aria-expanded={optionsOpen} aria-controls={`${id}-options`} onClick={() => setOptionsOpen(open => !open)}>
        <IconChevronRight size={14} aria-hidden /><span>{item.description || item.spoiler ? [item.description ? 'Alt text added' : '', item.spoiler ? 'Spoiler on' : ''].filter(Boolean).join(' · ') : 'Alt text & spoiler'}</span>
      </button>
      <motion.div id={`${id}-options`} initial={false} animate={{ height: optionsOpen ? 'auto' : 0 }} transition={uiMotion.transition}
        className="gallery-item__options-panel" inert={!optionsOpen} aria-hidden={!optionsOpen}>
      <div className="gallery-item__details-body">
        <label><span className="editor-field-label"><span>Image description</span><LimitCounter count={item.description.length} limit={1024} label={`${label} description`} /></span>
          <input aria-label={`${label} description`} value={item.description} maxLength={1024} placeholder="Describe this image (optional)" onChange={event => onChange({ description: event.target.value })} /></label>
        <ComponentOptionCheck label="Hide as a spoiler" ariaLabel={`${label} spoiler`} checked={!!item.spoiler} onChange={spoiler => onChange({ spoiler })} />
      </div></motion.div>
    </div>
    {error && <p className="gallery-item__error" id={`${id}-error`} role="alert">{error}</p>}
  </Reorder.Item>;
}

export default function MediaGalleryEditor({ items, attachments, onChange }: Props) {
  const [announcement, setAnnouncement] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const move = (id: string, direction: -1 | 1) => {
    const index = items.findIndex(item => item.id === id);
    const destination = index + direction;
    if (index < 0 || destination < 0 || destination >= items.length) return;
    const next = [...items];
    const [item] = next.splice(index, 1); next.splice(destination, 0, item);
    onChange(next); setAnnouncement(`Image ${index + 1} moved to position ${destination + 1}.`);
  };
  const remove = (id: string) => {
    const index = items.findIndex(item => item.id === id);
    const next = items.filter(item => item.id !== id);
    const focusId = next[Math.min(index, next.length - 1)]?.id;
    onChange(next); setAnnouncement(`Image ${index + 1} removed.`);
    requestAnimationFrame(() => {
      const row = focusId ? root.current?.querySelector<HTMLElement>(`[data-gallery-item-id="${CSS.escape(focusId)}"]`) : root.current;
      row?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
    });
  };
  return <div ref={root} className="gallery-editor">
    <Reorder.Group as="div" axis="y" className="gallery-editor__list" values={items.map(item => item.id)} onReorder={ids => {
      const current = new Map(items.map(item => [item.id, item]));
      const next = ids.map(id => current.get(id)).filter((item): item is GalleryItem => !!item);
      if (next.length === items.length) onChange(next);
    }}>
      {items.map((item, index) => <GalleryItemEditor key={item.id} item={item} index={index} count={items.length} attachments={attachments}
        onChange={(change, attachment) => onChange(items.map(image => image.id === item.id ? { ...image, ...change } : image), attachment)}
        onMove={direction => move(item.id, direction)} onRemove={() => remove(item.id)} />)}
    </Reorder.Group>
    {items.length < 10 && <button type="button" className="component-add" onClick={() => onChange([...items, { id: uid(), url: '', description: '' }])}>+ Add media</button>}
    <span className="visually-hidden" role="status">{announcement}</span>
  </div>;
}
