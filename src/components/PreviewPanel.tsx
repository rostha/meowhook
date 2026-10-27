'use client';
import { useAppStore } from '@/stores/useAppStore';
import { createWelcomeDraft } from '@/lib/welcomeDraft';
import { parseDiscordMarkdownForPreview, parseDiscordEmbedFieldForPreview, parseDiscordEmbedFieldNameForPreview, parseDiscordEmbedTitleForPreview, parseDiscordEmbedAuthorForPreview, parseDiscordEmbedFooterForPreview } from '@/lib/markdown';
import { intToHex, groupEmbedFieldsForPreview, inlineEmbedFieldGridTemplateColumns, isValidWebhookUrl } from '@/lib/utils';
import { useImageDimensions, calculateDiscordImageSize } from '@/lib/useImageDimensions';
import { getSendBlockingReason } from '@/lib/payload';
import { isComponentsV2, hasComponentPreviewContent } from '@/lib/messageComponents';
import { ComponentsPreview, LinkButtonsPreview } from '@/components/editor/ComponentsPreview';
import { calculateAttachmentUsage } from '@/lib/attachmentTracker';
import { validationTarget } from '@/lib/validationTarget';
import type { EditorFocusTarget, Embed, Field, Message } from '@/lib/types';
import {
  IconBellOff, IconEyeOff, IconHash, IconLink, IconMessages, IconMinus, IconPlus,
  IconFilm, IconMusic, IconFileArchive, IconFileText, IconFileCode, IconPaperclip, IconDownload,
} from '@/components/MeowIcons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

function hasContentFileAttachments(m: Message): boolean {
  return (m._attachments || []).some((a) => a.fieldKey.startsWith('content_file'));
}

function messageHasPreviewContent(m: Message): boolean {
  return isComponentsV2(m) ? hasComponentPreviewContent(m.componentBlocks ?? []) : !!(m.content?.trim()) || m.embeds.length > 0 || hasContentFileAttachments(m) || (m.linkButtons?.length ?? 0) > 0;
}

function isValidUrl(str: string | undefined): boolean {
  if (!str) return false;
  return str.startsWith('http://') || str.startsWith('https://') || str.startsWith('blob:');
}

function isInteractivePreviewTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && !!target.closest('a, button, audio, video, input, textarea, select');
}

function isSelectingPreviewText(): boolean {
  return !!window.getSelection()?.toString().trim();
}

function formatDiscordTimestamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  if (isToday) {
    return `Today at ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  }
  if (isYesterday) {
    return `Yesterday at ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

interface PreviewPanelProps {
  onRequestEditorFocus?: () => void;
}

export default React.memo(function PreviewPanel({ onRequestEditorFocus }: PreviewPanelProps) {
  const tabs = useAppStore((s) => s.tabs);
  const activeTabIndex = useAppStore((s) => s.activeTabIndex);
  const webhookInfo = useAppStore((s) => s.webhookInfo);
  const requestEditorFocus = useAppStore((s) => s.requestEditorFocus);
  const updateMessage = useAppStore((s) => s.updateMessage);

  const activeTab = tabs[activeTabIndex];
  const messages = activeTab?.messages || [];
  const webhookUrl = activeTab?.webhookUrl ?? '';
  const previewMessages = useMemo(() => {
    const visibleMessages: Array<{
      msg: Message;
      idx: number;
      prevVisibleMsg: Message | null;
      isFirstVisible: boolean;
    }> = [];
    let prevVisibleMsg: Message | null = null;

    messages.forEach((msg, idx) => {
      if (!messageHasPreviewContent(msg)) return;
      visibleMessages.push({
        msg,
        idx,
        prevVisibleMsg,
        isFirstVisible: prevVisibleMsg === null,
      });
      prevVisibleMsg = msg;
    });

    return visibleMessages;
  }, [messages]);
  const hasAnyContent = previewMessages.length > 0;
  const canTryWelcomeExample = messages.length === 1 && !isComponentsV2(messages[0]) &&
    !messages[0].content.trim() && messages[0].embeds.length === 0 &&
    (messages[0]._attachments?.length ?? 0) === 0 && (messages[0].linkButtons?.length ?? 0) === 0;

  const validWebhook = isValidWebhookUrl(webhookUrl);
  const attachmentTotals = messages.map((m) => calculateAttachmentUsage(m).total);
  const sendBlocked = getSendBlockingReason(messages, attachmentTotals);
  const previewReady = validWebhook && sendBlocked === null;
  const anySuppressEmbeds = messages.some(m => (m.flags & 4) !== 0);
  const anySilent = messages.some(m => (m.flags & 4096) !== 0);

  const [zoom, setZoom] = useState(1);
  const previewScaleRef = useRef<HTMLDivElement>(null);
  const scaledWrapperRef = useRef<HTMLDivElement>(null);

  const handleZoomIn = () => setZoom(z => Math.min(z + 0.1, 2));
  const handleZoomOut = () => setZoom(z => Math.max(z - 0.1, 0.5));
  const handleZoomReset = () => setZoom(1);
  const jumpToEditor = useCallback((target: Omit<EditorFocusTarget, 'requestId'>) => {
    requestEditorFocus(target);
    onRequestEditorFocus?.();
  }, [onRequestEditorFocus, requestEditorFocus]);

  useEffect(() => {
    const node = previewScaleRef.current;
    const wrapper = scaledWrapperRef.current;
    if (!node || !wrapper) return;

    // At 100%, normal document flow already sizes the preview correctly.
    wrapper.style.height = '';
    if (zoom === 1) return;
    const updateScaledHeight = (height: number) => {
      const next = `${Math.max(120, Math.ceil(height * zoom) + 40)}px`;
      if (wrapper.style.height !== next) wrapper.style.height = next;
    };
    updateScaledHeight(node.offsetHeight);

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      updateScaledHeight(entry.contentRect.height);
    });
    observer.observe(node);

    return () => observer.disconnect();
  }, [hasAnyContent, zoom]);

  const emptyStateCard = (
    <div className="preview-empty-state">
      <IconMessages size={32} className="preview-empty-state__icon" aria-hidden />
      <h2 className="preview-empty-state__title">Your message will appear here</h2>
      <p className="preview-empty-state__text">{messages.some(isComponentsV2) ? 'Add text or media to your layout blocks to see how your message looks in Discord.' : 'Write text, add an embed, or build with components to see how it looks in Discord.'}</p>
      {!canTryWelcomeExample && messages.length > 0 && <button type="button" className="preview-empty-state__example" onClick={() => jumpToEditor({ ...validationTarget(messages, sendBlocked ?? 'Message 1'), source: 'preview' })}>Open the editor</button>}
      {canTryWelcomeExample && (
        <button type="button" className="preview-empty-state__example" onClick={() => {
          const example = createWelcomeDraft().messages[0];
          updateMessage(0, message => ({ ...message, content: example.content, embeds: example.embeds }));
        }}>Try the welcome example</button>
      )}
    </div>
  );

  if (messages.length === 0 || !hasAnyContent) {
    return (
      <div id="previewPanel" className="preview-panel-inner preview-panel-inner--fill preview-panel-inner--centered">
        {emptyStateCard}
      </div>
    );
  }

  return (
    <div id="previewPanel" className="preview-panel-inner">
      {(anySuppressEmbeds || anySilent) && (
        <div
          style={{
            width: '100%',
            maxWidth: 1000,
            display: 'flex',
            gap: 8,
            marginBottom: 16,
            padding: '8px 12px',
            background: 'var(--bg-secondary)',
            borderRadius: 8,
            border: '1px solid var(--border)',
            fontSize: 12,
            color: 'var(--text-muted)',
          }}
        >
          {anySuppressEmbeds && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <IconEyeOff size={15} /> Embeds suppressed
            </span>
          )}
          {anySilent && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <IconBellOff size={14} /> Silent (no notification)
            </span>
          )}
        </div>
      )}

      <div
        className="live-preview-window discord-preview-root"
        style={{
          width: '100%',
          maxWidth: 1000,
          background: 'var(--bg-primary)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          overflow: 'hidden',
        }}
      >
          <div className="live-preview-header" style={{ flexWrap: 'wrap', gap: 10 }}>
            <div className="live-preview-header__left" style={{ flex: '1 1 auto', minWidth: 120 }}>
              <IconHash size={22} style={{ color: 'var(--text-muted)', flexShrink: 0 }} aria-hidden />
              <span className="live-preview-header__title">Live preview</span>
            </div>

            <div className="desktop-only live-preview-zoom" style={{ flexShrink: 0, order: 2 }}>
              {zoom !== 1 && (
                <button
                  type="button"
                  className="live-preview-zoom-reset"
                  onClick={handleZoomReset}
                  title="Reset zoom"
                >
                  Reset
                </button>
              )}
              <div className="live-preview-zoom-group" role="group" aria-label="Preview zoom controls">
                <button
                  type="button"
                  className="live-preview-zoom-step"
                  onClick={handleZoomOut}
                  onPointerDown={(e) => e.preventDefault()}
                  title="Zoom out"
                  aria-label="Zoom out"
                >
                  <IconMinus size={18} strokeWidth={2.25} />
                </button>
                <button
                  type="button"
                  className="live-preview-zoom-level"
                  onClick={handleZoomReset}
                  onPointerDown={(e) => e.preventDefault()}
                  title="Reset zoom"
                  aria-label="Reset zoom"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  type="button"
                  className="live-preview-zoom-step"
                  onClick={handleZoomIn}
                  onPointerDown={(e) => e.preventDefault()}
                  title="Zoom in"
                  aria-label="Zoom in"
                >
                  <IconPlus size={18} strokeWidth={2.25} />
                </button>
              </div>
            </div>

            <div className="mobile-only" style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, order: 1 }}>
            {previewReady ? (
              <span className="live-preview-badge live-preview-badge--ready" style={{ margin: 0 }}>Ready</span>
            ) : !validWebhook ? (
              <span className="live-preview-badge live-preview-badge--muted" style={{ margin: 0 }}>Set webhook</span>
            ) : (
              <span className="live-preview-badge live-preview-badge--warn" style={{ margin: 0 }} title={sendBlocked ?? undefined}>Draft incomplete</span>
            )}
          </div>
        </div>

        <div ref={scaledWrapperRef} style={{ padding: '20px 0' }}>
          <div
            ref={previewScaleRef}
            style={
              zoom === 1
                ? { width: '100%', margin: '0 auto', transition: 'transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)' }
                : {
                    width: `${100 / zoom}%`,
                    margin: '0 auto',
                    transform: `scale(${zoom})`,
                    transformOrigin: 'top center',
                    transition: 'transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
                  }
            }
          >
            {previewMessages.map(({ msg, idx, prevVisibleMsg, isFirstVisible }) => (
              <PreviewMessageBlock
                key={msg.id || idx}
                msg={msg}
                idx={idx}
                prevMsg={prevVisibleMsg}
                isFirstVisible={isFirstVisible}
                webhookInfo={webhookInfo}
                jumpToEditor={jumpToEditor}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
});

const PreviewMessageBlock = React.memo(function PreviewMessageBlock({
  msg,
  idx,
  prevMsg,
  isFirstVisible,
  webhookInfo,
  jumpToEditor,
}: {
  msg: Message,
  idx: number,
  prevMsg: Message | null,
  isFirstVisible: boolean,
  webhookInfo: any,
  jumpToEditor: (target: Omit<EditorFocusTarget, 'requestId'>) => void,
}) {
  const isSuppressEmbeds = (msg.flags & 4) !== 0;
  const isSilent = (msg.flags & 4096) !== 0;
  const username = msg.username || webhookInfo?.name || 'Webhook';
  const prevUsername = prevMsg ? (prevMsg.username || webhookInfo?.name || 'Webhook') : null;

  const rawAvatarUrl = msg.avatar_url;
  const avatarUrl =
    (isValidUrl(rawAvatarUrl) ? rawAvatarUrl : '') ||
    (webhookInfo?.avatar
      ? `https://cdn.discordapp.com/avatars/${webhookInfo.id}/${webhookInfo.avatar}.png?size=64`
      : 'https://cdn.discordapp.com/embed/avatars/0.png');
  const rawPrevAvatarUrl = prevMsg?.avatar_url;
  const prevAvatarUrl = prevMsg
    ? (isValidUrl(rawPrevAvatarUrl) ? rawPrevAvatarUrl : '') ||
      (webhookInfo?.avatar
        ? `https://cdn.discordapp.com/avatars/${webhookInfo.id}/${webhookInfo.avatar}.png?size=64`
        : 'https://cdn.discordapp.com/embed/avatars/0.png')
    : null;

  const isGrouped = prevMsg && username === prevUsername && avatarUrl === prevAvatarUrl;

  if (!messageHasPreviewContent(msg)) return null;

  return (
    <div
      className={`discord-message ${isGrouped ? 'grouped' : ''}`}
      style={{ marginTop: isGrouped ? 0 : isFirstVisible ? 0 : 16 }}
    >
      {!isGrouped && (
        <button
          type="button"
          className="discord-avatar preview-linkable"
          onClick={() => jumpToEditor({ messageIndex: idx, section: 'profile', source: 'preview' })}
          aria-label={`Jump to Message ${idx + 1} profile overrides`}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" />
          ) : (
            <img src="https://cdn.discordapp.com/embed/avatars/0.png" alt="" style={{ width: 24, height: 24, objectFit: 'contain', opacity: 0.5 }} />
          )}
        </button>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        {!isGrouped && (
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
            <button
              type="button"
              className="preview-linkable preview-linkable--inline"
              onClick={() => jumpToEditor({ messageIndex: idx, section: 'profile', source: 'preview' })}
              aria-label={`Jump to Message ${idx + 1} profile overrides`}
            >
              <span className="discord-username">{username}</span>
            </button>
            <span className="discord-bot-badge">APP</span>
            <span
              className="discord-timestamp"
              title={new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
            >
              Today at {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            {isSilent && <IconBellOff size={13} style={{ color: 'var(--text-muted)', marginLeft: 4 }} />}
            <span
              style={{
                fontFamily: 'var(--font-app-display)',
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--text-primary)',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border)',
                padding: '3px 8px',
                borderRadius: 6,
                marginLeft: 'auto',
              }}
            >
              Message {idx + 1}
            </span>
          </div>
        )}

        {isComponentsV2(msg) ? <ComponentsPreview blocks={msg.componentBlocks ?? []} attachments={msg._attachments} onJump={(componentId, inputLabel) => jumpToEditor({ messageIndex: idx, section: 'components', componentId, inputLabel, source: 'preview' })} /> : null}
        {!isComponentsV2(msg) && msg.content && (
          <div
            className="discord-message-content preview-linkable preview-linkable--block"
            style={{ marginTop: isGrouped ? 0 : 4 }}
            onClick={(event) => {
              if (isInteractivePreviewTarget(event.target) || isSelectingPreviewText()) return;
              jumpToEditor({ messageIndex: idx, section: 'content', source: 'preview' });
            }}
            dangerouslySetInnerHTML={{ __html: parseDiscordMarkdownForPreview(msg.content) }}
          />
        )}

        {!isComponentsV2(msg) && !isSuppressEmbeds &&
          msg.embeds.map((embed: Embed) => {
            const hasThumbnail = isValidUrl(embed.thumbnail.url);
            return (
              <EmbedPreview
                key={embed.id}
                embed={embed}
                messageIndex={idx}
                jumpToEditor={jumpToEditor}
              />
            );
          })}

        {!isComponentsV2(msg) && (msg._attachments || []).filter((a) => a.fieldKey.startsWith('content_file')).length > 0 && (
          <div
            className="preview-linkable preview-linkable--block"
            style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}
            onClick={(event) => {
              if (isInteractivePreviewTarget(event.target) || isSelectingPreviewText()) return;
              jumpToEditor({ messageIndex: idx, section: 'files', source: 'preview' });
            }}
          >
            {(msg._attachments || [])
              .filter((a) => a.fieldKey.startsWith('content_file'))
              .map((att) => {
                const fileName = att.file?.name || att.name || 'Attachment';
                const mime = att.file?.type || att.mimeType || '';
                const isImage = mime.startsWith('image/');
                const isVideo = mime.startsWith('video/');
                const isAudio = mime.startsWith('audio/');

                if (isImage) {
                  return (
                    <img
                      key={att.fieldKey}
                      src={att.previewUrl}
                      alt="Attachment"
                      style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 8 }}
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                    />
                  );
                }
                if (isVideo) {
                  return (
                    <video
                      key={att.fieldKey}
                      src={att.previewUrl}
                      controls
                      style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 8 }}
                    />
                  );
                }
                if (isAudio) {
                  return (
                    <div key={att.fieldKey} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                      background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)',
                      maxWidth: '100%',
                    }}>
                      <IconMusic size={20} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {fileName}
                        </div>
                        <audio src={att.previewUrl} controls style={{ width: '100%', height: 28, marginTop: 4 }} />
                      </div>
                    </div>
                  );
                }
                return <PreviewFileCard key={att.fieldKey} att={att} />;
              })}
          </div>
        )}

        {!isComponentsV2(msg) && <LinkButtonsPreview buttons={msg.linkButtons ?? []} />}
        {!isComponentsV2(msg) && isSuppressEmbeds && msg.embeds.length > 0 && (
          <div
            className="preview-linkable preview-linkable--block"
            style={{
              marginTop: 8,
              padding: '8px 12px',
              background: 'var(--bg-secondary)',
              borderRadius: 4,
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              color: 'var(--text-muted)',
            }}
            onClick={() => jumpToEditor({ messageIndex: idx, section: 'advanced', source: 'preview' })}
          >
            <IconEyeOff size={14} /> {msg.embeds.length} embed{msg.embeds.length > 1 ? 's' : ''} suppressed
          </div>
        )}

      </div>
    </div>
  );
}, (prev, next) => {
  return prev.msg === next.msg &&
         prev.idx === next.idx &&
         prev.isFirstVisible === next.isFirstVisible &&
         prev.webhookInfo === next.webhookInfo &&
         prev.prevMsg?.username === next.prevMsg?.username &&
         prev.prevMsg?.avatar_url === next.prevMsg?.avatar_url;
});

