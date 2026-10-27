'use client';
import AvatarImageControl from './AvatarImageControl';
import { useUiMotion } from '@/lib/useUiMotion';

import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { Reorder, AnimatePresence, motion } from 'framer-motion';
import { useAppStore } from '@/stores/useAppStore';
import {
  createDefaultEmbed,
  intToHex,
  isValidWebhookUrl,
  parseMessageIdOrLink,
  parseDiscordPayloadToMessage,
  uid,
} from '@/lib/utils';
import { fetchWebhookInfo, editMessage, deleteMessage, loadMessage } from '@/lib/webhook';
import { buildPayload, getSendBlockingReason } from '@/lib/payload';
import { buildEditPatch, editBaseline, hasEmbeddedDiscordUpload, retainedAttachmentIdsForEdit } from '@/lib/editPayload';
import { activeMessageAttachments } from '@/lib/componentAttachments';
import { discordMessageAttachments } from '@/lib/discordAttachments';
import { isComponentsV2, COMPONENTS_V2_FLAG, retainV2ModeWhenLoading } from '@/lib/messageComponents';
import { hasUnsupportedDiscordComponents } from '@/lib/messageComponents';
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
  pruneUnusedMessageAttachments,
  getEmbedMoveBlockingReason,
  moveEmbedBetweenMessages,
} from '@/lib/embedTransfers';
import EmbedEditor from '@/components/EmbedEditor';
import TextFieldWithQuickActions from '@/components/TextFieldWithQuickActions';
import LimitCounter from '@/components/LimitCounter';
import { embedTextLength } from '@/lib/editorLimits';
import ConfirmDialog from '@/components/ConfirmDialog';
import type { Message, Embed } from '@/lib/types';
import {
  IconPlus,
  IconChevronDown,
  IconChevronUp,
  IconChevronRight,
  IconPencil,
  IconTrash,
  IconCheck,
  IconAlert,
  IconLoader,
  IconCopy,
  IconDownload,
  IconUser,
  IconMessage,
  IconSliders,
  IconLayers,
  IconStack,
  IconPaperclip,
} from '@/components/MeowIcons';

import AttachmentUploader from './AttachmentUploader';
import MessageComponentsEditor, { MessageV2Toggle } from './MessageComponentsEditor';
import EmbedReorderItem from './EmbedReorderItem';
import { AnimatedEditorList, AnimatedEditorRow } from '@/components/AnimatedEditorList';
import { MessageSectionSwap, syncAvatarPreviewAttachment } from './helpers';
import type { CrossMessageEmbedDrag, DragPoint } from './helpers';
import { IconX } from '@/components/MeowIcons';

