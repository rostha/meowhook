import type { Tab } from './types';
import { createDefaultEmbed, createDefaultMessage, uid } from './utils';
import { DEFAULT_CONTAINER_ACCENT } from './messageComponents';

const oldContent = '**Welcome to Meowhook.**\nThis is an example draft. Change a word here and see it update in the preview.';
const oldDescription = 'Give an update a clear title, a little context, or an image. Change anything on this card and watch the preview respond.';
const previousWelcomeAccent = 0x8996a8;
const oldFields = [
  { name: 'Make it yours', value: 'Replace this example with an announcement, a welcome note, or something entirely your own.' },
  { name: 'Ready to send?', value: 'Paste your Discord webhook URL above, check the preview, then press **Send**.' },
];
const WELCOME_USERNAME = 'Meowhook';
const WELCOME_AVATAR_URL = 'https://i.pinimg.com/736x/b4/07/8d/b4078d3649e49e0c193eed09d738f061.jpg';

const welcomeContent = '**Welcome to Meowhook!**\nThis example shows you around. Edit this text on the left, then follow the steps below to send your own message.';
const welcomeDescription = [
  '**1 · Write your message**',
  'Open **Content** on the left and replace the welcome text. The preview updates while you type.',
  '',
  '**2 · Add the details**',
  'Open **Embeds** to change this card’s color or add your own title, description, image, thumbnail, or fields. Use **Files** for attachments.',
  '',
  '**3 · Connect Discord**',
  'In Discord, go to **Server Settings → Integrations → Webhooks**. Create a webhook, choose its channel, and copy its URL. Paste it into **Webhook URL** above the editor. Keep that URL private.',
  '',
  '**4 · Check, then send**',
  'Read the live preview and fix any warnings. Press **Send** at the bottom; your message appears in the chosen Discord channel.',
  '',
  '**5 · Keep building**',
  'Use **Add Message** for a sequence. Drafts save in this browser; the sidebar has backups, **Import JSON**, **Export**, and **Share**. **Templates** and **JSON** are in the top bar. **Advanced V2 components** is optional for custom layouts.',
  '',
  'Want a closer look? Open **Docs** above. **New** starts a blank draft.',
].join('\n');

/** An editable first-run example. New drafts and reset drafts remain blank. */
export function createWelcomeDraft(webhookUrl = ''): Tab {
  const embed = createDefaultEmbed();
  embed.color = DEFAULT_CONTAINER_ACCENT;
  embed.description = welcomeDescription;

  return {
    id: uid(),
    name: 'Welcome example',
    webhookUrl,
    messages: [{
      ...createDefaultMessage(),
      username: WELCOME_USERNAME,
      avatar_url: WELCOME_AVATAR_URL,
      content: welcomeContent,
      embeds: [embed],
    }],
  };
}

/** Refresh only the exact old sample, preserving IDs and all user-edited drafts. */
export function upgradeUntouchedWelcomeDraft(tab: Tab): Tab {
  if (tab.webhookUrl || tab.messages.length !== 1) return tab;
  const message = tab.messages[0];
  const currentEmbed = message.embeds[0];
  if (
    tab.name === 'Welcome example' && message.content === welcomeContent && message.embeds.length === 1 &&
    !message.componentBlocks?.length && !message.linkButtons?.length && !message.loadedFromMessageId &&
    currentEmbed.description === welcomeDescription &&
    (currentEmbed.color === previousWelcomeAccent || currentEmbed.color === DEFAULT_CONTAINER_ACCENT) &&
    (!message.username || message.username === WELCOME_USERNAME) &&
    (!message.avatar_url || message.avatar_url === WELCOME_AVATAR_URL) &&
    !currentEmbed.title && !currentEmbed.fields.length && !currentEmbed.image.url && !currentEmbed.thumbnail.url
  ) {
    if (currentEmbed.color === DEFAULT_CONTAINER_ACCENT && message.username === WELCOME_USERNAME && message.avatar_url === WELCOME_AVATAR_URL) return tab;
    return { ...tab, messages: [{ ...message, username: WELCOME_USERNAME, avatar_url: WELCOME_AVATAR_URL, embeds: [{ ...currentEmbed, color: DEFAULT_CONTAINER_ACCENT }] }] };
  }
  if (message.content !== oldContent || message.embeds.length !== 1 || message.username || message.avatar_url || message.tts || message.flags || message.componentMode === 'v2' || message._attachments?.length || message.linkButtons?.length || message.componentBlocks?.length || message.components) return tab;
  const embed = message.embeds[0];
  if (
    embed.title !== 'A message, shaped your way' || embed.description !== oldDescription || embed.color !== previousWelcomeAccent ||
    embed.url || embed.timestamp || embed.author.name || embed.author.url || embed.author.icon_url ||
    embed.thumbnail.url || embed.image.url || embed.footer.icon_url ||
    embed.footer.text !== 'Drafts save in this browser · New starts with a blank page' ||
    embed.fields.length !== oldFields.length ||
    !embed.fields.every((field, index) => field.name === oldFields[index].name && field.value === oldFields[index].value && !field.inline)
  ) return tab;

  return {
    ...tab,
    messages: [{
      ...message,
      username: WELCOME_USERNAME,
      avatar_url: WELCOME_AVATAR_URL,
      content: welcomeContent,
      embeds: [{ ...embed, title: '', description: welcomeDescription, color: DEFAULT_CONTAINER_ACCENT, fields: [], footer: { text: '', icon_url: '' } }],
    }],
  };
}
