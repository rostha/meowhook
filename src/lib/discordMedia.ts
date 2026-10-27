import type { DiscordComponentPayload, DiscordWebhookEditPayload } from './types';

/** Discord refreshes unsigned attachment URLs when accepting webhook media. Keep signed URLs in the preview. */
export function discordMediaUrlForPayload(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' && (parsed.hostname === 'cdn.discordapp.com' || parsed.hostname === 'media.discordapp.net') && parsed.pathname.startsWith('/attachments/')) {
      return `${parsed.origin}${parsed.pathname}`;
    }
  } catch { /* Local uploads and attachment references are not HTTP URLs. */ }
  return url;
}

function normalizeComponents(components: DiscordComponentPayload[]): DiscordComponentPayload[] {
  return components.map(component => {
    if (component.type === 17) return { ...component, components: normalizeComponents(component.components) };
    if (component.type === 9 && component.accessory.type === 11) return { ...component, accessory: { ...component.accessory, media: { url: discordMediaUrlForPayload(component.accessory.media.url) } } };
    if (component.type === 12) return { ...component, items: component.items.map(item => ({ ...item, media: { url: discordMediaUrlForPayload(item.media.url) } })) };
    if (component.type === 13) return { ...component, file: { url: discordMediaUrlForPayload(component.file.url) } };
    return component;
  });
}

/** Only media URLs are normalized; external signatures, message text and link destinations stay intact. */
export function normalizeDiscordMediaPayload<T extends DiscordWebhookEditPayload>(payload: T): T {
  return {
    ...payload,
    ...(payload.avatar_url ? { avatar_url: discordMediaUrlForPayload(payload.avatar_url) } : {}),
    ...(payload.embeds ? { embeds: payload.embeds.map(embed => ({
      ...embed,
      ...(embed.image ? { image: { ...embed.image, url: discordMediaUrlForPayload(embed.image.url) } } : {}),
      ...(embed.thumbnail ? { thumbnail: { ...embed.thumbnail, url: discordMediaUrlForPayload(embed.thumbnail.url) } } : {}),
      ...(embed.author?.icon_url ? { author: { ...embed.author, icon_url: discordMediaUrlForPayload(embed.author.icon_url) } } : {}),
      ...(embed.footer?.icon_url ? { footer: { ...embed.footer, icon_url: discordMediaUrlForPayload(embed.footer.icon_url) } } : {}),
    })) } : {}),
    ...(payload.components ? { components: normalizeComponents(payload.components) } : {}),
  };
}
