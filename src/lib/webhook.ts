import { patchComponentMedia } from './componentAttachments';
import type { WebhookInfo, FileAttachment, SendProgress, DiscordWebhookPayload, DiscordWebhookEditPayload } from './types';
import type { DiscordApiErrorPresentation } from './discordApiError';
import { presentationFromHttpError } from './discordApiError';
import { getUploadSizeError } from './uploadLimits';
import { normalizeDiscordMediaPayload } from './discordMedia';
import {
  updateRateLimitFromHeaders,
  setRateLimited,
  waitForRateLimit,
  createAttachmentBatches,
  calculateBatchDelay,
  ATTACHMENT_LIMITS,
} from './rateLimit';

function webhookRequestUrl(raw: string, messageId?: string, withComponents = false): string {
  const url = new URL(raw);
  url.hash = '';
  if (messageId) {
    url.pathname = url.pathname.replace(/\/$/, '') + '/messages/' + encodeURIComponent(messageId);
    url.searchParams.delete('wait');
  } else {
    url.searchParams.set('wait', 'true');
  }
  if (withComponents) url.searchParams.set('with_components', 'true');
  return url.toString();
}

export type ProgressCallback = (progress: Partial<SendProgress>) => void;

/**
 * Send message with automatic rate limit handling and batch attachment support
 */
export interface SendResult {
  success: boolean;
  messageId?: string;
  data?: Record<string, unknown>;
  batchCount?: number;
  error?: string;
  rateLimited?: boolean;
  retryAfter?: number;
  /** Structured validation / API errors for the Discord-style error modal */
  discordApiError?: DiscordApiErrorPresentation;
}

function discordFailureResult(
  res: Response,
  errBody: unknown,
  options?: { fileTooLargeMessage?: string }
): SendResult {
  if (res.status === 413) {
    const msg =
      options?.fileTooLargeMessage ??
      'File too large! Discord rejected the upload. Try reducing image size or quality.';
    return {
      success: false,
      error: msg,
      discordApiError: {
        headline: 'Discord Error',
        details: [{ path: 'attachments', message: msg }],
      },
    };
  }
  const discordApiError = presentationFromHttpError(res.status, errBody);
  const raw = errBody && typeof errBody === 'object' ? (errBody as Record<string, unknown>).message : undefined;
  const error =
    typeof raw === 'string' && raw.trim()
      ? raw.trim()
      : discordApiError.details[0]?.message ?? `Request failed (${res.status})`;
  return { success: false, error, discordApiError };
}

/**
 * Count all blob attachments including content files and embed images
 */
function countAllBlobAttachments(
  attachments: FileAttachment[] | undefined,
  payload: DiscordWebhookPayload
): number {
  if (!attachments) return 0;

  const contentAttachments = attachments.filter(
    (attachment) => attachment.fieldKey.startsWith('content_file') && isBlobUrl(attachment.previewUrl) && !!attachment.file
  );

  let embedAttachments = 0;
  if (payload.embeds) {
    for (const embed of payload.embeds) {
      if (embed.image?.url?.startsWith('blob:')) {
        const hasFile = attachments.some(a => a.previewUrl === embed.image!.url);
        if (hasFile) embedAttachments++;
      }
      if (embed.thumbnail?.url?.startsWith('blob:')) {
        const hasFile = attachments.some(a => a.previewUrl === embed.thumbnail!.url);
        if (hasFile) embedAttachments++;
      }
      if (embed.author?.icon_url?.startsWith('blob:')) {
        const hasFile = attachments.some(a => a.previewUrl === embed.author!.icon_url);
        if (hasFile) embedAttachments++;
      }
      if (embed.footer?.icon_url?.startsWith('blob:')) {
        const hasFile = attachments.some(a => a.previewUrl === embed.footer!.icon_url);
        if (hasFile) embedAttachments++;
      }
    }
  }

  return contentAttachments.length + embedAttachments;
}

function getMissingBlobAttachment(attachments: FileAttachment[] | undefined): FileAttachment | undefined {
  return attachments?.find(
    (attachment) =>
      attachment.fieldKey !== 'avatar' &&
      isBlobUrl(attachment.previewUrl) &&
      !attachment.file
  );
}

function getSendableBlobAttachments(attachments: FileAttachment[] | undefined): FileAttachment[] {
  return (attachments || []).filter(
    (attachment) =>
      attachment.fieldKey !== 'avatar' &&
      isBlobUrl(attachment.previewUrl) &&
      !!attachment.file
  );
}

