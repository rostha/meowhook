'use client';

import { Reorder, motion } from 'framer-motion';
import { useAppStore } from '@/stores/useAppStore';
import { memo, useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { createDefaultEmbed, intToHex, isValidWebhookUrl, parseMessageIdOrLink, parseDiscordPayloadToMessage, uid } from '@/lib/utils';
import { fetchWebhookInfo, editMessage, deleteMessage, loadMessage } from '@/lib/webhook';
import { buildPayload, getSendBlockingReason } from '@/lib/payload';
import {
  calculateAttachmentUsage,
  DISCORD_ATTACHMENT_LIMIT,
  getAttachmentUsageSummary,
} from '@/lib/attachmentTracker';
import {
  getAdvancedSummary,
  getContentSummary,
  getEmbedsSummary,
  getFilesSummary,
  getProfileSummary,
} from '@/lib/editorUi';
import {
  buildEmbedAttachmentFieldKey,
  getEmbedMoveBlockingReason,
  moveEmbedBetweenMessages,
  pruneUnusedMessageAttachments,
  setEmbedAttachmentUrl,
} from '@/lib/embedTransfers';
import { loadSavedWebhooks, saveSavedWebhooks } from '@/lib/storage';
import EmbedEditor, { type EmbedWithDragControls } from './EmbedEditor';
import ActionBar from './ActionBar';
import type { Message, Embed, SavedWebhook } from '@/lib/types';
import {
  IconPlus,
  IconChevronDown,
  IconChevronUp,
  IconChevronRight,
  IconLink,
  IconLoader,
  IconAlert,
  IconInfo,
  IconPencil,
  IconTrash,
  IconCheck,
  IconX,
  IconDownload,
  IconCopy,
  IconEye,
  IconEyeOff,
  IconImage,
  IconMessage,
  IconUser,
  IconSliders,
  IconLayers,
  IconStack,
  IconBookmark,
  IconUpload,
  IconPaperclip,
  IconFilm,
  IconMusic,
  IconFileArchive,
  IconFileCode,
  IconFileText,
} from '@/components/MeowIcons';
import ImageUploadButton from './ImageUploadButton';
import TextFieldWithQuickActions from '@/components/TextFieldWithQuickActions';
import { BrandDiscord, BrandX, BrandFacebook, IconLinkChain } from './BrandIcons';
import React from 'react';
import ConfirmDialog from './ConfirmDialog';
import { getBrandAssets } from '@/lib/brandAssets';

import MessageEditor from './editor/MessageEditor';
import AttachmentUploader from './editor/AttachmentUploader';
import FileTypeIcon from './editor/FileTypeIcon';
import EmbedReorderItem from './editor/EmbedReorderItem';
import { AnimatedEditorList, AnimatedEditorRow } from './AnimatedEditorList';
import { MessageSectionSwap, syncAvatarPreviewAttachment } from './editor/helpers';
import type { CrossMessageEmbedDrag, DragPoint } from './editor/helpers';

/** Framer drag controls must not be written into tab state (localStorage / JSON). */
function embedForStorage(e: EmbedWithDragControls): Embed {
  const { _dragControls: _, ...rest } = e;
  return rest;
}

export default memo(function EditorPanel() {
  const theme = useAppStore((s) => s.settings.theme);
  const brand = getBrandAssets(theme);
  const tabs = useAppStore((s) => s.tabs);
  const activeTabIndex = useAppStore((s) => s.activeTabIndex);
  const activeMessageIndex = useAppStore((s) => s.activeMessageIndex);
  const addMessage = useAppStore((s) => s.addMessage);
  const duplicateMessage = useAppStore((s) => s.duplicateMessage);
  const setWebhookUrl = useAppStore((s) => s.setWebhookUrl);
  const updateActiveTab = useAppStore((s) => s.updateActiveTab);
  const requestEditorFocus = useAppStore((s) => s.requestEditorFocus);
  const webhookInfo = useAppStore((s) => s.webhookInfo);
  const setWebhookInfo = useAppStore((s) => s.setWebhookInfo);
  const showToast = useAppStore((s) => s.showToast);
  const rateLimit = useAppStore((s) => s.rateLimit);
  const isRateLimited = rateLimit.isRateLimited;

  const activeTab = tabs[activeTabIndex];
  const messages = activeTab?.messages || [];
  const webhookUrl = activeTab?.webhookUrl || '';

  const [fetchingInfo, setFetchingInfo] = useState(false);
  const [savedWebhooks, setSavedWebhooks] = useState<SavedWebhook[]>([]);
  const [showWebhooks, setShowWebhooks] = useState(false);
  const [webhookAuthError, setWebhookAuthError] = useState(false);
  const [verifiedWebhookUrl, setVerifiedWebhookUrl] = useState('');
  const [showUrl, setShowUrl] = useState(false);
  const [editingWebhookIndex, setEditingWebhookIndex] = useState<number | null>(null);
  const [editWebhookName, setEditWebhookName] = useState('');
  const [crossMessageEmbedDrag, setCrossMessageEmbedDrag] = useState<CrossMessageEmbedDrag | null>(null);
  const [crossMessageEmbedDropTargetIndex, setCrossMessageEmbedDropTargetIndex] = useState<number | null>(null);
  const [sourceEmbedCompactReady, setSourceEmbedCompactReady] = useState(false);
  const [messageBulkUi, setMessageBulkUi] = useState<{
    seq: number;
    state: 'compact' | 'expand';
  }>({ seq: 0, state: 'expand' });
  const abortControllerRef = useRef<AbortController | null>(null);

  const valid = isValidWebhookUrl(webhookUrl);
  const urlBad = webhookUrl.length > 0 && !valid;
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const savedPopoverAnchorRef = useRef<HTMLDivElement>(null);
  const [savedPopoverLayout, setSavedPopoverLayout] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  useEffect(() => { setSavedWebhooks(loadSavedWebhooks()); }, []);

  useLayoutEffect(() => {
    if (!showWebhooks) {
      setSavedPopoverLayout(null);
      return;
    }
    const anchor = savedPopoverAnchorRef.current;
    const scrollEl = scrollContainerRef.current;
    if (!anchor) return;

    const update = () => {
      const rect = anchor.getBoundingClientRect();
      const scrollRect = scrollEl?.getBoundingClientRect();
      const margin = 10;
      const editorLeft = (scrollRect?.left ?? margin) + margin;
      const editorRight = (scrollRect?.right ?? window.innerWidth) - margin;
      const width = Math.min(320, Math.max(200, editorRight - editorLeft));
      let left = rect.right - width;
      left = Math.max(editorLeft, left);
      left = Math.max(rect.left, left);
      left = Math.min(left, editorRight - width);
      left = Math.min(left, window.innerWidth - width - margin);
      const top = rect.bottom + 6;
      const maxHeight = Math.max(120, window.innerHeight - top - margin);
      setSavedPopoverLayout({ top, left, width, maxHeight });
    };

    update();
    window.addEventListener('resize', update);
    scrollEl?.addEventListener('scroll', update, { passive: true });
    return () => {
      window.removeEventListener('resize', update);
      scrollEl?.removeEventListener('scroll', update);
    };
  }, [showWebhooks]);

  useEffect(() => {
    if (!showWebhooks) return;
    const onDown = (e: MouseEvent) => {
      const node = e.target as Node;
      if (savedPopoverAnchorRef.current?.contains(node)) return;
      if ((e.target as HTMLElement | null)?.closest?.('[data-webhook-saved-popover]')) return;
      setShowWebhooks(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showWebhooks]);

  useEffect(() => {
    const handleEditorShortcuts = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        event.defaultPrevented ||
        !(target instanceof HTMLElement) ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target.isContentEditable ||
        !event.altKey ||
        !event.shiftKey ||
        event.metaKey ||
        event.ctrlKey
      ) {
        return;
      }

      const safeIndex = Math.max(0, Math.min(activeMessageIndex, Math.max(0, messages.length - 1)));
      const activeMessage = messages[safeIndex];
      const key = event.key.toLowerCase();

      if (key === 'n') {
        event.preventDefault();
        if (messages.length >= 10) return;
        const nextIndex = messages.length;
        addMessage();
        requestAnimationFrame(() => {
          requestEditorFocus({ messageIndex: nextIndex, section: 'content', source: 'shortcut' });
        });
      }

      if (!activeMessage) {
        return;
      }

      if (key === 'e') {
        event.preventDefault();
        const nextEmbed = createDefaultEmbed();
        updateActiveTab((tab) => ({
          ...tab,
          messages: tab.messages.map((message, index) =>
            index === safeIndex
              ? pruneUnusedMessageAttachments({ ...message, embeds: [...message.embeds, nextEmbed] })
              : message,
          ),
        }));
        requestAnimationFrame(() => {
          requestEditorFocus({
            messageIndex: safeIndex,
            section: 'embeds',
            embedId: nextEmbed.id,
            source: 'shortcut',
          });
        });
      }

      if (key === 'd') {
        event.preventDefault();
        if (messages.length >= 10) return;
        duplicateMessage(safeIndex);
        requestAnimationFrame(() => {
          requestEditorFocus({ messageIndex: safeIndex + 1, section: 'content', source: 'shortcut' });
        });
      }

      if (key === 'c') {
        event.preventDefault();
        requestEditorFocus({ messageIndex: safeIndex, section: 'content', source: 'shortcut' });
      }
    };

    window.addEventListener('keydown', handleEditorShortcuts);
    return () => window.removeEventListener('keydown', handleEditorShortcuts);
  }, [activeMessageIndex, addMessage, duplicateMessage, isRateLimited, messages, requestEditorFocus, updateActiveTab]);

  const moveEmbedToMessage = useCallback((sourceMessageIndex: number, targetMessageIndex: number, embedId: string) => {
    const result = moveEmbedBetweenMessages(messages, sourceMessageIndex, targetMessageIndex, embedId);
    if (result.error) {
      showToast(result.error, 'error');
      return false;
    }

    updateActiveTab((tab) => ({
      ...tab,
      messages: result.messages,
    }));
    showToast(`Embed moved to Message ${targetMessageIndex + 1}`, 'success');
    return true;
  }, [messages, showToast, updateActiveTab]);

  const updateCrossMessageEmbedDropTarget = useCallback((point: DragPoint, sourceMessageIndex: number) => {
    if (typeof document === 'undefined') return;

    const dropZones = Array.from(document.querySelectorAll<HTMLElement>('[data-embed-drop-zone]'));
    let nextTarget: number | null = null;

    for (const zone of dropZones) {
      const bounds = zone.getBoundingClientRect();
      if (
        point.x >= bounds.left &&
        point.x <= bounds.right &&
        point.y >= bounds.top &&
        point.y <= bounds.bottom
      ) {
        const parsedIndex = Number(zone.dataset.embedDropZone);
        if (Number.isInteger(parsedIndex) && parsedIndex !== sourceMessageIndex) {
          nextTarget = parsedIndex;
        }
        break;
      }
    }

    setCrossMessageEmbedDropTargetIndex(nextTarget);
    setSourceEmbedCompactReady(nextTarget !== null);
  }, []);

  const fetchInfo = useCallback(async (url: string) => {
    if (!url) {
      setWebhookInfo(null);
      setVerifiedWebhookUrl('');
      setWebhookAuthError(false);
      return;
    }
    if (!isValidWebhookUrl(url)) {
      setWebhookInfo(null);
      setVerifiedWebhookUrl('');
      setWebhookAuthError(false);
      return;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    setFetchingInfo(true);
    setWebhookAuthError(false);
    try {
      const info = await fetchWebhookInfo(url, abortControllerRef.current.signal);
      setWebhookInfo(info);
      setVerifiedWebhookUrl(url);
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return;
      setWebhookInfo(null);
      setVerifiedWebhookUrl('');
      setWebhookAuthError(true);
    } finally {
      setFetchingInfo(false);
    }
  }, [setWebhookInfo]);

  useEffect(() => {
    if (webhookUrl !== verifiedWebhookUrl) {
      setWebhookInfo(null);
      setWebhookAuthError(false);
    }
    const timer = setTimeout(() => fetchInfo(webhookUrl), 800);
    return () => {
      clearTimeout(timer);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [webhookUrl, fetchInfo, setWebhookInfo, verifiedWebhookUrl]);

  const saveCurrentWebhook = () => {
    if (!valid) return showToast('Enter a valid webhook URL first', 'error');
    const name = verifiedWebhookUrl === webhookUrl ? webhookInfo?.name || 'Webhook' : 'Webhook';
    const updated = [...savedWebhooks, { name, url: webhookUrl }];
    if (!saveSavedWebhooks(updated)) { showToast('Could not save webhook changes in this browser.', 'error'); return; }
    setSavedWebhooks(updated);
    showToast(`Webhook "${name}" saved in this browser.`, 'success');
  };

  if (!activeTab) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, height: '100%', overflow: 'hidden' }}>
      <motion.div
        ref={scrollContainerRef}
        className="editor-scroll-surface editor-scroll-surface--stack editor-scroll-surface--editor-pane"
        layoutScroll
        style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}
      >

        <div className="delivery-hub card webhook-card-accent">
          <div className="delivery-hub__head">
            <div className="delivery-hub__copy">
              <div className="delivery-hub__title-row">
                <IconLink className="delivery-hub__icon" size={17} strokeWidth={2} aria-hidden />
                <span className="delivery-hub__title">Webhook URL</span>
              </div>
            </div>

            <div className="delivery-hub__toolbar">
              {messages.length > 0 && (
                <button
                  type="button"
                  className="section-header__action-button webhook-panel__inline-compact desktop-only"
                  onClick={() =>
                    setMessageBulkUi(({ seq, state }) => {
                      const nextState = state === 'compact' ? 'expand' : 'compact';
                      return { seq: seq + 1, state: nextState };
                    })
                  }
                  title="Compact or expand all message sections"
                >
                  {messageBulkUi.state === 'compact' ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
                </button>
              )}
            </div>
          </div>

            <div className="webhook-input-shell">
              <div className="webhook-input-wrap" ref={savedPopoverAnchorRef} style={{ '--webhook-actions-width': `${(Number(!!webhookUrl) + Number(valid) + Number(savedWebhooks.length > 0)) * 36}px` } as React.CSSProperties}>
                <input
                  type={showUrl ? 'text' : 'password'}
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="Paste your Discord webhook URL here"
                  className={`webhook-url-input ${urlBad ? 'webhook-url-input--bad' : ''} ${webhookUrl && !showUrl ? 'webhook-url-input--concealed' : ''}`}
                  aria-invalid={urlBad}
                  aria-label="Discord webhook URL"
                  autoComplete="off"
                  spellCheck={false}
                />
                {webhookUrl && !showUrl && <span className="webhook-url-mask" aria-hidden><span>••••••••••••</span><span>Hidden</span></span>}
                <div className="webhook-input-actions">
                  {webhookUrl && (
                    <button
                      type="button"
                      className="webhook-input-action"
                      onClick={() => setShowUrl((s) => !s)}
                      title={showUrl ? 'Hide URL' : 'Show URL'}
                      aria-label={showUrl ? 'Hide webhook URL' : 'Show webhook URL'}
                    >
                      {showUrl ? <IconEyeOff size={15} /> : <IconEye size={15} />}
                    </button>
                  )}
                  {valid && (
                    <button
                      type="button"
                      className="webhook-input-action"
                      onClick={saveCurrentWebhook}
                      title="Save webhook in this browser"
                      aria-label="Save webhook in this browser"
                    >
                      <IconBookmark size={15} />
                    </button>
                  )}
                  {savedWebhooks.length > 0 && (
                    <button
                      type="button"
                      className="webhook-input-action"
                      onClick={() => setShowWebhooks((s) => !s)}
                      title="Saved webhooks"
                      aria-label="Saved webhooks"
                      aria-expanded={showWebhooks}
                    >
                      <IconCheck size={15} />
                      <span className="webhook-saved-count">{savedWebhooks.length}</span>
                    </button>
                  )}
                </div>
              </div>

              <div className={`webhook-connection ${webhookAuthError || urlBad ? 'is-error' : ''}`} role={webhookAuthError || urlBad ? 'alert' : 'status'}>
                {fetchingInfo || (!webhookInfo && valid && !webhookAuthError) ? <><IconLoader size={14} aria-hidden /><span>Checking webhook…</span></>
                  : webhookAuthError ? <><IconAlert size={14} aria-hidden /><span>Could not verify webhook — double-check the URL</span></>
                  : urlBad ? <><IconAlert size={14} aria-hidden /><span>Use a valid Discord webhook URL</span></>
                  : webhookInfo ? <><IconCheck className="webhook-connection__check" size={14} aria-hidden /><strong title={webhookInfo.name}>{webhookInfo.name}</strong><span className="webhook-connection__ready">Connected</span></>
                  : <><IconInfo size={14} aria-hidden /><span>Paste a webhook URL to enable sending</span></>}
              </div>
            </div>

        </div>

        <div className="editor-message-stack" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 0 }}>
          {messages.length === 0 && (
            <div className="editor-empty-state" style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)', fontSize: 13 }}>
              <IconMessage size={28} aria-hidden />
              <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>This draft is empty</span>
              <span style={{ display: 'block', marginTop: 4, fontSize: 12 }}>Add a message to get started.</span>
            </div>
          )}
          <AnimatedEditorList gap={12}>{messages.map((msg, i) => (
            <AnimatedEditorRow key={msg.id}>
            <MessageEditor
              key={msg.id}
              msg={msg}
              index={i}
              messages={crossMessageEmbedDrag ? messages : null}
              webhookUrl={webhookUrl}
              validUrl={valid}
              totalMessages={messages.length}
              isRateLimited={isRateLimited}
              messageBulkSeq={messageBulkUi.seq}
              messageBulkState={messageBulkUi.state}
              crossMessageEmbedDrag={crossMessageEmbedDrag}
              crossMessageEmbedDropTargetIndex={crossMessageEmbedDropTargetIndex}
              sourceEmbedCompactReady={sourceEmbedCompactReady}
              setCrossMessageEmbedDrag={setCrossMessageEmbedDrag}
              setSourceEmbedCompactReady={setSourceEmbedCompactReady}
              setCrossMessageEmbedDropTargetIndex={setCrossMessageEmbedDropTargetIndex}
              updateCrossMessageEmbedDropTarget={updateCrossMessageEmbedDropTarget}
              moveEmbedToMessage={moveEmbedToMessage}
            />
            </AnimatedEditorRow>
          ))}</AnimatedEditorList>
        </div>

        {messages.length < 10 && (
          <motion.button
            type="button"
            className="btn btn-secondary add-message-btn"
            onClick={() => {
              const nextIndex = messages.length;
              addMessage();
              requestAnimationFrame(() => {
                requestEditorFocus({ messageIndex: nextIndex, section: 'content', source: 'editor' });
              });
            }}
            style={{ margin: '0 0 12px' }}
          >
            <IconPlus size={16} strokeWidth={2} aria-hidden />
            {messages.length === 0 ? 'Add your first message' : 'Add Message'}
          </motion.button>
        )}

      </motion.div>
      <div className="editor-dock desktop-only"><ActionBar /></div>

      {showWebhooks && savedPopoverLayout &&
        createPortal(
          <div
            data-webhook-saved-popover
            className="saved-webhooks-popover"
            style={{
              position: 'fixed',
              top: savedPopoverLayout.top,
              left: savedPopoverLayout.left,
              width: savedPopoverLayout.width,
              maxHeight: savedPopoverLayout.maxHeight,
              zIndex: 400,
            }}
          >
            <div className="saved-webhooks-popover__header">
              <span className="saved-webhooks-popover__title">Saved Webhooks</span>
              <button
                type="button"
                className="saved-webhooks-popover__close"
                onClick={() => setShowWebhooks(false)}
                aria-label="Close saved webhooks"
              >
                <IconX size={14} />
              </button>
            </div>
            <div className="saved-webhooks-popover__list">
              {savedWebhooks.map((wh, i) => (
                <div
                  key={i}
                  className="saved-webhooks-popover__item"
                  onClick={() => {
                    setWebhookUrl(wh.url);
                    setShowWebhooks(false);
                  }}
                >
                  <div className="saved-webhooks-popover__item-info">
                    <div className="saved-webhooks-popover__item-name">
                      {editingWebhookIndex === i ? (
                        <input
                          value={editWebhookName}
                          onChange={(e) => setEditWebhookName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const updated = [...savedWebhooks];
                              updated[i] = { ...updated[i], name: editWebhookName };
                              if (!saveSavedWebhooks(updated)) { showToast('Could not save webhook changes in this browser.', 'error'); return; }
                              setSavedWebhooks(updated);
                              setEditingWebhookIndex(null);
                            }
                            if (e.key === 'Escape') {
                              setEditingWebhookIndex(null);
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          autoFocus
                        />
                      ) : (
                        wh.name
                      )}
                    </div>
                    <div className="saved-webhooks-popover__item-url">{wh.url}</div>
                  </div>
                  <div className="saved-webhooks-popover__item-actions">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingWebhookIndex(i);
                        setEditWebhookName(wh.name);
                      }}
                      title="Rename"
                    >
                      <IconPencil size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const updated = savedWebhooks.filter((_, idx) => idx !== i);
                        if (!saveSavedWebhooks(updated)) { showToast('Could not save webhook changes in this browser.', 'error'); return; }
                        setSavedWebhooks(updated);
                      }}
                      title="Remove"
                    >
                      <IconTrash size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
});