const EmbedPreview = React.memo(function EmbedPreview({
  embed,
  messageIndex,
  jumpToEditor,
}: {
  embed: Embed;
  messageIndex: number;
  jumpToEditor: (target: Omit<EditorFocusTarget, 'requestId'>) => void;
}) {
  const hasThumbnail = isValidUrl(embed.thumbnail.url);
  const hasImage = isValidUrl(embed.image.url);
  const imageDims = useImageDimensions(embed.image.url, embed.image.width, embed.image.height);

  const imageSize = React.useMemo(() => {
    if (!imageDims) return null;
    // Content area is narrower when thumbnail is present:
    // 400px embed - 4px border - 12px left pad - 16px right pad = 368px content max
    // With thumbnail: 368px - 80px thumb - 16px gap = 272px
    const containerWidth = hasThumbnail ? 272 : 368;
    return calculateDiscordImageSize(imageDims.width, imageDims.height, containerWidth);
  }, [imageDims, hasThumbnail]);

  return (
    <div
      className="discord-embed preview-linkable preview-linkable--block"
      style={{ borderLeftColor: intToHex(embed.color) }}
      onClick={(event) => {
        if (isInteractivePreviewTarget(event.target) || isSelectingPreviewText()) return;
        jumpToEditor({ messageIndex, section: 'embeds', embedId: embed.id, inputLabel: embed.title ? 'Embed title' : embed.description ? 'Embed description' : 'Embed title', source: 'preview' });
      }}
    >
      <div className="discord-embed-inner">
        <div className="discord-embed-content">
          {embed.author.name && (
            <div className="discord-embed-author">
              {isValidUrl(embed.author.icon_url) && (
                <img src={embed.author.icon_url} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
              )}
              {isValidUrl(embed.author.url) ? (
                <a
                  href={embed.author.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="md-link"
                  dangerouslySetInnerHTML={{ __html: parseDiscordEmbedAuthorForPreview(embed.author.name) }}
                />
              ) : (
                <span dangerouslySetInnerHTML={{ __html: parseDiscordEmbedAuthorForPreview(embed.author.name) }} />
              )}
            </div>
          )}
          {embed.title && (
            <div className="discord-embed-title">
              {isValidUrl(embed.url) ? (
                <a
                  href={embed.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  dangerouslySetInnerHTML={{ __html: parseDiscordEmbedTitleForPreview(embed.title) }}
                />
              ) : (
                <span dangerouslySetInnerHTML={{ __html: parseDiscordEmbedTitleForPreview(embed.title) }} />
              )}
            </div>
          )}
          {embed.description && (
            <div
              className="discord-embed-description"
              onClick={(event) => {
                event.stopPropagation();
                if (isInteractivePreviewTarget(event.target) || isSelectingPreviewText()) return;
                jumpToEditor({ messageIndex, section: 'embeds', embedId: embed.id, inputLabel: 'Embed description', source: 'preview' });
              }}
              dangerouslySetInnerHTML={{ __html: parseDiscordMarkdownForPreview(embed.description) }}
            />
          )}
          {embed.fields.length > 0 && (
            <div className="discord-embed-fields">
              {groupEmbedFieldsForPreview(embed.fields).map((row) =>
                row.kind === 'full' ? (
                  <FieldPreviewBlock
                    key={row.field.id}
                    field={row.field}
                    fullWidth
                    onClick={() =>
                      jumpToEditor({
                        messageIndex,
                        section: 'embeds',
                        embedId: embed.id,
                        fieldId: row.field.id,
                        source: 'preview',
                      })
                    }
                  />
                ) : (
                  <div
                    key={row.fields.map((f) => f.id).join('-')}
                    className="discord-embed-field-row"
                    style={{
                      display: 'grid',
                      gap: 8,
                      gridColumn: '1 / 13',
                      gridTemplateColumns: inlineEmbedFieldGridTemplateColumns(row.fields.length),
                    }}
                  >
                    {row.fields.map((f) => (
                      <FieldPreviewBlock
                        key={f.id}
                        field={f}
                        onClick={() =>
                          jumpToEditor({
                            messageIndex,
                            section: 'embeds',
                            embedId: embed.id,
                            fieldId: f.id,
                            source: 'preview',
                          })
                        }
                      />
                    ))}
                  </div>
                ),
              )}
            </div>
          )}
          {hasImage && (
            <div className="discord-embed-image">
              <img
                src={embed.image.url}
                alt=""
                width={imageSize?.width}
                height={imageSize?.height}
                onError={(e) => (e.currentTarget.style.display = 'none')}
              />
            </div>
          )}
          {(embed.footer.text || embed.timestamp) && (
            <div className="discord-embed-footer">
              {isValidUrl(embed.footer.icon_url) && (
                <img src={embed.footer.icon_url} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
              )}
              <span>
                {embed.footer.text ? (
                  <span dangerouslySetInnerHTML={{ __html: parseDiscordEmbedFooterForPreview(embed.footer.text) }} />
                ) : null}
                {embed.footer.text && embed.timestamp && ' • '}
                {embed.timestamp && formatDiscordTimestamp(embed.timestamp)}
              </span>
            </div>
          )}
        </div>
        {hasThumbnail && (
          <div className="discord-embed-thumbnail-wrap">
            <img
              className="discord-embed-thumbnail"
              src={embed.thumbnail.url}
              alt=""
              onError={(e) => (e.currentTarget.style.display = 'none')}
            />
          </div>
        )}
      </div>
    </div>
  );
});

function PreviewFileCard({
  att,
}: {
  att: { file?: File; previewUrl: string; fieldKey: string; name?: string; size?: number; mimeType?: string };
}) {
  const fileName = att.file?.name || att.name || 'Attachment';
  const mime = att.file?.type || att.mimeType || '';
  const fileSize = att.file?.size ?? att.size;

  if (mime.startsWith('image/')) {
    return (
      <img
        src={att.previewUrl}
        alt="Attachment"
        style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 8 }}
        onError={(e) => (e.currentTarget.style.display = 'none')}
      />
    );
  }
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  let FileIcon = IconPaperclip;
  let iconColor = 'var(--text-muted)';
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext) || mime.includes('zip') || mime.includes('rar')) {
    FileIcon = IconFileArchive; iconColor = 'var(--warning)';
  } else if (['pdf', 'doc', 'docx', 'txt', 'rtf', 'csv', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) {
    FileIcon = IconFileText; iconColor = 'var(--info)';
  } else if (['js', 'ts', 'jsx', 'tsx', 'json', 'xml', 'html', 'css', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'md', 'yaml', 'yml', 'sh'].includes(ext)) {
    FileIcon = IconFileCode; iconColor = 'var(--success)';
  } else if (mime.startsWith('video/')) {
    FileIcon = IconFilm; iconColor = 'var(--accent)';
  }
  const sizeStr = typeof fileSize === 'number'
    ? fileSize >= 1024 * 1024
      ? `${(fileSize / (1024 * 1024)).toFixed(1)} MB`
      : `${(fileSize / 1024).toFixed(0)} KB`
    : 'Unknown size';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
      background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)',
      maxWidth: 320,
    }}>
      <FileIcon size={28} style={{ color: iconColor, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {fileName}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{sizeStr}</div>
      </div>
      <IconDownload size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
    </div>
  );
}

