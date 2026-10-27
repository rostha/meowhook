'use client';
import { useUiMotion } from '@/lib/useUiMotion';
import { useAppStore } from '@/stores/useAppStore';
import { retryMessageIds, sendDestination, type SendRun } from '@/lib/sendHistory';
import { validationTarget } from '@/lib/validationTarget';
import { activeMessageAttachments } from '@/lib/componentAttachments';
import { isComponentsV2 } from '@/lib/messageComponents';
import { buildPayload, getSendBlockingReason, splitSendBlockingReason } from '@/lib/payload';
import { sendMessage, SendResult } from '@/lib/webhook';
import { isValidWebhookUrl, createDefaultMessage } from '@/lib/utils';
import { IconLoader, IconSendHook, IconAlert, IconInfo, IconRotateCCW } from '@/components/MeowIcons';
import ConfirmDialog from '@/components/ConfirmDialog';
import SendResults from '@/components/SendResults';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState, useMemo } from 'react';
import { MESSAGE_SEND_DELAY } from '@/lib/rateLimit';
import { calculateAttachmentUsage, DISCORD_ATTACHMENT_LIMIT } from '@/lib/attachmentTracker';
import { pruneUnusedMessageAttachments } from '@/lib/embedTransfers';
import { activeEmbedTextLength, reconcileSequenceReceipt } from '@/lib/sendSequence';
import type { Message } from '@/lib/types';

function getSequenceAttachmentBlockingReason(messages: Message[]): string | null {
  for (let i = 0; i < messages.length; i++) {
    const missingUploadedFile = activeMessageAttachments(messages[i]).find(
      (attachment) => (attachment.fieldKey.startsWith('content_file') || isComponentsV2(messages[i])) && !attachment.file
    );
    if (missingUploadedFile) {
      return `Files need to be re-uploaded\nMessage ${i + 1}: imported or loaded message files cannot be re-sent automatically. Re-upload those files before sending.`;
    }

    const missingBlobFile = activeMessageAttachments(messages[i]).find(
      (attachment) => attachment.previewUrl.startsWith('blob:') && !attachment.file
    );
    if (missingBlobFile) {
      return `Missing uploaded file data\nMessage ${i + 1}: one of the uploaded files is no longer available in this browser. Re-upload it before sending.`;
    }
  }

  return null;
}