function uploadSizeFailure(attachments: FileAttachment[] | undefined): SendResult | undefined {
  for (const attachment of getSendableBlobAttachments(attachments)) {
    const error = getUploadSizeError(attachment.file!);
    if (error) return { success: false, error, discordApiError: { headline: 'File too large', details: [{ path: 'attachments', message: error }] } };
  }
}

/**
 * Extract the webhook ID from a webhook URL
 */
function extractWebhookId(url: string): string | null {
  const match = url.match(/\/api\/webhooks\/(\d+)\//);
  return match ? match[1] : null;
}

/**
 * Check if a URL is a local blob (uploaded file)
 */
function isBlobUrl(url: string): boolean {
  return url.startsWith('blob:');
}

/**
 * Generate a safe filename from a File object
 */
export function safeFileName(file: File, index: number): string {
  const extension = file.name.includes('.') ? file.name.split('.').pop() : '';
  const ext = extension && /^[a-zA-Z0-9]{1,12}$/.test(extension) ? extension : 'bin';
  return `upload_${index}.${ext}`;
}

/**
 * Wait for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Handle rate limit response with proper retry
 */
async function handleRateLimitResponse(res: Response): Promise<{ shouldRetry: boolean; retryAfter?: number }> {
  if (res.status === 429) {
    try {
      const data = await res.json();
      const retryAfter = (data.retry_after || 1) * 1000;
      setRateLimited(retryAfter);
      return { shouldRetry: true, retryAfter };
    } catch {
      return { shouldRetry: false };
    }
  }
  return { shouldRetry: false };
}

export async function fetchWebhookInfo(url: string, signal?: AbortSignal, _retries = 0): Promise<WebhookInfo> {
  await waitForRateLimit();

  const res = await fetch(url, { signal });
  updateRateLimitFromHeaders(res.headers);

  if (res.status === 429) {
    if (_retries >= 3) throw new Error('Rate limited — too many retries');
    const rateLimitInfo = await handleRateLimitResponse(res);
    if (rateLimitInfo.shouldRetry && rateLimitInfo.retryAfter) {
      await sleep(rateLimitInfo.retryAfter);
      return fetchWebhookInfo(url, signal, _retries + 1);
    }
    throw new Error('Rate limited — too many requests');
  }

  if (!res.ok) throw new Error(`Failed to fetch webhook info: ${res.status}`);
  return res.json();
}

/**
 * Send a single message with attachments (respecting 10 attachment limit)
 * If more than 10 attachments, sends in batches as separate messages
 */
export async function sendMessage(
  url: string,
  payload: DiscordWebhookPayload,
  attachments?: FileAttachment[],
  onProgress?: ProgressCallback,
  messageIndex?: number,
  totalMessages?: number
): Promise<SendResult> {
  payload = normalizeDiscordMediaPayload(payload);
  const sizeFailure = uploadSizeFailure(attachments);
  if (sizeFailure) return sizeFailure;
  await waitForRateLimit(onProgress);

  const missingBlobAttachment = getMissingBlobAttachment(attachments);
  if (missingBlobAttachment) {
    return {
      success: false,
      error: 'This draft references an uploaded file that is no longer available. Re-upload it before sending.',
    };
  }

  // Count ALL blob attachments including embed images
  const blobAttachments = getSendableBlobAttachments(attachments);
  const totalBlobCount = payload.flags && (payload.flags & 32768) ? blobAttachments.length : countAllBlobAttachments(blobAttachments, payload);
  if ((payload.flags ?? 0) & 32768 && totalBlobCount > 10) return { success: false, error: 'V2 layouts support up to 10 uploaded files per message. Remove an upload before sending.' };

  // Update progress to show we're sending this message
  if (onProgress && messageIndex !== undefined && totalMessages !== undefined) {
    onProgress({
      currentMessage: messageIndex + 1,
      totalMessages,
      status: 'sending',
      isWaiting: false,
    });
  }

  // If we have 10 or fewer total attachments, send normally
  if (totalBlobCount <= ATTACHMENT_LIMITS.MAX_PER_MESSAGE) {
    return sendSingleMessage(url, payload, blobAttachments, onProgress);
  }

  // Split into batches and send as multiple messages
  return sendBatchedAttachments(url, payload, blobAttachments, onProgress, messageIndex, totalMessages);
}

/**
 * Send a single message with up to 10 attachments
 */
async function sendSingleMessage(
  url: string,
  payload: DiscordWebhookPayload,
  attachments: FileAttachment[],
  onProgress?: ProgressCallback,
  _retries = 0
): Promise<SendResult> {
  try {
    const res = attachments.length > 0
      ? await sendWithAttachments(url, payload, attachments)
      : await sendJsonOnly(url, payload);

    updateRateLimitFromHeaders(res.headers);

    if (res.status === 429) {
      if (_retries >= 3) return { success: false, rateLimited: true, error: 'Rate limited — too many retries' };
      const rateLimitInfo = await handleRateLimitResponse(res);
      if (rateLimitInfo.shouldRetry && rateLimitInfo.retryAfter) {
        // Report rate limit wait
        if (onProgress) {
          onProgress({
            status: 'waiting',
            isWaiting: true,
            waitSeconds: Math.ceil(rateLimitInfo.retryAfter / 1000),
          });
        }
        await sleep(rateLimitInfo.retryAfter);
        return sendSingleMessage(url, payload, attachments, onProgress, _retries + 1);
      }
      return { success: false, rateLimited: true, error: 'Rate limited — too many requests' };
    }

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return discordFailureResult(res, errBody, {
        fileTooLargeMessage: 'File too large! Discord rejected the upload. Try reducing image size or quality.',
      });
    }

    const data = await res.json();
    return { success: true, messageId: data.id, data };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown error';
    return { success: false, error };
  }
}