function FieldPreviewBlock({
  field,
  fullWidth,
  onClick,
}: {
  field: Field;
  fullWidth?: boolean;
  onClick?: () => void;
}) {
  if (!field.name && !field.value) return null;
  return (
    <div
      className="discord-embed-field preview-linkable"
      style={fullWidth ? { gridColumn: '1 / 13' } : { gridColumn: 'auto' }}
      onClick={(event) => {
        event.stopPropagation();
        if (isInteractivePreviewTarget(event.target) || isSelectingPreviewText()) return;
        onClick?.();
      }}
    >
      <div
        className="discord-field-name"
        dangerouslySetInnerHTML={{ __html: parseDiscordEmbedFieldNameForPreview(field.name || '\u200B') }}
      />
      <div
        className="discord-field-value"
        dangerouslySetInnerHTML={{ __html: parseDiscordEmbedFieldForPreview(field.value || '\u200B') }}
      />
    </div>
  );
}


export function TemplateMessagePreview({ messages }: { messages: Message[] }) {
  return <div className="template-message-preview discord-preview-root">
    {messages.map((message, index) => <article key={message.id}>
      <strong>{message.username || 'Webhook'}</strong>
      {!isComponentsV2(message) && message.content && <div className="discord-message-content" dangerouslySetInnerHTML={{ __html: parseDiscordMarkdownForPreview(message.content) }} />}
      {!isComponentsV2(message) && message.embeds.map(embed => <EmbedPreview key={embed.id} embed={embed} messageIndex={index} jumpToEditor={() => {}} />)}
      {isComponentsV2(message) ? <ComponentsPreview blocks={message.componentBlocks ?? []} attachments={message._attachments} /> : <LinkButtonsPreview buttons={message.linkButtons ?? []} />}
    </article>)}
  </div>;
}
