'use client';
import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import type { ComponentBlock, LinkButton, FileAttachment } from '@/lib/types';
import { parseDiscordMarkdownForPreview } from '@/lib/markdown';
import { validComponentUrl, buttonEmoji, sectionTexts, hasComponentPreviewContent } from '@/lib/messageComponents';
import { componentPreviewUrl, findComponentAttachment } from '@/lib/componentAttachments';
import { IconPaperclip, IconDownload } from '@/components/MeowIcons';

function Spoiler({ hidden, children }: { hidden?: boolean; children: ReactNode }) {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => setRevealed(false), [hidden]);
  if (!hidden) return <>{children}</>;
  return <div className="discord-component-spoiler" data-concealed={!revealed || undefined}>
    <div aria-hidden={!revealed || undefined} inert={!revealed}>{children}</div>
    {!revealed && <button type="button" onClick={event => { event.stopPropagation(); setRevealed(true); }}>Reveal spoiler</button>}
  </div>;
}

export function LinkButtonsPreview({ buttons, onJump }: { buttons: LinkButton[]; onJump?: (index: number) => void }) {
  if (!buttons.length) return null;
  return <div className="discord-link-buttons">{buttons.map((button, index) => {
    const emoji = buttonEmoji(button.emoji);
    return <a key={button.id} href={!button.disabled && validComponentUrl(button.url) ? button.url : undefined} target="_blank" rel="noopener noreferrer" title={onJump ? 'Edit this link button' : undefined} aria-disabled={button.disabled || (!validComponentUrl(button.url) && !onJump)} onClick={event => {
      if (onJump) { event.preventDefault(); event.stopPropagation(); onJump(index); }
      else if (button.disabled || !validComponentUrl(button.url)) event.preventDefault();
    }}>{emoji && (emoji.id ? <img className="discord-button-emoji" src={`https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? 'gif' : 'webp'}?size=32`} alt={emoji.name ?? 'Emoji'} loading="lazy" /> : <span>{emoji.name}</span>)}{button.label || (!emoji ? 'Link button' : '')}<span aria-hidden="true">↗</span></a>;
  })}</div>;
}

export function ComponentsPreview({ blocks, nested = false, onJump, attachments = [] }: { blocks: ComponentBlock[]; nested?: boolean; onJump?: (blockId: string, inputLabel?: string) => void; attachments?: FileAttachment[] }) {
  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!onJump || !(event.target instanceof HTMLElement) || event.target.closest('a, button, audio, video, input, textarea, select') || window.getSelection()?.toString().trim()) return;
    const block = event.target.closest<HTMLElement>('[data-component-preview-id]');
    if (!block || !event.currentTarget.contains(block)) return;
    const inputLabel = event.target.closest<HTMLElement>('[data-component-input-label]')?.dataset.componentInputLabel ?? block.dataset.componentInputLabel;
    onJump(block.dataset.componentPreviewId!, inputLabel);
  };
  const safePreview = (value: string) => validComponentUrl(value) || value.startsWith('blob:');
  return <div className={nested ? 'discord-components discord-components--nested' : 'discord-components'} data-component-jump-enabled={onJump ? true : undefined} onClick={nested ? undefined : handleClick}>{blocks.filter(block => hasComponentPreviewContent([block])).map(block => {
    switch (block.type) {
      case 'text': return <div key={block.id} data-component-preview-id={block.id} data-component-input-label="Component text" className="discord-component-text discord-component-jump" dangerouslySetInnerHTML={{ __html: parseDiscordMarkdownForPreview(block.content) }} />;
      case 'section': { const url = componentPreviewUrl(block.url, attachments); return <div key={block.id} data-component-preview-id={block.id} data-component-input-label="Section text" className="discord-component-section discord-component-jump"><div className="discord-component-section-texts">{sectionTexts(block).map((content, index) => <div key={index} data-component-input-label={index ? `Section text ${index + 1}` : 'Section text'} className="discord-component-text" dangerouslySetInnerHTML={{ __html: parseDiscordMarkdownForPreview(content) }} />)}</div>
        {block.accessory === 'link' ? <LinkButtonsPreview buttons={[block.button ?? { id: block.id, label: '', url: '' }]} onJump={onJump ? () => onJump(block.id, 'Link 1 label') : undefined} /> : <Spoiler hidden={block.spoiler}>{safePreview(url) ? <img data-component-input-label="Thumbnail URL" src={url} alt={block.description} loading="lazy" /> : <div data-component-input-label="Thumbnail URL" className="discord-component-image-placeholder">Image</div>}</Spoiler>}
      </div>; }
      case 'gallery': return <div key={block.id} data-component-preview-id={block.id} data-item-count={block.items.length} className="discord-component-gallery discord-component-jump">{block.items.map((item, index) => {
        const url = componentPreviewUrl(item.url, attachments), attachment = findComponentAttachment(item.url, attachments);
        const video = (item.mimeType ?? attachment?.file?.type ?? attachment?.mimeType ?? '').startsWith('video/') || /\.(mp4|webm|mov)(?:[?#]|$)/i.test(url);
        const label = `Gallery image ${index + 1} URL`;
        return <div key={item.id} data-component-input-label={label}><Spoiler hidden={item.spoiler}>{safePreview(url) ? video ? <><video src={url} controls playsInline preload="metadata" aria-label={item.description || `Gallery video ${index + 1}`} />{onJump && <button type="button" className="discord-media-edit" onClick={() => onJump(block.id, label)}>Edit video</button>}</> : <img src={url} alt={item.description} loading="lazy" /> : <div className="discord-component-image-placeholder">Media</div>}</Spoiler></div>;
      })}</div>;
      case 'file': { const file = findComponentAttachment(block.url, attachments); const url = componentPreviewUrl(block.url, attachments); const name = file?.file?.name ?? file?.name ?? (block.url.startsWith('attachment://') ? block.url.slice(13) : 'Choose a file'); return <div key={block.id} data-component-preview-id={block.id} data-component-input-label="File attachment" className="discord-component-jump"><Spoiler hidden={block.spoiler}><a className="discord-component-file" href={safePreview(url) ? url : undefined} target="_blank" rel="noopener noreferrer" download onClick={event => { if (onJump) { event.preventDefault(); event.stopPropagation(); onJump(block.id, 'File attachment'); } else if (!safePreview(url)) event.preventDefault(); }}><IconPaperclip size={22} aria-hidden /><span><strong>{name}</strong><small>{file?.size !== undefined ? `${(file.size / 1024).toFixed(1)} KB` : 'File attachment'}</small></span><IconDownload size={18} aria-hidden /></a></Spoiler></div>; }
      case 'separator': return <div key={block.id} data-component-preview-id={block.id} data-component-input-label="Show separator line" className={`discord-component-separator discord-component-jump ${block.spacing === 2 ? 'is-large' : ''}`}>{block.divider && <hr />}</div>;
      case 'container': return <Spoiler key={block.id} hidden={block.spoiler}><div data-component-preview-id={block.id} data-component-input-label={block.colorExplicit === false ? 'Show accent color' : 'Container accent color'} className="discord-component-container discord-component-jump" style={{ borderLeftColor: '#' + block.color.toString(16).padStart(6, '0'), borderLeftWidth: block.colorExplicit === false ? 0 : undefined }}><ComponentsPreview blocks={block.blocks} nested onJump={onJump} attachments={attachments} /></div></Spoiler>;
      case 'links': return <LinkButtonsPreview key={block.id} buttons={block.buttons} onJump={onJump ? index => onJump(block.id, `Link ${index + 1} label`) : undefined} />;
    }
  })}</div>;
}
