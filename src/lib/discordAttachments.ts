type DiscordAttachment = Record<string, unknown> & { id: string };
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};

/** The visible attachment list excludes uploads used inside components. attachment_id identifies those files. */
export function discordMessageAttachments(data: Record<string, unknown>): DiscordAttachment[] {
  const files = new Map<string, DiscordAttachment>();
  for (const value of Array.isArray(data.attachments) ? data.attachments : []) {
    const file = record(value);
    if (typeof file.id === 'string') files.set(file.id, { ...file, id: file.id });
  }
  const addMedia = (value: unknown) => {
    const media = record(value);
    if (typeof media.attachment_id !== 'string' || files.has(media.attachment_id) || typeof media.url !== 'string' || !media.url) return;
    let filename: string;
    try {
      filename = media.url.startsWith('attachment://') ? media.url.slice(13) : decodeURIComponent(new URL(media.url).pathname.split('/').pop() ?? '');
    } catch { return; }
    if (!filename) return;
    files.set(media.attachment_id, {
      id: media.attachment_id, filename, url: media.url,
      ...(typeof media.proxy_url === 'string' ? { proxy_url: media.proxy_url } : {}),
      ...(typeof media.content_type === 'string' ? { content_type: media.content_type } : {}),
    });
  };
  const visit = (values: unknown, depth = 0) => {
    if (!Array.isArray(values) || depth > 8) return;
    for (const value of values) {
      const component = record(value);
      if (component.type === 17) visit(component.components, depth + 1);
      if (component.type === 9) addMedia(record(component.accessory).media);
      if (component.type === 12 && Array.isArray(component.items)) component.items.forEach(item => addMedia(record(item).media));
      if (component.type === 13) addMedia(component.file);
    }
  };
  visit(data.components);
  return [...files.values()];
}
