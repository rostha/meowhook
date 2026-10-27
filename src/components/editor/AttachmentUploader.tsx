'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import {
  IconPlus,
  IconX,
  IconUpload,
  IconPaperclip,
} from '@/components/MeowIcons';
import {
  calculateAttachmentUsage,
  DISCORD_ATTACHMENT_LIMIT,
  getAttachmentUsageSummary,
} from '@/lib/attachmentTracker';
import type { Message } from '@/lib/types';
import FileTypeIcon from './FileTypeIcon';
import { getUploadSizeError, UPLOAD_LIMIT_LABEL } from '@/lib/uploadLimits';

const AttachmentUploader = React.memo(function AttachmentUploader({
  msg,
  index,
  updateMessage,
  isRateLimited,
  sectionMode,
}: {
  msg: Message;
  index: number;
  updateMessage: (msgIndex: number, fn: (m: Message) => Message) => void;
  isRateLimited?: boolean;
  sectionMode?: boolean;
}) {
  const showToast = useAppStore((s) => s.showToast);
  const [isDragging, setIsDragging] = useState(false);

  const attachmentUsage = useMemo(() => calculateAttachmentUsage(msg), [msg]);
  const attachmentCount = attachmentUsage.contentFiles;

  const contentAttachments = useMemo(() =>
    (msg._attachments || []).filter(a => a.fieldKey.startsWith('content_file')),
    [msg._attachments]
  );
  const uploadLimitReached = attachmentUsage.hasReachedLimit;
  const uploadDisabled = !!isRateLimited || uploadLimitReached;

  const handleClearAll = useCallback(() => {
    const toRemove = contentAttachments;
    if (toRemove.length === 0) return;

    updateMessage(index, (m) => ({
      ...m,
      _attachments: (m._attachments || []).filter(a => !a.fieldKey.startsWith('content_file')),
    }));

    showToast(`${toRemove.length} attachment${toRemove.length > 1 ? 's' : ''} removed`, 'info');
  }, [contentAttachments, index, updateMessage, showToast]);

  const processFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (isRateLimited) {
      showToast('Rate limited - wait before uploading', 'error');
      return;
    }
    if (uploadLimitReached) {
      showToast(
        `This message is already at ${attachmentUsage.total}/${DISCORD_ATTACHMENT_LIMIT} uploaded attachments. Remove an upload or use image URLs in embeds.`,
        'error'
      );
      return;
    }

    const fileArray = Array.from(files);
    const validFiles: { previewUrl: string; file: File }[] = [];
    const errors: string[] = [];

    for (const file of fileArray) {
      const sizeError = getUploadSizeError(file);
      if (sizeError) {
        errors.push(sizeError);
        continue;
      }
      try {
        const previewUrl = URL.createObjectURL(file);
        validFiles.push({ previewUrl, file });
      } catch {
        errors.push(`"${file.name}": Failed to process`);
      }
    }

    if (errors.length > 0) {
      const summary = errors.length === 1 ? errors[0] : `${errors.length} files rejected: ${errors.join('; ')}`;
      showToast(summary, 'error');
    }

    if (validFiles.length > 0) {
      updateMessage(index, (m) => {
        const usage = calculateAttachmentUsage(m);
        const existing = (m._attachments || []).filter(a => a.fieldKey.startsWith('content_file'));
        const existingCount = existing.length;
        const remainingSlots = usage.remainingSlots;

        if (remainingSlots <= 0) {
          showToast(
            `This message is already at ${usage.total}/${DISCORD_ATTACHMENT_LIMIT} uploaded attachments. Remove an upload or use image URLs in embeds.`,
            'error'
          );
          validFiles.forEach(({ previewUrl }) => {
            if (previewUrl.startsWith('blob:')) {
              try { URL.revokeObjectURL(previewUrl); } catch { /* ignore */ }
            }
          });
          return m;
        }

        const filesToProcess = validFiles.slice(0, remainingSlots);
        const skippedCount = validFiles.length - remainingSlots;

        if (skippedCount > 0) {
          showToast(
            `Only ${remainingSlots} upload slot${remainingSlots === 1 ? '' : 's'} remain for this message. Remove an upload or use image URLs in embeds.`,
            'info'
          );
          validFiles.slice(remainingSlots).forEach(({ previewUrl }) => {
            if (previewUrl.startsWith('blob:')) {
              try { URL.revokeObjectURL(previewUrl); } catch { /* ignore */ }
            }
          });
        }

        let startIdx = existingCount;
        const newAttachments = filesToProcess.map(({ file, previewUrl }) => ({
          file,
          previewUrl,
          fieldKey: `content_file_${startIdx++}`,
        }));
        const attachments = [...(m._attachments || []), ...newAttachments];

        if (skippedCount > 0) {
          showToast(
            `${filesToProcess.length} attachment${filesToProcess.length > 1 ? 's' : ''} added. This message is now at the ${DISCORD_ATTACHMENT_LIMIT} upload limit.`,
            'info'
          );
        } else {
          showToast(`${filesToProcess.length} attachment${filesToProcess.length > 1 ? 's' : ''} added!`, 'success');
        }
        return { ...m, _attachments: attachments };
      });
    }
  }, [attachmentUsage.total, index, isRateLimited, showToast, updateMessage, uploadLimitReached]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!uploadDisabled) setIsDragging(true);
  }, [uploadDisabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (isRateLimited) {
      showToast('Rate limited — wait before uploading', 'error');
      return;
    }
    if (uploadLimitReached) {
      showToast(`This message is already at ${attachmentUsage.total}/${DISCORD_ATTACHMENT_LIMIT} uploaded attachments. Remove an upload or use image URLs in embeds.`, 'error');
      return;
    }
    processFiles(e.dataTransfer.files);
  }, [attachmentUsage.total, isRateLimited, processFiles, showToast, uploadLimitReached]);

  return (
    <div className="attachment-files-subpanel__inner">
      <input
        type="file"
        multiple
        onChange={(e) => { processFiles(e.target.files); e.target.value = ''; }}
        style={{ display: 'none' }}
        id={`file-input-${index}`}
      />
      <div className="attachment-usage-tray">
        <div className="attachment-usage-tray__top">
          <span className="attachment-usage-tray__title">
            {attachmentUsage.total}/{DISCORD_ATTACHMENT_LIMIT} upload slots used
          </span>
          <span className="attachment-usage-tray__meta">
            {attachmentUsage.remainingSlots} slot{attachmentUsage.remainingSlots === 1 ? '' : 's'} left
          </span>
        </div>
        <div className="attachment-usage-tray__meter" aria-hidden>
          <span
            className="attachment-usage-tray__fill"
            style={{ width: `${Math.min(100, (attachmentUsage.total / DISCORD_ATTACHMENT_LIMIT) * 100)}%` }}
          />
        </div>
        <div className="attachment-usage-tray__chips">
          {attachmentUsage.contentFiles > 0 && <span className="attachment-usage-chip">Files {attachmentUsage.contentFiles}</span>}
          {attachmentUsage.embedImages > 0 && <span className="attachment-usage-chip">Images {attachmentUsage.embedImages}</span>}
          {attachmentUsage.embedThumbnails > 0 && <span className="attachment-usage-chip">Thumbs {attachmentUsage.embedThumbnails}</span>}
          {attachmentUsage.authorIcons > 0 && <span className="attachment-usage-chip">Author {attachmentUsage.authorIcons}</span>}
          {attachmentUsage.footerIcons > 0 && <span className="attachment-usage-chip">Footer {attachmentUsage.footerIcons}</span>}
          {attachmentUsage.total === 0 && <span className="attachment-usage-chip">No uploads yet</span>}
        </div>
        <div className="attachment-usage-tray__summary">
          {getAttachmentUsageSummary(attachmentUsage)}
        </div>
      </div>
      {sectionMode ? (
        attachmentCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 8 }}>
            <button
              type="button"
              onClick={handleClearAll}
              title="Clear all files"
              style={{
                padding: '4px 8px',
                fontSize: 11,
                color: 'var(--danger)',
                background: 'transparent',
                border: '1px solid var(--danger)',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Clear All
            </button>
          </div>
        )
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span className="label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <IconPaperclip size={14} />
            Files ({attachmentCount})
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>
              Uploads {attachmentUsage.total}/{DISCORD_ATTACHMENT_LIMIT}
            </span>
            {attachmentUsage.total > DISCORD_ATTACHMENT_LIMIT && (
              <span style={{ fontSize: 11, color: 'var(--warning)', marginLeft: 4 }}>(over limit; send will batch)</span>
            )}
          </span>
          {attachmentCount > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              title="Clear all attachments"
              style={{
                padding: '4px 8px',
                fontSize: 11,
                color: 'var(--danger)',
                background: 'transparent',
                border: '1px solid var(--danger)',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Clear All
            </button>
          )}
        </div>
      )}

      {attachmentCount > 0 && (
        <div
          className={`attachment-strip${isDragging ? ' attachment-strip--drag' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {contentAttachments.map((att) => {
            const mimeType = att.file?.type || att.mimeType || '';
            const fileName = att.file?.name || att.name || 'file';
            const isImage = mimeType.startsWith('image/');
            return (
              <div
                key={att.fieldKey}
                style={{
                  position: 'relative',
                  width: 64,
                  height: 64,
                  borderRadius: 8,
                  overflow: 'hidden',
                  border: '1px solid var(--border)',
                  flexShrink: 0,
                }}
              >
                {isImage ? (
                  <img src={att.previewUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{
                    width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', background: 'var(--bg-secondary)', gap: 2,
                  }}>
                    <FileTypeIcon mimeType={mimeType} fileName={fileName} size={20} />
                    <span style={{ fontSize: 8, color: 'var(--text-muted)', maxWidth: 56, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>
                      {fileName}
                    </span>
                  </div>
                )}
                <button
                  onClick={() => {
                    updateMessage(index, (m) => ({
                      ...m,
                      _attachments: (m._attachments || []).filter(a => a.fieldKey !== att.fieldKey),
                    }));
                  }}
                  style={{
                    position: 'absolute', top: 2, right: 2, width: 18, height: 18,
                    borderRadius: '50%', background: 'rgba(0,0,0,0.7)', border: 'none',
                    color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 10,
                  }}
                  title="Remove"
                >
                  <IconX size={12} />
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => !uploadDisabled && document.getElementById(`file-input-${index}`)?.click()}
            style={{
              width: 54,
              height: 54,
              borderRadius: 10,
              border: '1px dashed color-mix(in srgb, var(--border) 78%, var(--accent) 12%)',
              background: 'var(--bg-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: uploadDisabled ? 'not-allowed' : 'pointer',
              opacity: uploadDisabled ? 0.4 : 1,
              flexShrink: 0,
            }}
            title={
              isRateLimited
                ? 'Rate limited - wait before uploading'
                : uploadLimitReached
                  ? `At ${attachmentUsage.total}/${DISCORD_ATTACHMENT_LIMIT} uploads - remove an upload or use image URLs in embeds`
                  : `Add more files · Up to ${UPLOAD_LIMIT_LABEL} per file`
            }
          >
            <IconPlus size={18} strokeWidth={2} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
      )}

      {attachmentCount === 0 && (
        <div
          className={[
            'attachment-dropzone',
            isDragging ? 'attachment-dropzone--active' : '',
            uploadDisabled ? 'attachment-dropzone--disabled' : '',
          ].filter(Boolean).join(' ')}
          role="button"
          tabIndex={uploadDisabled ? -1 : 0}
          aria-label="Upload files"
          title={`Up to ${UPLOAD_LIMIT_LABEL} per file · ${DISCORD_ATTACHMENT_LIMIT} files per message`}
          aria-disabled={uploadDisabled}
          onKeyDown={(event) => { if (!uploadDisabled && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); document.getElementById(`file-input-${index}`)?.click(); } }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={(event) => { if (!uploadDisabled) { event.currentTarget.focus(); document.getElementById(`file-input-${index}`)?.click(); } }}
        >
          <div className="attachment-dropzone__inner">
            <span className="attachment-dropzone__icon" aria-hidden>
              <IconUpload size={22} strokeWidth={2} aria-hidden />
            </span>
            <div className="attachment-dropzone__title">
              {isRateLimited
                ? 'Upload paused'
                : uploadLimitReached
                  ? 'Upload limit reached'
                  : 'Click or drag files here'}
            </div>
            <div className={`attachment-dropzone__hint${uploadDisabled ? '' : ' attachment-dropzone__hint--contextual'}`}>
              {isRateLimited
                ? 'Rate limited - try again in a moment.'
                : uploadLimitReached
                  ? `This message already uses ${attachmentUsage.total}/${DISCORD_ATTACHMENT_LIMIT} uploaded attachments. Remove an upload or use image URLs in embeds.`
                  : `Up to ${UPLOAD_LIMIT_LABEL} per file · ${DISCORD_ATTACHMENT_LIMIT} files per message`}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default AttachmentUploader;