/**
 * Send message with batched attachments (more than 10 files)
 * Each batch is sent as a separate message with a 2-second delay
 */
async function sendBatchedAttachments(
  url: string,
  payload: DiscordWebhookPayload,
  allAttachments: FileAttachment[],
  onProgress?: ProgressCallback,
  _messageIndex?: number,
  _totalMessages?: number
): Promise<SendResult> {
  const batches = createAttachmentBatches(allAttachments);
  const results: SendResult[] = [];
  const messageIds: string[] = [];

  // Send first batch with the full message content
  const firstBatch = batches[0];
  const firstResult = await sendSingleMessage(url, payload, firstBatch, onProgress);
  results.push(firstResult);

  if (!firstResult.success) {
    return firstResult;
  }

  if (firstResult.messageId) {
    messageIds.push(firstResult.messageId);
  }

  // Send remaining batches as follow-up messages (content empty, only attachments)
  for (let i = 1; i < batches.length; i++) {
    // Wait 2 seconds between batches to respect rate limits
    const delay = calculateBatchDelay(i);

    // Report batch wait progress
    if (onProgress) {
      onProgress({
        status: 'waiting',
        isWaiting: true,
        waitSeconds: Math.ceil(delay / 1000),
        currentBatch: i + 1,
        totalBatches: batches.length,
      });
    }

    await sleep(delay);

    // Wait for any rate limit to clear
    await waitForRateLimit(onProgress);

    // Update progress to show we're sending again
    if (onProgress) {
      onProgress({
        status: 'sending',
        isWaiting: false,
        currentBatch: i + 1,
        totalBatches: batches.length,
      });
    }

    // Send follow-up message with just attachments
    const followUpPayload = {
      content: ``, // Empty content for follow-up batches
      username: payload.username,
      avatar_url: payload.avatar_url,
    };

    const result = await sendSingleMessage(url, followUpPayload, batches[i], onProgress);
    results.push(result);

    if (!result.success) {
      return {
        success: false,
        batchCount: i,
        messageId: messageIds[0],
        error: `Batch ${i + 1}/${batches.length} failed: ${result.error}`,
      };
    }

    if (result.messageId) {
      messageIds.push(result.messageId);
    }
  }

  return {
    success: true,
    batchCount: batches.length,
    messageId: messageIds[0],
    data: firstResult.data,
  };
}

/**
 * Send JSON-only message (no attachments)
 */
