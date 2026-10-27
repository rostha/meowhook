import type { DiscordObject } from './types';

export const BOT_CREATE_FLAGS = 4 | 4096 | 32768;
export const BOT_V2_FLAG = 32768;

/** Bot sends cannot impersonate a webhook or carry arbitrary interaction-only flags. */
export function sanitizeBotMessagePayload(source: DiscordObject): DiscordObject {
  const flags = typeof source.flags === 'number' && Number.isSafeInteger(source.flags) && source.flags >= 0 ? source.flags & BOT_CREATE_FLAGS : 0;
  const result: DiscordObject = { allowed_mentions: { parse: [] } };
  for (const key of ['content', 'embeds', 'components', 'attachments', 'tts']) if (source[key] !== undefined) result[key] = source[key];
  if (flags) result.flags = flags;
  if (flags & BOT_V2_FLAG) { delete result.content; delete result.embeds; }
  return result;
}

/** Replacing a saved document must also clear fields removed since its previous send. */
export function botEditPayload(source: DiscordObject, previousFlags: number): DiscordObject {
  const next = sanitizeBotMessagePayload(source);
  const nextFlags = typeof next.flags === 'number' ? next.flags : 0;
  const wasV2 = Boolean(previousFlags & BOT_V2_FLAG);
  const isV2 = Boolean(nextFlags & BOT_V2_FLAG);
  if (wasV2 && !isV2) throw new Error('Discord cannot turn an existing Components V2 message back into a regular message. Send this version as a new message.');
  const preserved = previousFlags & ~(4 | BOT_V2_FLAG);
  return {
    content: isV2 ? null : next.content ?? '',
    embeds: isV2 ? [] : next.embeds ?? [],
    components: next.components ?? [],
    attachments: next.attachments ?? [],
    flags: preserved | (nextFlags & (4 | BOT_V2_FLAG)),
    ...(isV2 && !wasV2 ? { poll: null, sticker_ids: [] } : {}),
    allowed_mentions: { parse: [] },
  };
}
