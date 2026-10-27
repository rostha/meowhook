/** Shared by link creation and retrieval; accepts editable drafts, including unfinished V2 layouts. */
function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

export function validateSharedMessageShape(msg: unknown): boolean {
  if (!isPlainObject(msg)) return false;
  const allowed = new Set(['id', 'content', 'username', 'avatar_url', 'tts', 'embeds', 'flags', 'thread_name', 'components', 'componentMode', 'componentBlocks', 'linkButtons']);
  for (const key of Object.keys(msg)) {
    if (!allowed.has(key)) return false;
  }
  if (msg.id !== undefined && typeof msg.id !== 'string') return false;
  if (msg.content !== undefined && typeof msg.content !== 'string') return false;
  if (msg.username !== undefined && typeof msg.username !== 'string') return false;
  if (msg.avatar_url !== undefined && typeof msg.avatar_url !== 'string') return false;
  if (msg.tts !== undefined && typeof msg.tts !== 'boolean') return false;
  if (msg.flags !== undefined && typeof msg.flags !== 'number') return false;
  if (msg.thread_name !== undefined && typeof msg.thread_name !== 'string') return false;
  if (msg.embeds !== undefined && !Array.isArray(msg.embeds)) return false;
  if (msg.components !== undefined && !Array.isArray(msg.components)) return false;
  if (msg.componentMode !== undefined && msg.componentMode !== 'standard' && msg.componentMode !== 'v2') return false;
  if (msg.componentBlocks !== undefined && !Array.isArray(msg.componentBlocks)) return false;
  if (msg.linkButtons !== undefined && !Array.isArray(msg.linkButtons)) return false;
  return true;
}
