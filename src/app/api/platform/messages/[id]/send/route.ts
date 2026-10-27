import { createHash } from 'node:crypto';
import { requireSession, sameOrigin, readJson, apiResponse, handleError, PlatformError } from '@/lib/platform/http';
import { requireGuild } from '@/lib/platform/discord';
import { PlatformRepository } from '@/lib/platform/repository';
import { prepareDelivery, deliverPrepared } from '@/lib/platform/delivery';
import { DiscordRestError } from '@/lib/bot/rest';
import { SNOWFLAKE } from '@/lib/bot/validation';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  let operationId: string | undefined; let ownerId: string | undefined; let started = false;
  let repository: PlatformRepository | undefined;
  let binding: Record<string, unknown> | undefined;
  try {
    sameOrigin(request); const session = await requireSession(request); ownerId = session.user.id;
    repository = new PlatformRepository();
    const body = await readJson(request); const item = await repository.get('messages', ownerId, (await context.params).id);
    if (!item) throw new PlatformError('This message was not found.', 404);
    const guildId = String(body.guildId || item.guildId); const channelId = String(body.channelId || item.channelId);
    await requireGuild(request.headers, guildId, true);
    if (body.mode !== undefined && body.mode !== 'send' && body.mode !== 'edit') throw new PlatformError('Choose whether to send a new message or update the sent copy.');
    const mode = body.mode === 'edit' ? 'edit' : 'send';
    const editMessageId = body.mode === 'edit' ? item.lastMessageId : undefined;
    if (body.mode === 'edit' && (!editMessageId || (item as unknown as { lastChannelId?: string }).lastChannelId !== channelId)) throw new PlatformError('This message has no sent copy in the chosen channel.');
    const requestId = body.requestId;
    if (typeof requestId !== 'string' || !/^[\w-]{1,64}$/.test(requestId)) throw new PlatformError('This send request is invalid.');
    operationId = `${ownerId}:${requestId}`;
    binding = { savedMessageId: item.id, guildId, channelId, mode, ...(editMessageId ? { editMessageId } : {}) };
    let failedSnapshot: string | undefined;
    const previousReceipt = async () => {
      const previous = await repository!.db.selectFrom('platform_event').select('data').where('id', '=', operationId!).where('owner_id', '=', ownerId!).executeTakeFirst();
      if (!previous) return null;
      const receipt = JSON.parse(previous.data) as Record<string, unknown>;
      const same = Object.entries(binding!).every(([key, value]) => receipt[key] === value);
      if (same && receipt.status === 'sent' && typeof receipt.messageId === 'string') return receipt;
      if (same && receipt.status === 'failed' && receipt.safeToRetry === true) { failedSnapshot = previous.data; return null; }
      throw new PlatformError(same ? 'This send was already attempted. Check the Discord channel before trying again.' : 'This request ID was already used for a different message, channel, or operation.', 409);
    };
    const savedReceipt = await previousReceipt();
    if (savedReceipt) return apiResponse(savedReceipt);
    const delivery = await prepareDelivery(ownerId, guildId, channelId, item.payload, item.actionIds, { editMessageId });
    const pending = JSON.stringify({ ...binding, status: 'sending' });
    const inserted = failedSnapshot
      ? await repository.db.updateTable('platform_event').set({ data: pending }).where('id', '=', operationId).where('owner_id', '=', ownerId).where('data', '=', failedSnapshot).returning('id').executeTakeFirst()
      : await repository.db.insertInto('platform_event').values({ id: operationId, owner_id: ownerId, kind: 'delivery', data: pending, created_at: new Date().toISOString() })
        .onConflict(conflict => conflict.column('id').doNothing()).returning('id').executeTakeFirst();
    if (!inserted) {
      const receipt = await previousReceipt();
      if (receipt) return apiResponse(receipt);
      throw new PlatformError('This send could not be reserved. Try again shortly.', 409);
    }
    started = true;
    const result = await deliverPrepared(delivery, channelId, { nonce: createHash('sha256').update(operationId).digest('hex').slice(0, 24), editMessageId });
    if (!result || !SNOWFLAKE.test(result.id)) throw new Error('Discord did not return a valid delivery receipt.');
    const receipt = { ...binding, status: 'sent', messageId: result.id, sentAt: new Date().toISOString() };
    await repository.db.updateTable('platform_event').set({ data: JSON.stringify(receipt) }).where('id', '=', operationId).execute();
    // Store against the latest document; never overwrite edits made while Discord was sending.
    for (let attempt = 0; attempt < 3; attempt++) {
      const latest = await repository.get('messages', ownerId, item.id); if (!latest) break;
      try { await repository.put('messages', ownerId, { ...latest, lastMessageId: result.id, lastSentAt: receipt.sentAt, lastChannelId: channelId }, latest); break; }
      catch (error) { if (!(error instanceof PlatformError) || error.status !== 409) break; }
    }
    return apiResponse(receipt);
  } catch (error) {
    const rejected = error instanceof DiscordRestError && error.status < 500;
    if (started && operationId && ownerId && repository) await repository.db.updateTable('platform_event').set({ data: JSON.stringify({ ...binding,
      status: rejected ? 'failed' : 'uncertain', ...(rejected ? { safeToRetry: true } : {}), error: rejected ? error.message : 'Delivery did not return a saved receipt. Check Discord before retrying.' }) }).where('id', '=', operationId).where('owner_id', '=', ownerId).execute().catch(() => {});
    if (error instanceof DiscordRestError) return apiResponse({ error: error.message, ...(error.retryAfterMs ? { retryAfterMs: error.retryAfterMs } : {}) }, error.status === 429 ? 429 : error.status === 403 ? 403 : error.status >= 500 ? 502 : 400);
    return handleError(error);
  }
}
