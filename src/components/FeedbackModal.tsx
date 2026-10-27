'use client';
import { useUiMotion } from '@/lib/useUiMotion';
import { useDialogFocus } from '@/lib/useDialogFocus';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useAppStore } from '@/stores/useAppStore';
import { getBrandAssets } from '@/lib/brandAssets';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';
import {
  IconAlert,
  IconCheck,
  IconFileText,
  IconFilm,
  IconHelpBubble,
  IconImage,
  IconLightbulb,
  IconMessage,
  IconPaperclip,
  IconSendHook,
  IconTrash,
  IconUpload,
  IconX,
} from '@/components/MeowIcons';

type FeedbackKind = 'bug' | 'suggestion' | 'feedback';

const MAX_FEEDBACK_ATTACHMENTS = 3;
const MAX_FEEDBACK_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_FEEDBACK_TOTAL_BYTES = 20 * 1024 * 1024;

const FEEDBACK_OPTIONS: Array<{
  id: FeedbackKind;
  label: string;
  description: string;
  icon: typeof IconAlert;
}> = [
  {
    id: 'bug',
    label: 'Bug report',
    description: 'Something is broken, confusing, or behaving unexpectedly.',
    icon: IconAlert,
  },
  {
    id: 'suggestion',
    label: 'Suggestion',
    description: 'An improvement idea, UX change, or feature request.',
    icon: IconLightbulb,
  },
  {
    id: 'feedback',
    label: 'General feedback',
    description: 'Anything else you want to share about Meowhook.',
    icon: IconMessage,
  },
];

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function getAttachmentIcon(file: File) {
  if (file.type.startsWith('image/')) return IconImage;
  if (file.type.startsWith('video/')) return IconFilm;
  if (
    file.type.startsWith('text/') ||
    file.type.includes('json') ||
    file.type.includes('pdf') ||
    file.type.includes('xml')
  ) {
    return IconFileText;
  }
  return IconPaperclip;
}