async function sendJsonOnly(url: string, payload: DiscordWebhookPayload): Promise<Response> {
  return fetch(webhookRequestUrl(url, undefined, !!payload.components?.length), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/**
 * Send webhook with file attachments via multipart/form-data
 */
async function sendWithAttachments(
  url: string,
  payload: DiscordWebhookPayload,
  attachments: FileAttachment[]
): Promise<Response> {
  const formData = new FormData();
  const fileMap: Map<string, string> = new Map();

  for (let i = 0; i < attachments.length; i++) {
    const att = attachments[i];
    if (!att.file) {
      throw new Error('Missing file data for attachment upload.');
    }
    const fileName = safeFileName(att.file, i);
    formData.append(`files[${i}]`, att.file, fileName);
    fileMap.set(att.previewUrl, `attachment://${fileName}`);
    if (att.name) fileMap.set(`attachment://${att.name}`, `attachment://${fileName}`);
  }

  const patchedPayload = JSON.parse(JSON.stringify(payload));

  // Remove avatar_url if it's a blob (Discord doesn't support attachment:// for avatars)
  if (patchedPayload.avatar_url && fileMap.has(patchedPayload.avatar_url)) {
    delete patchedPayload.avatar_url;
  }

  // Replace blob URLs with attachment:// references in embeds
  if (patchedPayload.embeds) {
    for (const embed of patchedPayload.embeds) {
      if (embed.image?.url && fileMap.has(embed.image.url)) {
        embed.image.url = fileMap.get(embed.image.url);
      }
      if (embed.thumbnail?.url && fileMap.has(embed.thumbnail.url)) {
        embed.thumbnail.url = fileMap.get(embed.thumbnail.url);
      }
      if (embed.author?.icon_url && fileMap.has(embed.author.icon_url)) {
        embed.author.icon_url = fileMap.get(embed.author.icon_url);
      }
      if (embed.footer?.icon_url && fileMap.has(embed.footer.icon_url)) {
        embed.footer.icon_url = fileMap.get(embed.footer.icon_url);
      }
    }
  }

  if (patchedPayload.components) patchedPayload.components = patchComponentMedia(patchedPayload.components, fileMap);
  formData.append('payload_json', JSON.stringify(patchedPayload));

  return fetch(webhookRequestUrl(url, undefined, !!payload.components?.length), {
    method: 'POST',
    body: formData,
  });
}

/**
 * Edit an existing message
 */
export async function editMessage(
  url: string,
  messageId: string,
  payload: DiscordWebhookEditPayload,
  attachments?: FileAttachment[],
  _retries = 0
): Promise<SendResult> {
  payload = normalizeDiscordMediaPayload(payload);
  const sizeFailure = uploadSizeFailure(attachments);
  if (sizeFailure) return sizeFailure;
  await waitForRateLimit();

  const missingBlobAttachment = getMissingBlobAttachment(attachments);
  if (missingBlobAttachment) {
    return {
      success: false,
      error: 'This draft references an uploaded file that is no longer available. Re-upload it before saving changes.',
    };
  }

  const blobAttachments = getSendableBlobAttachments(attachments);
  if (blobAttachments.length > ATTACHMENT_LIMITS.MAX_PER_MESSAGE) {
    return {
      success: false,
      error: `Discord allows up to ${ATTACHMENT_LIMITS.MAX_PER_MESSAGE} uploaded attachments per message.`,
    };
  }

  try {
    const res = await sendEditRequest(url, messageId, payload, blobAttachments);
    updateRateLimitFromHeaders(res.headers);

    if (res.status === 429) {
      if (_retries >= 3) return { success: false, rateLimited: true, error: 'Rate limited — too many retries' };
      const rateLimitInfo = await handleRateLimitResponse(res);
      if (rateLimitInfo.shouldRetry && rateLimitInfo.retryAfter) {
        await sleep(rateLimitInfo.retryAfter);
        return editMessage(url, messageId, payload, attachments, _retries + 1);
      }
      return { success: false, rateLimited: true, error: 'Rate limited — too many requests' };
    }

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return discordFailureResult(res, errBody, {
        fileTooLargeMessage: 'File too large! Discord rejected the upload.',
      });
    }

    const data = await res.json();
    return { success: true, messageId: data.id, data };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown error';
    return { success: false, error };
  }
}

async function sendEditRequest(
  url: string,
  messageId: string,
  payload: DiscordWebhookEditPayload,
  attachments: FileAttachment[]
): Promise<Response> {
  // PATCH preserves omitted properties. Keep the diff from the editor rather than
  // re-sending unchanged content, embeds, or components.
  payload = {
    ...(payload.content !== undefined ? { content: payload.content } : {}),
    ...(payload.embeds !== undefined ? { embeds: payload.embeds } : {}),
    ...(payload.components !== undefined ? { components: payload.components } : {}),
    ...(payload.flags !== undefined ? { flags: payload.flags & ((1 << 15) | 4) } : {}),
    ...(payload.attachments !== undefined ? { attachments: payload.attachments } : {}),
  };
  if (attachments.length > 0) {
    const formData = new FormData();
    const fileMap: Map<string, string> = new Map();
    const usedNames = new Set([
      ...(payload.attachments ?? []).flatMap(attachment => attachment.filename ? [attachment.filename] : []),
      ...Array.from(JSON.stringify(payload).matchAll(/attachment:\/\/([^"\\]+)/g), match => match[1]),
      ...Array.from(JSON.stringify(payload).matchAll(/https:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net)\/attachments\/[^"\\]+\/([^/"?\\]+)/g), match => {
        try { return decodeURIComponent(match[1]); } catch { return match[1]; }
      }),
    ]);
    const uploadNames: string[] = [];

    for (let i = 0; i < attachments.length; i++) {
      const att = attachments[i];
      if (!att.file) {
        throw new Error('Missing file data for attachment upload.');
      }
      let nameIndex = i;
      while (usedNames.has(safeFileName(att.file, nameIndex))) nameIndex++;
      const fileName = safeFileName(att.file, nameIndex);
      usedNames.add(fileName);
      uploadNames.push(fileName);
      formData.append(`files[${i}]`, att.file, fileName);
      fileMap.set(att.previewUrl, `attachment://${fileName}`);
      if (att.name) fileMap.set(`attachment://${att.name}`, `attachment://${fileName}`);
    }

    const patchedPayload = JSON.parse(JSON.stringify(payload));
    if (patchedPayload.attachments) {
      patchedPayload.attachments.push(...uploadNames.map((filename, index) => ({ id: index, filename })));
    }
    if (patchedPayload.avatar_url && fileMap.has(patchedPayload.avatar_url)) {
      delete patchedPayload.avatar_url;
    }
    if (patchedPayload.embeds) {
      for (const embed of patchedPayload.embeds) {
        if (embed.image?.url && fileMap.has(embed.image.url)) embed.image.url = fileMap.get(embed.image.url);
        if (embed.thumbnail?.url && fileMap.has(embed.thumbnail.url)) embed.thumbnail.url = fileMap.get(embed.thumbnail.url);
        if (embed.author?.icon_url && fileMap.has(embed.author.icon_url)) embed.author.icon_url = fileMap.get(embed.author.icon_url);
        if (embed.footer?.icon_url && fileMap.has(embed.footer.icon_url)) embed.footer.icon_url = fileMap.get(embed.footer.icon_url);
      }
    }

    if (patchedPayload.components) patchedPayload.components = patchComponentMedia(patchedPayload.components, fileMap);
    formData.append('payload_json', JSON.stringify(patchedPayload));

    return fetch(webhookRequestUrl(url, messageId, payload.components !== undefined), {
      method: 'PATCH',
      body: formData,
    });
  }

  return fetch(webhookRequestUrl(url, messageId, payload.components !== undefined), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/**
 * Delete a message
 */
export async function deleteMessage(url: string, messageId: string, _retries = 0): Promise<SendResult> {
  await waitForRateLimit();

  try {
    const res = await fetch(webhookRequestUrl(url, messageId), { method: 'DELETE' });
    updateRateLimitFromHeaders(res.headers);

    if (res.status === 429) {
      if (_retries >= 3) return { success: false, rateLimited: true, error: 'Rate limited — too many retries' };
      const rateLimitInfo = await handleRateLimitResponse(res);
      if (rateLimitInfo.shouldRetry && rateLimitInfo.retryAfter) {
        await sleep(rateLimitInfo.retryAfter);
        return deleteMessage(url, messageId, _retries + 1);
      }
      return { success: false, rateLimited: true, error: 'Rate limited — too many requests' };
    }

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return discordFailureResult(res, errBody);
    }

    return { success: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown error';
    return { success: false, error };
  }
}

/**
 * Load a message and verify it belongs to the current webhook
 */
export async function loadMessage(
  url: string,
  messageId: string,
  _retries = 0
): Promise<{ valid: boolean; data?: Record<string, unknown>; reason?: string }> {
  await waitForRateLimit();

  try {
    const res = await fetch(webhookRequestUrl(url, messageId));
    updateRateLimitFromHeaders(res.headers);

    if (res.status === 429) {
      if (_retries >= 3) return { valid: false, reason: 'Rate limited — too many retries' };
      const rateLimitInfo = await handleRateLimitResponse(res);
      if (rateLimitInfo.shouldRetry && rateLimitInfo.retryAfter) {
        await sleep(rateLimitInfo.retryAfter);
        return loadMessage(url, messageId, _retries + 1);
      }
      return { valid: false, reason: 'Rate limited — please wait and try again' };
    }

    if (res.status === 404) {
      return { valid: false, reason: 'Message not found — wrong ID or different webhook' };
    }

    if (!res.ok) {
      return { valid: false, reason: `Failed: ${res.status}` };
    }

    const data = await res.json();
    const currentId = extractWebhookId(url);
    if (data.webhook_id && currentId && data.webhook_id !== currentId) {
      return { valid: false, reason: 'Message belongs to a different webhook — you can only edit messages sent by this webhook' };
    }
    return { valid: true, data };
  } catch (e) {
    return { valid: false, reason: 'Network error — check your connection' };
  }
}