export default function ActionBar() {
  const uiMotion = useUiMotion();
  const tabs = useAppStore((s) => s.tabs);
  const activeTabIndex = useAppStore((s) => s.activeTabIndex);

  const activeTab = tabs[activeTabIndex];
  const allMessages = activeTab?.messages || [];
  const sendRuns = useAppStore(s => s.sendRuns);
  const saveSendRun = useAppStore(s => s.saveSendRun);
  const run = activeTab ? sendRuns[activeTab.id] : undefined;
  const retryIds = retryMessageIds(run, sendDestination(activeTab?.webhookUrl ?? ''));
  const retryMessages = allMessages.filter(message => retryIds.includes(message.id));
  const retrying = retryMessages.length > 0;
  const messages = retrying ? retryMessages : allMessages;
  const webhookUrl = activeTab?.webhookUrl || '';

  const showToast = useAppStore((s) => s.showToast);
  const setTabs = useAppStore((s) => s.setTabs);
  const sending = useAppStore((s) => s.sending);
  const setSending = useAppStore((s) => s.setSending);
  const rateLimit = useAppStore((s) => s.rateLimit);
  const sendProgress = useAppStore((s) => s.sendProgress);
  const setSendProgress = useAppStore((s) => s.setSendProgress);
  const resetSendProgress = useAppStore((s) => s.resetSendProgress);

  const [countdown, setCountdown] = useState<number>(0);
  const [progressCountdown, setProgressCountdown] = useState<number>(0);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const { attachmentInfo, totalAttachments, messagesExceedingLimit, messagesAtLimit } = useMemo(() => {
    const info = messages.map((m) => calculateAttachmentUsage(m));
    return {
      attachmentInfo: info,
      totalAttachments: info.reduce((sum, u) => sum + u.total, 0),
      messagesExceedingLimit: info.filter((u) => u.total > DISCORD_ATTACHMENT_LIMIT).length,
      messagesAtLimit: info.filter((u) => u.total === DISCORD_ATTACHMENT_LIMIT).length,
    };
  }, [messages]);


  const hasAnyEmbed = useMemo(
    () => messages.some((m) => (m.embeds?.length ?? 0) > 0),
    [messages]
  );

  useEffect(() => {
    if (!rateLimit.isRateLimited || rateLimit.retryAfter <= 0) {
      setCountdown(0);
      return;
    }

    setCountdown(Math.ceil(rateLimit.retryAfter / 1000));

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [rateLimit.isRateLimited, rateLimit.retryAfter]);

  const sequenceAttachmentBlockingReason = useMemo(
    () => getSequenceAttachmentBlockingReason(messages),
    [messages]
  );
  const valid = isValidWebhookUrl(webhookUrl);
  const sendBlockingReason = useMemo(
    () =>
      sequenceAttachmentBlockingReason ??
      getSendBlockingReason(messages, attachmentInfo.map((a) => a.total)),
    [messages, attachmentInfo, sequenceAttachmentBlockingReason]
  );
  const sendBlockingParts = useMemo(
    () => (sendBlockingReason ? splitSendBlockingReason(sendBlockingReason) : null),
    [sendBlockingReason]
  );
  const { isAnyMessageOverLimit, overLimitMessages } = useMemo(() => {
    const over = messages
      .map((m, i) => ({ index: i, length: activeEmbedTextLength(m) }))
      .filter((m) => m.length > 6000);
    return { isAnyMessageOverLimit: over.length > 0, overLimitMessages: over };
  }, [messages]);
  const isRateLimited = rateLimit.isRateLimited;
  const routeLine = valid ? 'Webhook ready' : 'Add a webhook URL to send';

  const transportReady = valid;
  const sendDisabled =
    sending || !transportReady || isAnyMessageOverLimit || isRateLimited || sendBlockingReason !== null;

  /** Only show the prominent hint when the user has added at least one embed (empty draft stays quiet). */
  const showEmbedValidationHint =
    !isAnyMessageOverLimit &&
    !isRateLimited &&
    sendBlockingReason !== null &&
    (hasAnyEmbed || messages.some((m) => m.content.trim() || m._attachments?.length || m.linkButtons?.length || isComponentsV2(m)));

  useEffect(() => {
    if (!sendProgress.isWaiting || sendProgress.waitSeconds <= 0) {
      setProgressCountdown(0);
      return;
    }

    setProgressCountdown(sendProgress.waitSeconds);

    const interval = setInterval(() => {
      setProgressCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [sendProgress.isWaiting, sendProgress.waitSeconds]);

  const handleSend = async () => {
    if (useAppStore.getState().sending || isRateLimited) return;
    if (!transportReady) {
      return showToast('Add a valid webhook URL before sending', 'error');
    }
    if (isAnyMessageOverLimit) return showToast('One or more messages exceed the 6000 character limit', 'error');
    const sanitizedMessages = messages.map((message) => pruneUnusedMessageAttachments(message));
    const sanitizedAttachmentInfo = sanitizedMessages.map((message) => calculateAttachmentUsage(message));

    for (let i = 0; i < sanitizedMessages.length; i++) {
      const len = activeEmbedTextLength(sanitizedMessages[i]);
      if (len > 6000) return showToast(`Message ${i + 1} exceeds 6000 characters (${len}/6000)`, 'error');
    }

    const sendBlockReason = getSequenceAttachmentBlockingReason(sanitizedMessages) ?? getSendBlockingReason(sanitizedMessages, sanitizedAttachmentInfo.map((attachment) => attachment.total));
    if (sendBlockReason) return showToast(sendBlockReason, 'error');

    if (!activeTab) return;
    setSending(true);
    resetSendProgress();
    let nextRun: SendRun = retrying && run ? { ...run, rows: run.rows.map(row => ({ ...row })) } : {
      draftId: activeTab.id, destination: sendDestination(webhookUrl), at: Date.now(),
      rows: sanitizedMessages.map(message => ({ localId: message.id, position: allMessages.findIndex(m => m.id === message.id) + 1, status: 'not-sent' })),
    };
    const updateRow = (id: string, patch: Partial<SendRun['rows'][number]>) => {
      nextRun = { ...nextRun, rows: nextRun.rows.map(row => row.localId === id ? { ...row, ...patch } : row) };
      saveSendRun(nextRun);
    };
    saveSendRun(nextRun);
    try {
      for (const [index, message] of sanitizedMessages.entries()) {
        updateRow(message.id, { status: 'sending', error: undefined });
        setSendProgress({ status: 'sending', totalMessages: sanitizedMessages.length, currentMessage: index + 1, isWaiting: false });
        let result: SendResult;
        try {
          result = await sendMessage(webhookUrl, buildPayload(message), activeMessageAttachments(message), progress => setSendProgress(progress), index, sanitizedMessages.length);
        } catch (error) {
          result = { success: false, error: error instanceof Error ? error.message : 'Request failed. Check Discord before retrying.' };
        }
        updateRow(message.id, { status: result.success ? 'sent' : 'failed', discordId: result.messageId, error: result.discordApiError ? result.discordApiError.details.map(detail => `${detail.path}: ${detail.message}`).join(' · ') : result.error });
        if (!result.success) {
          setSendProgress({ status: 'error', error: result.error ?? 'Sending failed', isWaiting: false });
          showToast('Sending stopped. Review the results before retrying unsent messages.', 'error');
          break;
        }
        if (result.data) {
          const current = useAppStore.getState();
          const nextTabs = reconcileSequenceReceipt(current.tabs, activeTab.id, message, result.data);
          if (nextTabs !== current.tabs) current.setTabs(nextTabs);
        }
        if (index < sanitizedMessages.length - 1) await new Promise(resolve => setTimeout(resolve, MESSAGE_SEND_DELAY));
      }
      if (nextRun.rows.every(row => row.status === 'sent')) {
        setSendProgress({ status: 'success', isWaiting: false });
        showToast('All messages sent. Message IDs are in Send results.', 'success');
      }
    } finally { setSending(false); }
  };

  const confirmClearDraft = () => {
    setConfirmClearOpen(false);
    const tab = tabs[activeTabIndex];
    if (!tab) return;
    const updatedTabs = [...tabs];
    updatedTabs[activeTabIndex] = {
      ...tab,
      messages: [createDefaultMessage()],
    };
    setTabs(updatedTabs);
    showToast('Draft reset', 'info');
  };

  const jumpToIssue = (reason: string) => {
    const target = validationTarget(messages, reason);
    const actualMessage = messages[target.messageIndex];
    useAppStore.getState().requestEditorFocus({ ...target, messageIndex: Math.max(0, allMessages.findIndex(message => message.id === actualMessage?.id)) });
  };

  return (
    <div className="actionbar-root">
      <div className="actionbar-toolbar">
        <div className="actionbar-toolbar__primary">
          {showEmbedValidationHint && sendBlockingParts ? <div className="actionbar-issue" role="status" title={`${sendBlockingParts.headline}: ${sendBlockingParts.detail}`}>
            <IconAlert size={15} aria-hidden />
            <span>{sendBlockingParts.headline === 'Check components' ? `Message ${Number(sendBlockingParts.detail.match(/Message (\d+)/)?.[1] ?? 1)} needs attention` : sendBlockingParts.detail || sendBlockingParts.headline}</span>
            <button type="button" className="validation-jump" onClick={() => jumpToIssue(sendBlockingReason!)}>Fix issue <span aria-hidden="true">→</span></button>
          </div> : (
          <div className="actionbar-sequence-cluster">
            <div className="sequence-pill" role="status" title={`${messages.length} ${messages.length === 1 ? 'message' : 'messages'} in this send sequence`}>
              <span className="sequence-pill__label">Messages</span>
              <span className="sequence-pill__value">
                {messages.length} / 10
              </span>
              {messagesExceedingLimit > 0 && (
                <span className="sequence-pill__meta">
                  · {messagesExceedingLimit} {messagesExceedingLimit === 1 ? 'message' : 'messages'} exceed the file limit
                </span>
              )}
            </div>
            {totalAttachments > 0 && (
              <div className="actionbar-attachment-line">
                {totalAttachments} file{totalAttachments !== 1 ? 's' : ''}
                {messagesAtLimit > 0 && (
                  <span className="actionbar-attachment-line__warn">
                    {' '}
                    ({messagesAtLimit} at limit)
                  </span>
                )}
              </div>
            )}
            <div className="actionbar-route-line" title={routeLine}>
              {routeLine}
            </div>
          </div>
          )}

          <div className="actionbar-send-cluster">
          <button
            key="clear-draft"
            type="button"
            className="btn btn-sm actionbar-clear-draft"
            onClick={() => setConfirmClearOpen(true)}
            disabled={sending}
            title="Reset this draft — remove all messages, embeds, and attachments"
          >
            <IconRotateCCW size={16} strokeWidth={2} aria-hidden />
            <span>Reset</span>
          </button>
          <button
            key="send"
            type="button"
            className="btn btn-success btn-sm actionbar-send"
            onClick={handleSend}
            disabled={sendDisabled}
          >
            {sending ? <IconLoader size={16} /> : <IconSendHook size={16} strokeWidth={2} aria-hidden />}
            <span className="actionbar-send__label">
              {sending ? 'Sending...' : isRateLimited ? `Wait ${countdown}s` : retrying ? 'Retry unsent' : 'Send'}
            </span>
          </button>
          </div>
        </div>

        {isAnyMessageOverLimit && (
          <div className="actionbar-toolbar__full actionbar-chip actionbar-chip--danger" role="alert">
            <IconAlert size={14} style={{ flexShrink: 0 }} />
            <span>
              {overLimitMessages.length === 1
                ? `Message ${overLimitMessages[0].index + 1} has more than 6,000 embed characters (${overLimitMessages[0].length.toLocaleString()})`
                : `${overLimitMessages.length} messages have more than 6,000 embed characters`}
            </span>
            <button className="validation-jump" onClick={() => jumpToIssue(`Embeds are too long\nMessage ${overLimitMessages[0].index + 1}`)}>Show me where</button>
          </div>
        )}

        <AnimatePresence mode="wait">
          {sending && sendProgress.status !== 'idle' && (
            <motion.div
              key="progress"
              className="actionbar-toolbar__full actionbar-chip actionbar-chip--progress"
              {...uiMotion.overlay}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {sendProgress.status === 'waiting' || sendProgress.status === 'error' ? <IconAlert size={14} /> : <IconInfo size={14} />}
                <span>
                  {sendProgress.status === 'waiting'
                    ? `Waiting ${progressCountdown}s...`
                    : sendProgress.status === 'error'
                      ? (sendProgress.error ?? 'Send failed')
                      : sendProgress.status === 'success'
                        ? 'Send complete'
                        : `Sending ${sendProgress.currentMessage}/${sendProgress.totalMessages}`}
                </span>
                {sendProgress.totalBatches > 1 && (
                  <span style={{ fontSize: 11, opacity: 0.85 }}>
                    Batch {sendProgress.currentBatch || 1} of {sendProgress.totalBatches}
                  </span>
                )}
              </div>
            </motion.div>
          )}

          {!sending && isRateLimited && (
            <motion.div
              key="ratelimit"
              className="actionbar-toolbar__full actionbar-chip actionbar-chip--ratelimit"
              {...uiMotion.overlay}
            >
              <IconAlert size={14} />
              <span>Wait {countdown}s</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {run && <SendResults key={`${run.draftId}:${run.at}`} run={run} retrying={retrying} />}
      <ConfirmDialog
        open={confirmClearOpen}
        title="Reset this draft?"
        message={`This will remove all messages, embeds, and attachments in "${activeTab?.name ?? 'this draft'}" and replace them with a single blank message. Your webhook URL will not change.`}
        confirmLabel="Reset draft"
        variant="danger"
        onConfirm={confirmClearDraft}
        onCancel={() => setConfirmClearOpen(false)}
      />
    </div>
  );
}
