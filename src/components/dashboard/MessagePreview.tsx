'use client';

import { ComponentsPreview, LinkButtonsPreview } from '@/components/editor/ComponentsPreview';
import { buttonEmoji, isComponentsV2 } from '@/lib/messageComponents';
import { parseDiscordMarkdownForPreview, parseDiscordEmbedTitleForPreview, parseDiscordEmbedFieldForPreview, parseDiscordEmbedAuthorForPreview, parseDiscordEmbedFooterForPreview } from '@/lib/markdown';
import { intToHex } from '@/lib/utils';
import type { Message } from '@/lib/types';
import type { SavedAction } from '@/lib/platform/types';
import styles from './dashboard.module.css';

const safeUrl = (value?: string) => typeof value === 'string' && /^(https?:|blob:)/i.test(value) ? value : undefined;

export default function MessagePreview({ message, actions }: { message: Message; actions: SavedAction[] }) {
  const hasText = message.content.trim() || message.embeds.length || message.componentBlocks?.length;
  return <div className={styles.messagePreview} aria-label="Message preview">
    <header><span className={styles.avatar}><img src={encodeURI('/MEAWHOOK ICON WHITE.svg')} alt="" width={23} height={23} /></span><strong>Meowhook</strong><span className={styles.badge} data-tone="accent">APP</span><small>Today</small></header>
    <div className={styles.messagePreviewBody}>
      {isComponentsV2(message) ? <ComponentsPreview blocks={message.componentBlocks ?? []} attachments={message._attachments ?? []} /> : <>
        {message.content && <div className="discord-markdown" dangerouslySetInnerHTML={{ __html: parseDiscordMarkdownForPreview(message.content) }} />}
        {message.embeds.map(embed => <div key={embed.id} className={styles.previewEmbed} style={{ borderLeftColor: embed.colorExplicit === false ? 'var(--border)' : intToHex(embed.color) }}>
          {embed.thumbnail.url && <img className={styles.previewThumbnail} src={safeUrl(embed.thumbnail.url)} alt="Embed thumbnail" />}
          {embed.author.name && <div className={styles.previewAuthor}>{safeUrl(embed.author.icon_url) && <img src={safeUrl(embed.author.icon_url)} alt="" />}<span dangerouslySetInnerHTML={{ __html: parseDiscordEmbedAuthorForPreview(embed.author.name) }} /></div>}
          {embed.title && <strong className={styles.previewEmbedTitle} dangerouslySetInnerHTML={{ __html: parseDiscordEmbedTitleForPreview(embed.title) }} />}
          {embed.description && <div className="discord-markdown" dangerouslySetInnerHTML={{ __html: parseDiscordMarkdownForPreview(embed.description) }} />}
          {!!embed.fields.length && <dl className={styles.previewFields}>{embed.fields.map(field => <div key={field.id} data-inline={field.inline}><dt dangerouslySetInnerHTML={{ __html: parseDiscordEmbedFieldForPreview(field.name) }} /><dd className="discord-markdown" dangerouslySetInnerHTML={{ __html: parseDiscordEmbedFieldForPreview(field.value) }} /></div>)}</dl>}
          {safeUrl(embed.image.url) && <img className={styles.previewEmbedImage} src={safeUrl(embed.image.url)} alt="Embed image" />}
          {(embed.footer.text || embed.timestamp) && <footer>{safeUrl(embed.footer.icon_url) && <img src={safeUrl(embed.footer.icon_url)} alt="" />}{embed.footer.text && <span dangerouslySetInnerHTML={{ __html: parseDiscordEmbedFooterForPreview(embed.footer.text) }} />}{embed.footer.text && embed.timestamp && <span>·</span>}{embed.timestamp && <span>{new Date(embed.timestamp).toLocaleString()}</span>}</footer>}
        </div>)}
        <LinkButtonsPreview buttons={message.linkButtons ?? []} />
        {message._attachments?.filter(file => file.fieldKey.startsWith('content_file')).map(file => <div key={file.previewUrl} className={styles.previewFile}>{file.mimeType?.startsWith('image/') ? <img className={styles.previewAttachment} src={safeUrl(file.previewUrl)} alt={file.name ?? 'Attached image'} /> : file.mimeType?.startsWith('video/') ? <video className={styles.previewAttachment} controls preload="metadata" src={safeUrl(file.previewUrl)} /> : file.mimeType?.startsWith('audio/') ? <audio controls preload="metadata" src={safeUrl(file.previewUrl)} /> : file.name ?? file.file?.name ?? 'Attached file'}</div>)}
      </>}
      {actions.length > 0 && <div className={styles.previewActions}>{actions.map(action => {
        if (action.type === 'role' && action.selection !== 'buttons') return <select key={action.id} aria-label={action.label} disabled><option>{action.label}</option>{action.options?.map(option => <option key={option.value}>{option.label}</option>)}</select>;
        const labels = action.type === 'role' ? action.options ?? action.roleIds?.map(id => ({ value: id, label: 'Role' })) ?? [] : [{ value: action.id, label: action.label }];
        const emoji = buttonEmoji(action.emoji);
        return labels.map(option => <button type="button" disabled key={`${action.id}-${option.value}`} style={{ background: action.style === 1 ? '#5865f2' : action.style === 3 ? '#248046' : action.style === 4 ? '#da373c' : undefined, color: 'white' }}>{emoji && (emoji.id ? <img src={`https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? 'gif' : 'webp'}?size=32`} alt={emoji.name ?? 'Emoji'} width={16} height={16} /> : <span>{emoji.name}</span>)}{option.label}</button>);
      })}</div>}
      {!hasText && !actions.length && <p className={styles.helper}>Your message preview will appear here.</p>}
      <p className={styles.previewNote}>Preview only · Discord may display some details differently.</p>
    </div>
  </div>;
}