export default function FeedbackModal({ onClose }: { onClose: () => void }) {
  const settings = useAppStore((s) => s.settings);
  const showToast = useAppStore((s) => s.showToast);
  const brand = getBrandAssets(settings.theme);

  const [kind, setKind] = useState<FeedbackKind>('bug');
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [contact, setContact] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useBodyScrollLock(true);

  const uiMotion = useUiMotion();
  const dialogRef = useDialogFocus(() => { if (!submitting) onClose(); });
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose, submitting]);

  useEffect(() => {
    if (typeof window === 'undefined' || window.matchMedia('(max-width: 768px)').matches) return;
    const id = requestAnimationFrame(() => titleInputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  const trimmedTitle = title.trim();
  const trimmedDetails = details.trim();
  const totalAttachmentBytes = attachments.reduce((sum, file) => sum + file.size, 0);
  const canSubmit = trimmedTitle.length >= 3 && trimmedDetails.length >= 10 && !submitting;

  const addAttachments = (incoming: FileList | null) => {
    const nextFiles = Array.from(incoming ?? []);
    if (nextFiles.length === 0) return;

    if (attachments.length + nextFiles.length > MAX_FEEDBACK_ATTACHMENTS) {
      showToast(`You can attach up to ${MAX_FEEDBACK_ATTACHMENTS} files`, 'error');
      return;
    }

    const oversized = nextFiles.find((file) => file.size > MAX_FEEDBACK_ATTACHMENT_BYTES);
    if (oversized) {
      showToast(`${oversized.name} is over ${formatFileSize(MAX_FEEDBACK_ATTACHMENT_BYTES)}`, 'error');
      return;
    }

    const nextTotal = totalAttachmentBytes + nextFiles.reduce((sum, file) => sum + file.size, 0);
    if (nextTotal > MAX_FEEDBACK_TOTAL_BYTES) {
      showToast(`Attachments must stay under ${formatFileSize(MAX_FEEDBACK_TOTAL_BYTES)} total`, 'error');
      return;
    }

    setAttachments((current) => [...current, ...nextFiles]);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.set('kind', kind);
      formData.set('title', trimmedTitle);
      formData.set('details', trimmedDetails);
      formData.set('contact', contact.trim());
      // Only send the form fields — no device metadata, IP, or draft context is collected.
      attachments.forEach((file) => {
        formData.append('attachments', file, file.name);
      });

      const response = await fetch('/api/feedback', {
        method: 'POST',
        body: formData,
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        showToast(payload?.error || 'Could not send feedback right now', 'error');
        return;
      }

      setSubmitted(true);
      showToast('Feedback sent. Thank you.', 'success');
      setTimeout(() => {
        onClose();
      }, 700);
    } catch {
      showToast('Could not send feedback right now', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      className="modal-overlay"
      onClick={() => {
        if (!submitting) onClose();
      }}
      {...uiMotion.overlay}
    >
      <motion.div
        className="modal-content feedback-modal-shell"
        ref={dialogRef} role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-modal-title"
        onClick={(event) => event.stopPropagation()}
        {...uiMotion.dialog}
      >
        <div className="feedback-modal-header">
          <div className="feedback-modal-header__lead">
            <div className="feedback-modal-brand" aria-hidden>
              <img src={brand.icon} alt="" width={40} height={40} decoding="async" draggable={false} className="feedback-modal-brand__mark" />
            </div>
            <div className="feedback-modal-header__text">
              <h2 id="feedback-modal-title" className="feedback-modal-title">
                <IconHelpBubble size={22} aria-hidden />
                Send feedback
              </h2>
              <p className="feedback-modal-subtitle">
                Report bugs, share ideas, or send general feedback straight to your Discord feedback inbox.
              </p>
            </div>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Close feedback form" disabled={submitting}>
            <IconX size={22} />
          </button>
        </div>

        <form className="feedback-modal-body" onSubmit={handleSubmit}>
          <div className="feedback-modal-banner">
            <div className="feedback-modal-banner__title">Privacy notice</div>
            <div className="feedback-modal-banner__text">
              Only what you type and any files you attach are sent. No IP address, browser info, or webhook data is collected.
            </div>
          </div>

          <div className="feedback-kind-grid" role="radiogroup" aria-label="Feedback type">
            {FEEDBACK_OPTIONS.map((option) => {
              const Icon = option.icon;
              const active = kind === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`feedback-kind-card ${active ? 'feedback-kind-card--active' : ''}`}
                  onClick={() => setKind(option.id)}
                  aria-pressed={active}
                >
                  <span className="feedback-kind-card__icon">
                    <Icon size={21} />
                  </span>
                  <span className="feedback-kind-card__body">
                    <span className="feedback-kind-card__label">{option.label}</span>
                    <span className="feedback-kind-card__description">{option.description}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="feedback-modal-field">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <label className="label" htmlFor="feedback-title">Title</label>
              <span className={`char-counter ${trimmedTitle.length > 100 ? 'warn' : ''}`}>{title.length}/120</span>
            </div>
            <input
              ref={titleInputRef}
              id="feedback-title"
              value={title}
              onChange={(event) => setTitle(event.target.value.slice(0, 120))}
              placeholder="Short summary of the issue or idea"
              maxLength={120}
            />
          </div>

          <div className="feedback-modal-field">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <label className="label" htmlFor="feedback-details">Details</label>
              <span className={`char-counter ${trimmedDetails.length > 1800 ? 'warn' : ''}`}>{details.length}/2000</span>
            </div>
            <textarea
              id="feedback-details"
              value={details}
              onChange={(event) => setDetails(event.target.value.slice(0, 2000))}
              placeholder={
                kind === 'bug'
                  ? 'What happened, what you expected, and how to reproduce it'
                  : kind === 'suggestion'
                    ? 'What would you like improved, and why would it help?'
                    : 'Share what worked, what felt off, or anything else on your mind'
              }
              rows={7}
            />
          </div>

          <div className="feedback-modal-field">
            <label className="label" htmlFor="feedback-contact">Optional contact</label>
            <input
              id="feedback-contact"
              value={contact}
              onChange={(event) => setContact(event.target.value.slice(0, 120))}
              placeholder="Discord handle, email, or leave blank"
              maxLength={120}
            />
          </div>

          <div className="feedback-modal-field">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <label className="label" htmlFor="feedback-attachments">Attachments</label>
              <span className="feedback-attachments-meta">
                {attachments.length}/{MAX_FEEDBACK_ATTACHMENTS} files, {formatFileSize(totalAttachmentBytes)} total
              </span>
            </div>

            <input
              ref={fileInputRef}
              id="feedback-attachments"
              type="file"
              multiple
              className="visually-hidden"
              onChange={(event) => {
                addAttachments(event.target.files);
                event.currentTarget.value = '';
              }}
            />

            <button
              type="button"
              className="feedback-attachments-picker"
              onClick={() => fileInputRef.current?.click()}
              disabled={submitting || attachments.length >= MAX_FEEDBACK_ATTACHMENTS}
            >
              <span className="feedback-attachments-picker__icon">
                <IconUpload size={20} />
              </span>
              <span className="feedback-attachments-picker__body">
                <span className="feedback-attachments-picker__title">Add screenshots or files</span>
                <span className="feedback-attachments-picker__hint">
                  Up to {MAX_FEEDBACK_ATTACHMENTS} files, {formatFileSize(MAX_FEEDBACK_ATTACHMENT_BYTES)} each
                </span>
              </span>
            </button>

            {attachments.length > 0 && (
              <div className="feedback-attachments-list">
                {attachments.map((file, index) => {
                  const Icon = getAttachmentIcon(file);
                  return (
                    <div key={`${file.name}-${file.size}-${file.lastModified}-${index}`} className="feedback-attachment-item">
                      <span className="feedback-attachment-item__icon">
                        <Icon size={16} />
                      </span>
                      <span className="feedback-attachment-item__body">
                        <span className="feedback-attachment-item__name">{file.name}</span>
                        <span className="feedback-attachment-item__meta">{formatFileSize(file.size)}</span>
                      </span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        aria-label={`Remove ${file.name}`}
                        onClick={() => setAttachments((current) => current.filter((_, fileIndex) => fileIndex !== index))}
                      >
                        <IconTrash size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="feedback-modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
              {submitted ? <IconCheck size={16} /> : <IconSendHook size={16} />}
              {submitted ? 'Sent' : submitting ? 'Sending...' : 'Send feedback'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