const MessageEditor = React.memo(function MessageEditor({
  msg,
  index,
  messages,
  webhookUrl,
  validUrl,
  totalMessages,
  isRateLimited,
  messageBulkSeq,
  messageBulkState,
  crossMessageEmbedDrag,
  crossMessageEmbedDropTargetIndex,
  sourceEmbedCompactReady,
  setCrossMessageEmbedDrag,
  setSourceEmbedCompactReady,
  setCrossMessageEmbedDropTargetIndex,
  updateCrossMessageEmbedDropTarget,
  moveEmbedToMessage,
}: {
  msg: Message;
  index: number;
  messages: Message[] | null;
  webhookUrl: string;
  validUrl: boolean;
  totalMessages: number;
  isRateLimited?: boolean;
  messageBulkSeq: number;
  messageBulkState: 'compact' | 'expand';
  crossMessageEmbedDrag: CrossMessageEmbedDrag | null;
  crossMessageEmbedDropTargetIndex: number | null;
  sourceEmbedCompactReady: boolean;
  setCrossMessageEmbedDrag: (drag: CrossMessageEmbedDrag | null) => void;
  setSourceEmbedCompactReady: (ready: boolean) => void;
  setCrossMessageEmbedDropTargetIndex: (index: number | null) => void;
  updateCrossMessageEmbedDropTarget: (point: DragPoint, sourceMessageIndex: number) => void;
  moveEmbedToMessage: (sourceMessageIndex: number, targetMessageIndex: number, embedId: string) => boolean;
}) {
  const uiMotion = useUiMotion();
  const updateMessage = useAppStore((s) => s.updateMessage);
  const duplicateMessage = useAppStore((s) => s.duplicateMessage);
  const removeMessage = useAppStore((s) => s.removeMessage);
  const setActiveMessageIndex = useAppStore((s) => s.setActiveMessageIndex);
  const editorFocusTarget = useAppStore((s) => s.editorFocusTarget);
  const requestEditorFocus = useAppStore((s) => s.requestEditorFocus);
  const showToast = useAppStore((s) => s.showToast);
  const showDiscordErrorModal = useAppStore((s) => s.showDiscordErrorModal);
  const sending = useAppStore((s) => s.sending);
  const setSending = useAppStore((s) => s.setSending);

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() =>
    messageBulkState === 'compact'
      ? { profile: false, content: false, files: false, embeds: false, advanced: false }
      : { profile: false, content: true, files: false, embeds: true, advanced: false }
  );
  const [collapsedEmbeds, setCollapsedEmbeds] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(msg.embeds.map((embed) => [embed.id, messageBulkState === 'compact']))
  );
  const lastMessageBulkSeq = useRef(0);
  const messageBulkInitialized = useRef(false);
  const mobileEditorDefaultsAppliedRef = useRef(false);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.matchMedia('(max-width: 768px)').matches) return;
    if (mobileEditorDefaultsAppliedRef.current) return;
    if (messageBulkState === 'compact') return;
    mobileEditorDefaultsAppliedRef.current = true;
    setOpenSections({
      profile: false,
      content: true,
      files: false,
      embeds: false,
      advanced: false,
    });
    setCollapsedEmbeds(Object.fromEntries(msg.embeds.map((embed) => [embed.id, true])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageBulkState]);

  const [messageId, setMessageId] = useState('');
  const [messageIdValid, setMessageIdValid] = useState<boolean | null>(null);
  const [checkingId, setCheckingId] = useState(false);
  const [validationReason, setValidationReason] = useState('');
  const cardRef = useRef<HTMLDivElement>(null);
  const profileSectionRef = useRef<HTMLDivElement>(null);
  const contentSectionRef = useRef<HTMLDivElement>(null);
  const filesSectionRef = useRef<HTMLDivElement>(null);
  const embedsSectionRef = useRef<HTMLDivElement>(null);
  const componentsSectionRef = useRef<HTMLDivElement>(null);
  const advancedSectionRef = useRef<HTMLDivElement>(null);

  const toggle = (key: string) => setOpenSections((p) => ({ ...p, [key]: !p[key] }));
  const setEmbedCollapsed = useCallback((embedId: string, collapsed: boolean) => {
    setCollapsedEmbeds((current) => {
      if (current[embedId] === collapsed) {
        return current;
      }
      return { ...current, [embedId]: collapsed };
    });
  }, []);
  const parsedId = parseMessageIdOrLink(messageId);

  useEffect(() => {
    if (!parsedId || !validUrl) { setMessageIdValid(null); setValidationReason(''); return; }
    let cancelled = false;
    setCheckingId(true);
    const timer = setTimeout(async () => {
      try {
        const result = await loadMessage(webhookUrl, parsedId);
        if (cancelled) return;
        setMessageIdValid(result.valid);
        setValidationReason(result.valid ? '' : (result.reason || 'Message not editable'));
      } catch {
        if (cancelled) return;
        setMessageIdValid(false);
        setValidationReason('Could not verify message');
      } finally {
        if (!cancelled) setCheckingId(false);
      }
    }, 600);
    return () => { cancelled = true; clearTimeout(timer); setCheckingId(false); };
  }, [parsedId, validUrl, webhookUrl]);

  const handleEdit = async () => {
    if (sending) return;
    if (!validUrl || !parsedId) return showToast('Need webhook URL and message ID', 'error');
    const sanitizedMessage = pruneUnusedMessageAttachments(msg);
    const sendBlock = getSendBlockingReason([sanitizedMessage], [calculateAttachmentUsage(sanitizedMessage).total]);
    if (sendBlock) return showToast(sendBlock, 'error');
    setSending(true);
    try {
      const currentMessage = await loadMessage(webhookUrl, parsedId);
      if (!currentMessage.valid || !currentMessage.data) return showToast(currentMessage.reason || 'Could not check the sent message.', 'error');
      const currentIsV2 = (Number(currentMessage.data.flags) & COMPONENTS_V2_FLAG) !== 0;
      const convertingToV2 = !currentIsV2 && isComponentsV2(sanitizedMessage);
      if (currentIsV2 && !isComponentsV2(sanitizedMessage)) return showToast('Discord cannot switch a sent V2 message back to the regular format. Send it as a new message instead.', 'error');
      if (convertingToV2 && ((Array.isArray(currentMessage.data.attachments) && currentMessage.data.attachments.length > 0) || hasEmbeddedDiscordUpload(currentMessage.data))) {
        return showToast('This message has uploaded files. Discord cannot keep them when converting to V2; use hosted image URLs or send a new message instead.', 'error');
      }
      if (hasUnsupportedDiscordComponents(currentMessage.data.components)) return showToast('This message has components that need a Discord app and cannot be edited here.', 'error');

      const previousPayload = editBaseline(sanitizedMessage, parsedId, buildPayload(parseDiscordPayloadToMessage(currentMessage.data)));
      const editPayload = buildEditPatch(previousPayload, buildPayload(sanitizedMessage));
      const currentAttachments = discordMessageAttachments(currentMessage.data);
      const currentAttachmentIds = currentAttachments.map(attachment => attachment.id);
      const retained = retainedAttachmentIdsForEdit(sanitizedMessage, parsedId, currentAttachmentIds);
      if (retained?.conflict) return showToast('This message’s files changed in Discord. Load it again before removing files.', 'error');
      if (retained && hasEmbeddedDiscordUpload(currentMessage.data)) return showToast('This message has an uploaded embed image. Removing files here could remove that image too; manage the files in Discord instead.', 'error');
      if (retained) editPayload.attachments = retained.ids.map((id) => ({ id }));
      const sameSentMessage = sanitizedMessage.loadedFromMessageId === parsedId;
      const editAttachments = activeMessageAttachments(sanitizedMessage).filter((attachment) => !(sameSentMessage && attachment.discordId));
      if (sameSentMessage && editAttachments.some((attachment) => sanitizedMessage.sentBlobUrls?.includes(attachment.previewUrl))) {
        return showToast('A previously sent upload could not be matched to this message. Load the sent message before editing to avoid sending that file twice.', 'error');
      }
      const hasNewUploads = editAttachments.some((attachment) => attachment.file && attachment.previewUrl.startsWith('blob:') && attachment.fieldKey !== 'avatar');
      // Omitting attachments appends new files while retaining uploads hidden inside rich embeds.
      if (hasNewUploads && !editPayload.attachments && !hasEmbeddedDiscordUpload(currentMessage.data)) editPayload.attachments = currentAttachmentIds.map(id => ({ id }));
      if (hasNewUploads && editPayload.attachments) {
        const names = new Map(currentAttachments.flatMap(attachment => {
          if (!attachment || typeof attachment !== 'object') return [];
          const file = attachment as Record<string, unknown>;
          return typeof file.id === 'string' && typeof file.filename === 'string' ? [[file.id, file.filename] as const] : [];
        }));
        editPayload.attachments = editPayload.attachments.map(attachment => ({ ...attachment, ...(names.has(String(attachment.id)) ? { filename: names.get(String(attachment.id)) } : {}) }));
      }
      if (!Object.keys(editPayload).length && !hasNewUploads) return showToast('No changes to save.', 'info');

      const result = await editMessage(webhookUrl, parsedId, editPayload, editAttachments);
      if (!result.success) {
        if (result.discordApiError) {
          showDiscordErrorModal({
            ...result.discordApiError,
            intro: 'Your changes could not be saved because they contain the following errors:',
          });
        } else {
          showToast(result.error ?? 'Edit failed', 'error');
        }
        return;
      }
      if (result.data && Array.isArray(result.data.attachments) && Array.isArray(result.data.embeds)) {
        const refreshed = parseDiscordPayloadToMessage(result.data);
        refreshed.id = msg.id;
        refreshed.loadedPayload = buildPayload(refreshed);
        if (convertingToV2 || retained || hasNewUploads) updateMessage(index, () => refreshed);
        else updateMessage(index, (message) => ({ ...message, loadedFromMessageId: refreshed.loadedFromMessageId, loadedPayload: refreshed.loadedPayload, loadedAttachmentIds: refreshed.loadedAttachmentIds }));
      }
      showToast(convertingToV2 ? 'Message converted to Advanced V2.' : 'Message edited!', 'success');
    } finally {
      setSending(false);
    }
  };

  const handleLoadMessage = async () => {
    if (!validUrl || !parsedId) return showToast('Need webhook URL and message ID', 'error');
    setSending(true);
    try {
      const result = await loadMessage(webhookUrl, parsedId);
      if (result.valid && result.data) {
        if (hasUnsupportedDiscordComponents(result.data.components)) return showToast('This message has components that need a Discord app and cannot be edited here.', 'error');
        const decoded = parseDiscordPayloadToMessage(result.data);
        decoded.id = msg.id;
        decoded.loadedPayload = buildPayload(decoded);
        const keepV2 = isComponentsV2(msg) && !isComponentsV2(decoded);
        const ready = retainV2ModeWhenLoading(decoded, msg);
        updateMessage(index, () => ready);
        showToast(keepV2 ? 'Regular message loaded as V2 blocks. Review them before updating.' : 'Message loaded successfully!', 'success');
      } else {
        showToast(result.reason || 'Failed to load data', 'error');
      }
    } catch {
      showToast('Failed to load message', 'error');
    } finally {
      setSending(false);
    }
  };

  const [confirmDeleteMsg, setConfirmDeleteMsg] = useState(false);

  const handleDelete = async () => {
    if (!validUrl || !parsedId) return showToast('Need webhook URL and message ID', 'error');
    setConfirmDeleteMsg(true);
  };
  const confirmDeleteMsgAction = async () => {
    setConfirmDeleteMsg(false);
    if (!validUrl || !parsedId) return;
    setSending(true);
    try {
      const result = await deleteMessage(webhookUrl, parsedId);
      if (!result.success) {
        if (result.discordApiError) {
          showDiscordErrorModal({
            ...result.discordApiError,
            intro: 'The message could not be deleted. Details:',
          });
        } else {
          showToast(result.error ?? 'Delete failed', 'error');
        }
        return;
      }
      showToast('Message deleted!', 'success');
      setMessageId('');
    } finally {
      setSending(false);
    }
  };

  const attachmentUsage = useMemo(() => calculateAttachmentUsage(msg), [msg.embeds, msg._attachments, msg.componentBlocks, msg.componentMode, msg.flags]);
  const contentFileCount = attachmentUsage.contentFiles;
  const componentsMode = isComponentsV2(msg);
  const isEmpty = componentsMode ? (msg.componentBlocks?.length ?? 0) === 0 : !msg.content && msg.embeds.length === 0 && attachmentUsage.total === 0 && !(msg.linkButtons?.length);
  const isEmbedDropTarget = crossMessageEmbedDropTargetIndex === index;
  const isSourceDragMessage = !!crossMessageEmbedDrag && crossMessageEmbedDrag.sourceMessageIndex === index;
  const isDragTargetMessage = !!crossMessageEmbedDrag && crossMessageEmbedDrag.sourceMessageIndex !== index && isEmbedDropTarget;
  const isCompactedForDrag = isDragTargetMessage;
  const profileSummary = getProfileSummary(msg);
  const contentSummary = getContentSummary(msg);
  const filesSummary = getFilesSummary(msg);
  const embedsSummary = getEmbedsSummary(msg);
  const advancedSummary = getAdvancedSummary(msg);
  const isFocusTarget = editorFocusTarget?.messageIndex === index;
  const crossMessageDropReason =
    crossMessageEmbedDrag && crossMessageEmbedDrag.sourceMessageIndex !== index
      ? getEmbedMoveBlockingReason(messages ?? [], crossMessageEmbedDrag.sourceMessageIndex, index, crossMessageEmbedDrag.embedId)
      : null;
  const canReceiveCrossMessageEmbed =
    !!crossMessageEmbedDrag &&
    crossMessageEmbedDrag.sourceMessageIndex !== index &&
    crossMessageDropReason === null;
  const activeDraggedEmbedId = crossMessageEmbedDrag?.embedId ?? null;
  const collapseEmbedsForDrag = isDragTargetMessage || (isSourceDragMessage && sourceEmbedCompactReady);
  const shouldShowSectionSummary = (
    sectionOpen: boolean,
    section: 'profile' | 'content' | 'files' | 'embeds' | 'components' | 'advanced',
  ) => !sectionOpen || (isDragTargetMessage && section !== 'embeds');
  const showEmbedsSectionBody = openSections.embeds || isDragTargetMessage;
  const allEmbedsCollapsed =
    msg.embeds.length > 0 &&
    msg.embeds.every((embed) => collapsedEmbeds[embed.id] ?? false);

  useEffect(() => {
    setCollapsedEmbeds((current) => {
      const next: Record<string, boolean> = {};
      let changed = Object.keys(current).length !== msg.embeds.length;

      for (const embed of msg.embeds) {
        const nextValue = current[embed.id] ?? (messageBulkState === 'compact');
        next[embed.id] = nextValue;
        if (current[embed.id] !== nextValue) {
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [messageBulkState, msg.embeds]);

  useEffect(() => {
    if (!messageBulkInitialized.current) {
      messageBulkInitialized.current = true;
      lastMessageBulkSeq.current = messageBulkSeq;
      return;
    }
    if (messageBulkSeq === lastMessageBulkSeq.current) return;
    lastMessageBulkSeq.current = messageBulkSeq;
    if (messageBulkState === 'compact') {
      setOpenSections({
        profile: false,
        content: false,
        files: false,
        embeds: false,
        advanced: false,
      });
      setCollapsedEmbeds(Object.fromEntries(msg.embeds.map((e) => [e.id, true])));
    } else {
      setOpenSections({
        profile: true,
        content: true,
        files: true,
        embeds: true,
        advanced: false,
      });
      setCollapsedEmbeds(Object.fromEntries(msg.embeds.map((e) => [e.id, false])));
    }
  }, [messageBulkSeq, messageBulkState, msg.embeds]);

  useEffect(() => {
    if (!crossMessageEmbedDrag) {
      setCrossMessageEmbedDropTargetIndex(null);
      setSourceEmbedCompactReady(false);
    }
  }, [crossMessageEmbedDrag, setCrossMessageEmbedDropTargetIndex, setSourceEmbedCompactReady]);

  useEffect(() => {
    if (!isFocusTarget || !editorFocusTarget) return;

    setOpenSections((current) => ({
      ...current,
      [editorFocusTarget.section]: true,
      ...(editorFocusTarget.section === 'embeds' && editorFocusTarget.fieldId ? { embeds: true } : {}),
    }));
    if (editorFocusTarget.section === 'embeds' && editorFocusTarget.embedId) {
      setEmbedCollapsed(editorFocusTarget.embedId, false);
    }

    const targetSection =
      editorFocusTarget.section === 'profile'
        ? profileSectionRef.current
        : editorFocusTarget.section === 'content'
          ? contentSectionRef.current
          : editorFocusTarget.section === 'files'
            ? filesSectionRef.current
          : editorFocusTarget.section === 'embeds'
              ? embedsSectionRef.current
              : editorFocusTarget.section === 'components'
                ? componentsSectionRef.current
              : advancedSectionRef.current;

    let frame = 0;
    let inputFrame = 0;
    const started = performance.now();
    const revealTarget = () => {
      let focusNode: HTMLElement | null = targetSection;
      if (editorFocusTarget.section === 'embeds' && editorFocusTarget.embedId) {
        focusNode = cardRef.current?.querySelector<HTMLElement>(`[data-embed-editor-id="${editorFocusTarget.embedId}"]`) ?? targetSection;
      }
      if (editorFocusTarget.section === 'embeds' && editorFocusTarget.fieldId) {
        focusNode = cardRef.current?.querySelector<HTMLElement>(`[data-field-editor-id="${editorFocusTarget.fieldId}"]`) ?? focusNode;
      }
      if (editorFocusTarget.section === 'components' && editorFocusTarget.componentId) {
        focusNode = componentsSectionRef.current?.querySelector<HTMLElement>(`[data-component-block-id="${CSS.escape(editorFocusTarget.componentId)}"]`) ?? focusNode;
      }

      // Wait for a new row to make room before scrolling. Scrolling into its clipped
      // zero-height starting position makes the editor jump again as it expands.
      if (focusNode?.closest('.editor-motion-row[data-editor-row-moving="true"]') && performance.now() - started < 350) {
        frame = requestAnimationFrame(revealTarget);
        return;
      }
      const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
      if (editorFocusTarget.section !== 'embeds') focusNode?.scrollIntoView({ behavior, block: 'center', inline: 'nearest' });
      const inputToFocus =
        editorFocusTarget.section === 'content'
          ? contentSectionRef.current?.querySelector<HTMLElement>('textarea, input')
          : editorFocusTarget.section === 'profile'
            ? profileSectionRef.current?.querySelector<HTMLElement>('input')
            : null;
      inputToFocus?.focus({ preventScroll: true });
      if (editorFocusTarget.section === 'embeds') {
        const embedNode = cardRef.current?.querySelector<HTMLElement>(`[data-embed-editor-id="${CSS.escape(editorFocusTarget.embedId ?? '')}"]`);
        const focusInput = () => {
          const field = editorFocusTarget.fieldId ? embedNode?.querySelector<HTMLElement>(`[data-field-editor-id="${CSS.escape(editorFocusTarget.fieldId)}"]`) : null;
          const fieldInputs = field ? [...field.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')] : [];
          const target = editorFocusTarget.fieldId
            ? fieldInputs.find(input => !input.value.trim()) ?? fieldInputs[0]
            : embedNode?.querySelector<HTMLElement>(`[aria-label="${CSS.escape(editorFocusTarget.inputLabel ?? 'Embed title')}"]`);
          if (target && !target.closest('[inert]') && target.getClientRects().length && (!editorFocusTarget.fieldId || performance.now() - started >= 180)) {
            target.focus({ preventScroll: true });
            target.scrollIntoView({ behavior, block: 'center' });
          } else if (performance.now() - started < 700) inputFrame = requestAnimationFrame(focusInput);
        };
        inputFrame = requestAnimationFrame(focusInput);
      } else if (editorFocusTarget.section === 'components') {
        const block = editorFocusTarget.componentId
          ? componentsSectionRef.current?.querySelector<HTMLElement>(`[data-component-block-id="${CSS.escape(editorFocusTarget.componentId)}"]`)
          : null;
        const exactInput = editorFocusTarget.inputLabel
          ? block?.querySelector<HTMLElement>(`[aria-label="${CSS.escape(editorFocusTarget.inputLabel)}"]`)
          : null;
        const target = exactInput ?? block?.querySelector<HTMLElement>('textarea, input, button:not(:disabled)')
          ?? targetSection?.querySelector<HTMLElement>(isComponentsV2(msg) ? '.message-v2-builder textarea, .message-v2-builder input, .component-picker-trigger' : '.message-link-settings summary, .message-link-settings input');
        const details = target?.closest('details');
        if (details) details.open = true;
        const options = target?.closest('[data-gallery-options]');
        const optionsTrigger = options?.querySelector<HTMLButtonElement>('button[aria-expanded="false"]');
        optionsTrigger?.click();
        const focusStarted = performance.now();
        const focusComponent = () => {
          if (target && !target.closest('[inert]') && target.getClientRects().length && (!optionsTrigger || behavior === 'instant' || performance.now() - focusStarted >= 200)) {
            target.scrollIntoView({ block: 'nearest' }); target.focus({ preventScroll: true });
          } else if (performance.now() - focusStarted < 700) inputFrame = requestAnimationFrame(focusComponent);
        };
        inputFrame = requestAnimationFrame(focusComponent);
      }
      else if (editorFocusTarget.section === 'files') targetSection?.querySelector<HTMLElement>('[role="button"], button')?.focus({ preventScroll: true });
    };
    frame = requestAnimationFrame(revealTarget);
    return () => { cancelAnimationFrame(frame); cancelAnimationFrame(inputFrame); };
  }, [editorFocusTarget, isFocusTarget, setEmbedCollapsed]);

  const profileSection = (
    <div
      key="profile"
      ref={profileSectionRef}
      data-message-section="profile"
      className={`message-section ${isDragTargetMessage ? 'message-section--drag-muted' : ''}`}
      style={{ order: componentsMode ? 5 : isDragTargetMessage ? 3 : 2 }}
    >
      <div className="section-header" role="button" tabIndex={0} aria-expanded={!!openSections.profile} onClick={() => toggle('profile')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle('profile'); } }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flexWrap: 'wrap' }}>
          <IconUser className="section-header__leading-icon" size={17} strokeWidth={2} />
          <span>Name & avatar</span>
          {shouldShowSectionSummary(!!openSections.profile, 'profile') && (
            <span className={`section-summary section-summary--${profileSummary.tone ?? 'muted'}`}>
              {profileSummary.text}
            </span>
          )}
        </span>
        {openSections.profile ? <IconChevronDown className="section-header__chevron" size={18} strokeWidth={2} /> : <IconChevronRight className="section-header__chevron" size={18} strokeWidth={2} />}
      </div>
      <MessageSectionSwap expanded={openSections.profile && !isCompactedForDrag}>
        <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div className="editor-field-label"><span className="label">Username</span><LimitCounter count={msg.username.length} limit={80} label="Username" /></div>
            <TextFieldWithQuickActions
              value={msg.username}
              aria-label="Username"
              onChange={(username) => updateMessage(index, (m) => ({ ...m, username }))}
              placeholder="Leave blank to use the webhook name"
              maxLength={80}
              expandedEditorTitle="Display name"
            />
          </div>
          <AvatarImageControl message={msg} webhookUrl={validUrl ? webhookUrl : ''}
            onChange={(url, attachment) => updateMessage(index, current => syncAvatarPreviewAttachment(current, url, attachment))} />
        </div>
      </MessageSectionSwap>
    </div>
  );

  return (
    <div
      ref={cardRef}
      className={[
        'message-editor-card',
        isFocusTarget ? 'message-editor-card--active' : '',
        crossMessageEmbedDrag && crossMessageEmbedDrag.sourceMessageIndex !== index && !isEmbedDropTarget ? 'message-editor-card--drag-dim' : '',
      ].filter(Boolean).join(' ')}
      data-message-editor-index={index}
      data-embed-drop-zone={index}
      onPointerDownCapture={() => setActiveMessageIndex(index)}
      onFocusCapture={() => setActiveMessageIndex(index)}
    >
      {/* Header */}
      <div className="message-editor-header">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <div className="message-editor-title">Message {index + 1}</div>
          <div className="message-editor-subtitle">
            {componentsMode ? `${msg.componentBlocks?.length ?? 0} ${(msg.componentBlocks?.length ?? 0) === 1 ? 'layout block' : 'layout blocks'}` : contentSummary.text}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>

          <button
            className="btn btn-secondary btn-sm"
            onClick={() => duplicateMessage(index)}
            style={{ padding: '4px 8px' }}
            title="Duplicate this message"
          >
            <IconCopy size={14} />
          </button>
          {totalMessages > 1 && (
            <button className="btn btn-secondary btn-sm" onClick={() => removeMessage(index)} style={{ padding: '4px 6px', color: 'var(--danger)' }} title="Remove this message">
              <IconTrash size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="message-editor-body">
        <div className="message-format-control" style={{ order: 0 }}>
          <MessageV2Toggle message={msg} locked={!!parsedId && msg.loadedFromMessageId === parsedId && !!(msg.loadedPayload?.flags && (msg.loadedPayload.flags & COMPONENTS_V2_FLAG))} onChange={change => updateMessage(index, current => ({ ...current, ...change }))} />
        </div>
        <details className="existing-message-tools" style={{ order: 8 }}>
          <summary>Edit a sent message</summary>
          <p>Paste its ID or link. Use the same webhook that sent it.</p>
        {/* Message ID / Edit / Delete */}
        <div
          className={[
            'message-editor-id-row',
            isDragTargetMessage ? 'message-section message-section--drag-muted' : '',
          ].filter(Boolean).join(' ')}
          style={{ order: isDragTargetMessage ? 2 : 0 }}
        >
          <div className="message-editor-id-row__input-wrap">
            <input
              value={messageId}
              onChange={(e) => setMessageId(e.target.value)}
              placeholder="Paste a message ID or link"
              style={{ fontSize: 12, padding: '6px 10px', paddingRight: 30, borderColor: messageIdValid === true ? 'var(--success)' : messageIdValid === false ? 'var(--danger)' : undefined }}
            />
            <div style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: 4 }}>
              {checkingId && <IconLoader size={14} style={{ color: 'var(--text-muted)' }} />}
              {!checkingId && messageIdValid === true && <IconCheck size={14} style={{ color: 'var(--success)' }} />}
              {!checkingId && messageIdValid === false && <IconAlert size={14} style={{ color: 'var(--danger)' }} />}
              {messageId && (
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMessageId(''); setMessageIdValid(null); setValidationReason(''); }}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}
                  title="Clear message ID"
                >
                  <IconX size={14} />
                </button>
              )}
            </div>
          </div>
          <div className="message-editor-id-row__actions">
            <button className="btn btn-secondary btn-sm" onClick={handleLoadMessage} disabled={sending || isRateLimited || !validUrl || !parsedId || messageIdValid === false} title="Load Message" style={{ padding: '5px 10px' }}>
              <IconDownload size={14} /> Load
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleEdit} disabled={sending || !validUrl || !parsedId || messageIdValid === false} title="Update the message in Discord" style={{ padding: '5px 10px' }}>
              <IconPencil size={14} /> Update
            </button>
            <button className="btn btn-danger btn-sm" onClick={handleDelete} disabled={sending || !validUrl || !parsedId || messageIdValid === false} title="Delete Message" style={{ padding: '5px 10px' }}>
              <IconTrash size={14} />
            </button>
          </div>
        </div>
        {messageIdValid === false && parsedId && (
          <div className="webhook-tip-chips" role="status" style={{ order: isDragTargetMessage ? 2 : 0 }}>
            <span className="webhook-tip-chip webhook-tip-chip--danger">
              <IconAlert size={12} style={{ flexShrink: 0 }} aria-hidden />
              {validationReason || 'Message not found or not editable by this webhook'}
            </span>
          </div>
        )}

        </details>

        {!componentsMode && profileSection}

        {/* Content */}
        <div
          ref={contentSectionRef}
          data-message-section="content"
          className={`message-section ${isDragTargetMessage ? 'message-section--drag-muted' : ''}`}
          style={{ order: isDragTargetMessage ? 4 : 1, display: componentsMode ? 'none' : undefined }}
        >
          <div className="section-header" role="button" tabIndex={0} aria-expanded={!!openSections.content} onClick={() => toggle('content')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle('content'); } }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flexWrap: 'wrap' }}>
              <IconMessage className="section-header__leading-icon" size={17} strokeWidth={2} />
              <span>Content</span>
              {shouldShowSectionSummary(!!openSections.content, 'content') && (
                <span className={`section-summary section-summary--${contentSummary.tone ?? 'muted'}`}>
                  {contentSummary.text}
                </span>
              )}
            </span>
            {openSections.content ? <IconChevronDown className="section-header__chevron" size={18} strokeWidth={2} /> : <IconChevronRight className="section-header__chevron" size={18} strokeWidth={2} />}
          </div>
          <MessageSectionSwap expanded={openSections.content && !isCompactedForDrag}>
            <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 2 }}>
                  <LimitCounter count={msg.content.length} limit={2000} label="Message content" />
                </div>
                <TextFieldWithQuickActions
                  multiline
                  value={msg.content}
                  onChange={(content) => updateMessage(index, (m) => ({ ...m, content }))}
                  placeholder="Write your message…"
                  maxLength={2000}
                  rows={4}
                  expandedEditorTitle="Message content"
                />
              </div>
            </div>
          </MessageSectionSwap>
        </div>

        {/* Files (message attachments) */}
        <div
          ref={filesSectionRef}
          data-message-section="files"
          className={`message-section ${isDragTargetMessage ? 'message-section--drag-muted' : ''}`}
          style={{ order: isDragTargetMessage ? 5 : 3, display: componentsMode ? 'none' : undefined }}
        >
          <div
            className="section-header"
            role="button"
            tabIndex={0}
            aria-expanded={!!openSections.files}
            onClick={() => toggle('files')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle('files'); } }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flexWrap: 'wrap' }}>
              <IconPaperclip className="section-header__leading-icon" size={17} strokeWidth={2} />
              <span>Files ({contentFileCount})</span>
              {shouldShowSectionSummary(!!openSections.files, 'files') && (
                <span className={`section-summary section-summary--${filesSummary.tone ?? 'muted'}`}>
                  {filesSummary.text}
                </span>
              )}
            </span>
            {openSections.files ? <IconChevronDown className="section-header__chevron" size={18} strokeWidth={2} /> : <IconChevronRight className="section-header__chevron" size={18} strokeWidth={2} />}
          </div>
          <MessageSectionSwap expanded={openSections.files && !isCompactedForDrag}>
            <div className="attachment-files-subpanel">
              <AttachmentUploader
                msg={msg}
                index={index}
                updateMessage={updateMessage}
                isRateLimited={false}
                sectionMode
              />
            </div>
          </MessageSectionSwap>
        </div>

        {/* Empty state hint */}
        <AnimatePresence>
          {isEmpty && !isDragTargetMessage && (
            <motion.div
              className="hint-banner hint-banner--empty"
              {...uiMotion.collapse}
            >
              <IconAlert size={15} className="hint-banner__icon" aria-hidden />
              <span className="hint-banner__text" title={componentsMode ? 'Add a component to send' : 'Message is empty — add content or an embed to send'}>
                {componentsMode ? 'Message empty — add a component' : 'Message empty — add text or an embed'}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Embeds */}
        <div
          ref={embedsSectionRef}
          data-message-section="embeds"
          className={`message-section ${isDragTargetMessage ? 'message-section--drag-embed' : ''}`}
          style={{ order: isDragTargetMessage ? 1 : 4, display: componentsMode ? 'none' : undefined }}
        >
          <div className="section-header" onClick={() => toggle('embeds')} role="button" tabIndex={0} aria-expanded={!!openSections.embeds} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle('embeds'); } }}>
            <span className="section-header__content" style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flexWrap: 'wrap' }}>
              <IconLayers className="section-header__leading-icon" size={17} strokeWidth={2} />
              <span>Embeds ({msg.embeds.length}/10)</span>
              {shouldShowSectionSummary(!!openSections.embeds, 'embeds') && (
                <span className={`section-summary section-summary--${embedsSummary.tone ?? 'muted'}`}>
                  {embedsSummary.text}
                </span>
              )}
            </span>
            <span className="section-header__actions">
              {msg.embeds.length > 0 && (
                <button
                  type="button"
                  className="section-header__action-button section-header__action-button--icon-only"
                  onPointerDown={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const nextCollapsed = !allEmbedsCollapsed;
                    setCollapsedEmbeds(
                      Object.fromEntries(msg.embeds.map((entry) => [entry.id, nextCollapsed])),
                    );
                  }}
                  title={allEmbedsCollapsed ? 'Expand all embeds' : 'Compact all embeds'}
                  aria-label={allEmbedsCollapsed ? 'Expand all embeds' : 'Compact all embeds'}
                >
                  {allEmbedsCollapsed ? (
                    <IconChevronUp size={16} strokeWidth={2.25} aria-hidden />
                  ) : (
                    <IconChevronDown size={16} strokeWidth={2.25} aria-hidden />
                  )}
                </button>
              )}
              {showEmbedsSectionBody ? <IconChevronDown className="section-header__chevron" size={18} strokeWidth={2} /> : <IconChevronRight className="section-header__chevron" size={18} strokeWidth={2} />}
            </span>
          </div>
          {crossMessageEmbedDrag && crossMessageEmbedDrag.sourceMessageIndex !== index && isEmbedDropTarget && (
            <div
              style={{
                marginTop: 8,
                padding: '10px 12px',
                borderRadius: 10,
                border: `${isEmbedDropTarget ? 2 : 1}px dashed ${isEmbedDropTarget ? (canReceiveCrossMessageEmbed ? 'var(--accent)' : 'var(--danger)') : 'var(--border)'}`,
                background: isEmbedDropTarget
                  ? canReceiveCrossMessageEmbed
                    ? 'color-mix(in srgb, var(--accent) 18%, transparent)'
                    : 'color-mix(in srgb, var(--danger) 14%, transparent)'
                  : 'var(--bg-secondary)',
                color: isEmbedDropTarget && !canReceiveCrossMessageEmbed ? 'var(--danger)' : canReceiveCrossMessageEmbed ? 'var(--text-secondary)' : 'var(--text-muted)',
                fontSize: 12,
                fontWeight: isEmbedDropTarget ? 600 : 500,
                boxShadow: isEmbedDropTarget
                  ? canReceiveCrossMessageEmbed
                    ? '0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent)'
                    : '0 0 0 3px color-mix(in srgb, var(--danger) 18%, transparent)'
                  : 'none',
                transform: isEmbedDropTarget ? 'scale(1.01)' : 'scale(1)',
                transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s, transform 0.15s',
              }}
            >
              {canReceiveCrossMessageEmbed
                ? isEmbedDropTarget
                  ? `Release to move this embed into Message ${index + 1}.`
                  : `Drag here to move this embed into Message ${index + 1}.`
                : crossMessageDropReason}
            </div>
          )}
          <AnimatePresence initial={false}>
            {showEmbedsSectionBody && (
              <motion.div
                key="embeds-body"
                className="message-section-transition-shell"
                {...uiMotion.collapse}
              >
                <div className="message-section-transition-inner">
                  <div
                    className={isDragTargetMessage ? 'message-section-spotlight' : ''}
                    style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 8 }}
                  >
                    <div className="editor-budget" aria-label="Embed message limits">
                      <span>All embeds in this message</span>
                      <LimitCounter count={msg.embeds.reduce((total, embed) => total + embedTextLength(embed), 0)} limit={6000} label="Total embed text" showUnit />
                    </div>
                    <Reorder.Group as="div" axis="y" values={msg.embeds.map((e: Embed) => e.id)} onReorder={(newIds) => updateMessage(index, (m) => {
                      const currentEmbeds = new Map(m.embeds.map((e: Embed) => [e.id, e]));
                      const nextEmbeds = newIds.map((id: string) => currentEmbeds.get(id)).filter(Boolean) as Embed[];
                      return pruneUnusedMessageAttachments({ ...m, embeds: nextEmbeds });
                    })} style={{ display: 'flex', flexDirection: 'column', gap: 8, listStyle: 'none', padding: 0, margin: 0 }}>
                      <AnimatedEditorList gap={8}>{msg.embeds.map((embed: Embed, eIndex: number) => (
                        <AnimatedEditorRow key={embed.id}>
                        <EmbedReorderItem
                          key={embed.id}
                          embed={embed}
                          embedIndex={eIndex}
                          msgIndex={index}
                          embedCount={msg.embeds.length}
                          attachmentUsage={attachmentUsage}
                          updateMessage={updateMessage}
                          collapsed={collapsedEmbeds[embed.id] ?? false}
                          setEmbedCollapsed={setEmbedCollapsed}
                          forceCollapse={collapseEmbedsForDrag && activeDraggedEmbedId !== embed.id}
                          isRateLimited={false}
                          setCrossMessageEmbedDrag={setCrossMessageEmbedDrag}
                          setSourceEmbedCompactReady={setSourceEmbedCompactReady}
                          crossMessageEmbedDropTargetIndex={crossMessageEmbedDropTargetIndex}
                          setCrossMessageEmbedDropTargetIndex={setCrossMessageEmbedDropTargetIndex}
                          updateCrossMessageEmbedDropTarget={updateCrossMessageEmbedDropTarget}
                          moveEmbedToMessage={moveEmbedToMessage}
                          isFocused={isFocusTarget && editorFocusTarget?.section === 'embeds' && editorFocusTarget.embedId === embed.id}
                          focusedSection={isFocusTarget ? editorFocusTarget?.embedSection : undefined}
                          focusedFieldId={isFocusTarget && editorFocusTarget?.section === 'embeds' ? editorFocusTarget.fieldId : undefined}
                          focusRequestId={isFocusTarget ? editorFocusTarget?.requestId : undefined}
                        />
                        </AnimatedEditorRow>
                      ))}</AnimatedEditorList>
                    </Reorder.Group>
                    {msg.embeds.length < 10 && (
                      <button
                        type="button"
                        className="btn-add-embed"
                        onClick={() => {
                          const nextEmbed = createDefaultEmbed();
                          setEmbedCollapsed(nextEmbed.id, false);
                          updateMessage(index, (m) => pruneUnusedMessageAttachments({ ...m, embeds: [...m.embeds, nextEmbed] }));
                          requestAnimationFrame(() => {
                            setActiveMessageIndex(index);
                            requestEditorFocus({
                              messageIndex: index,
                              section: 'embeds',
                              embedId: nextEmbed.id,
                              source: 'editor',
                            });
                          });
                        }}
                      >
                        <IconPlus size={16} strokeWidth={1.75} /> Add embed
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div key="components" ref={componentsSectionRef} data-message-section="components" style={{ order: componentsMode ? 2 : 5 }}>
          <MessageComponentsEditor message={msg} onChange={change => updateMessage(index, current => ({ ...current, ...change }))} />
        </div>

        {componentsMode && profileSection}

        {/* Advanced */}
        <div
          ref={advancedSectionRef}
          data-message-section="advanced"
          className={`message-section ${isDragTargetMessage ? 'message-section--drag-muted' : ''}`}
          style={{ order: isDragTargetMessage ? 7 : 6 }}
        >
          <div className="section-header" role="button" tabIndex={0} aria-expanded={!!openSections.advanced} onClick={() => toggle('advanced')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle('advanced'); } }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flexWrap: 'wrap' }}>
              <IconSliders className="section-header__leading-icon" size={17} strokeWidth={2} />
              <span>Advanced</span>
              {shouldShowSectionSummary(!!openSections.advanced, 'advanced') && (
                <span className={`section-summary section-summary--${advancedSummary.tone ?? 'muted'}`}>
                  {advancedSummary.text}
                </span>
              )}
            </span>
            {openSections.advanced ? <IconChevronDown className="section-header__chevron" size={18} strokeWidth={2} /> : <IconChevronRight className="section-header__chevron" size={18} strokeWidth={2} />}
          </div>
          <MessageSectionSwap expanded={openSections.advanced && !isCompactedForDrag}>
            <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {!componentsMode && <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                <div className="toggle">
                  <input type="checkbox" checked={((msg.flags || 0) & 4) !== 0} onChange={(e) => updateMessage(index, (m) => ({ ...m, flags: e.target.checked ? (m.flags || 0) | 4 : (m.flags || 0) & ~4 }))} />
                  <div className="toggle-slider" />
                </div>
                Suppress Embeds
              </label>}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                <div className="toggle">
                  <input type="checkbox" checked={((msg.flags || 0) & 4096) !== 0} onChange={(e) => updateMessage(index, (m) => ({ ...m, flags: e.target.checked ? (m.flags || 0) | 4096 : (m.flags || 0) & ~4096 }))} />
                  <div className="toggle-slider" />
                </div>
                Silent (suppress notifications)
              </label>
            </div>
          </MessageSectionSwap>
        </div>

      </div>

      <AnimatePresence>
        {confirmDeleteMsg && (
          <ConfirmDialog
            open
            title="Delete message from Discord?"
            message="This will permanently delete this message from the Discord channel. This cannot be undone."
            confirmLabel="Delete from Discord"
            variant="danger"
            onConfirm={confirmDeleteMsgAction}
            onCancel={() => setConfirmDeleteMsg(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
});

export default MessageEditor;
