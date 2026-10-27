'use client';
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Reorder, useDragControls, type DragControls } from 'framer-motion';
import { AnimatedEditorList, AnimatedEditorRow } from '@/components/AnimatedEditorList';
import TextFieldWithQuickActions from '@/components/TextFieldWithQuickActions';
import ColorPicker from '@/components/ColorPicker';
import MediaSourceControl from '@/components/MediaSourceControl';
import MediaGalleryEditor from './MediaGalleryEditor';
import OptionCheck from './ComponentOptionCheck';
import { IconAlert, IconArrowDown, IconArrowUp, IconGrip, IconTrash } from '@/components/MeowIcons';
import { useUiMotion } from '@/lib/useUiMotion';
import type { ComponentBlock, LinkButton, Message, FileAttachment } from '@/lib/types';
import { isComponentsV2, newBlock, regularMessageToV2Blocks, componentBudget, DEFAULT_CONTAINER_ACCENT, validateComponentBlocks } from '@/lib/messageComponents';
import { validationTarget } from '@/lib/validationTarget';
import { componentAttachmentUrl, componentPreviewUrl, findComponentAttachment } from '@/lib/componentAttachments';
import { hexToInt, intToHex, uid } from '@/lib/utils';
import { getUploadSizeError, UPLOAD_LIMIT_LABEL } from '@/lib/uploadLimits';
import LimitCounter from '@/components/LimitCounter';

const TYPES: { type: ComponentBlock['type']; name: string; description: string; accessory?: 'link' }[] = [
  { type: 'text', name: 'Text', description: 'Markdown text' },
  { type: 'section', name: 'Text + thumbnail', description: 'Text beside an image' },
  { type: 'section', accessory: 'link', name: 'Text + link button', description: 'Text beside a website link' },
  { type: 'gallery', name: 'Media gallery', description: 'One to ten images or videos' },
  { type: 'file', name: 'File', description: 'A downloadable attachment' },
  { type: 'separator', name: 'Separator', description: 'A line or space' },
  { type: 'container', name: 'Container', description: 'Group blocks in a card' },
  { type: 'links', name: 'Link buttons', description: 'Open websites' },
];

const newBlockCost = (type: ComponentBlock['type']) => type === 'section' ? 3 : type === 'container' || type === 'links' ? 2 : 1;

function LinkButtonFields({ buttons, onChange, max, removable = true, remainingComponents = Infinity }: { buttons: LinkButton[]; onChange: (buttons: LinkButton[]) => void; max: number; removable?: boolean; remainingComponents?: number }) {
  const update = (id: string, change: Partial<LinkButton>) => onChange(buttons.map(button => button.id === id ? { ...button, ...change } : button));
  return <div className="component-link-list">
    {removable && <div className="editor-budget editor-budget--compact"><span>Link buttons</span><LimitCounter count={buttons.length} limit={max} label="Link buttons" unit="buttons" /></div>}
    <AnimatedEditorList gap={0}>{buttons.map((button, index) => <AnimatedEditorRow key={button.id}><div className="component-link-row">
      <label><span className="editor-field-label"><span>Label</span><LimitCounter count={button.label.length} limit={80} label={`Link ${index + 1} label`} /></span><input aria-label={`Link ${index + 1} label`} value={button.label} maxLength={80} placeholder="Visit website" onChange={event => update(button.id, { label: event.target.value })} /></label>
      <label><span className="editor-field-label"><span>Destination URL</span><LimitCounter count={button.url.length} limit={512} label={`Link ${index + 1} URL`} /></span><input aria-label={`Link ${index + 1} URL`} value={button.url} maxLength={512} placeholder="https://example.com" onChange={event => update(button.id, { url: event.target.value })} /></label>
      {removable && <button type="button" className="component-remove" aria-label={`Remove link ${index + 1}`} onClick={() => onChange(buttons.filter(item => item.id !== button.id))}>Remove</button>}
      <details className="component-button-options"><summary>Button options</summary><div>
        <label><span className="editor-field-label"><span>Emoji</span><LimitCounter count={button.emoji?.length ?? 0} limit={70} label={`Link ${index + 1} emoji input`} /></span><span className="component-help">Paste an emoji or a Discord custom emoji</span><input aria-label={`Link ${index + 1} emoji`} value={button.emoji ?? ''} maxLength={70} placeholder="Optional" onChange={event => update(button.id, { emoji: event.target.value })} /></label>
        <OptionCheck label="Disabled" ariaLabel={`Link ${index + 1} disabled`} checked={!!button.disabled} onChange={disabled => update(button.id, { disabled })} />
      </div></details>
    </div></AnimatedEditorRow>)}</AnimatedEditorList>
    {buttons.length < max && <button type="button" className="component-add" disabled={remainingComponents < 1} title={remainingComponents < 1 ? 'This message has reached its 40-component limit' : undefined} onClick={() => onChange([...buttons, { id: uid(), label: '', url: '' }])}>+ Add link</button>}
  </div>;
}

function ComponentMediaInput({ label, value, onChange, attachments, fileOnly = false, video = false }: { label: string; value: string; onChange: (url: string, attachment?: FileAttachment) => void; attachments: FileAttachment[]; fileOnly?: boolean; video?: boolean }) {
  const selected = findComponentAttachment(value, attachments);
  const available = attachments.filter(attachment => attachment.fieldKey !== 'avatar' && (fileOnly || (attachment.mimeType ?? attachment.file?.type ?? '').startsWith('image/') || (video && (attachment.mimeType ?? attachment.file?.type ?? '').startsWith('video/'))));
  return <MediaSourceControl label={label} value={selected ? (/^https?:/.test(selected.previewUrl) ? selected.previewUrl : '') : value}
    selected={selected ? { name: selected.file?.name ?? selected.name ?? 'Attached file', size: selected.file?.size ?? selected.size } : undefined}
    previewUrl={componentPreviewUrl(value, attachments)} onChange={url => onChange(url)} fileOnly={fileOnly}
    files={available.map(attachment => ({ value: componentAttachmentUrl(attachment), name: attachment.file?.name ?? attachment.name ?? 'Attached file' }))}
    accept={fileOnly ? '*' : video ? 'image/*,video/*' : 'image/*'}
    hint={fileOnly ? `Up to ${UPLOAD_LIMIT_LABEL} per file` : `${video ? 'Images & video' : 'Images'} · Up to ${UPLOAD_LIMIT_LABEL} per file`}
    onUpload={file => {
      const sizeError = getUploadSizeError(file);
      if (sizeError) throw new Error(sizeError);
      if (!fileOnly && !file.type.startsWith('image/') && !(video && file.type.startsWith('video/'))) throw new Error(video ? 'Choose an image or video.' : 'Choose an image.');
      const attachment = { file, previewUrl: URL.createObjectURL(file), fieldKey: `component_file_${uid()}`, name: file.name, size: file.size, mimeType: file.type };
      onChange(attachment.previewUrl, attachment);
    }} />;
}

function ContainerColorControl({ color, onChange }: { color: number; onChange: (color: number) => void }) {
  const [hex, setHex] = useState(intToHex(color));
  useEffect(() => setHex(intToHex(color)), [color]);
  const apply = () => {
    const match = hex.trim().match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i);
    if (!match) { setHex(intToHex(color)); return; }
    const value = match[1].length === 3 ? [...match[1]].map(character => character + character).join('') : match[1];
    onChange(hexToInt(value));
    setHex('#' + value.toLowerCase());
  };
  return <div className="component-container-color">
    <span>Accent color</span>
    <div className="component-container-color__controls">
      <ColorPicker color={intToHex(color)} onChange={value => onChange(hexToInt(value))} label="Container accent color" />
      <input aria-label="Container accent color" spellCheck={false} value={hex} maxLength={7} onChange={event => setHex(event.target.value)} onBlur={apply} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') setHex(intToHex(color)); }} />
    </div>
  </div>;
}

function BlockReorderRow({ id, children }: { id: string; children: (controls: DragControls) => ReactNode }) {
  const controls = useDragControls();
  const uiMotion = useUiMotion();
  const [dragging, setDragging] = useState(false);
  const activeDrag = useRef(false);
  return <Reorder.Item as="div" value={id} dragListener={false} dragControls={controls}
    layout="position" transition={uiMotion.reorder} dragTransition={uiMotion.dragTransition} dragMomentum={false}
    className="component-reorder-row" data-dragging={dragging || undefined}
    onDragStart={() => { activeDrag.current = true; setDragging(true); }}
    onDragEnd={() => { activeDrag.current = false; }}
    onDragTransitionEnd={() => { if (!activeDrag.current) setDragging(false); }}
    onPointerCancel={() => { activeDrag.current = false; setDragging(false); }}>
    {children(controls)}
  </Reorder.Item>;
}

type ComponentIssue = { blockId?: string; inputLabel?: string; text: string };

function BlockList({ blocks, onChange, attachments, messageBudget, issue, nested = false }: { blocks: ComponentBlock[]; onChange: (blocks: ComponentBlock[], attachment?: FileAttachment) => void; attachments: FileAttachment[]; messageBudget: ReturnType<typeof componentBudget>; issue?: ComponentIssue; nested?: boolean }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerId = useId();
  const remainingComponents = 40 - messageBudget.count;
  const localBudget = nested ? componentBudget(blocks) : messageBudget;
  const update = (id: string, next: ComponentBlock, attachment?: FileAttachment) => onChange(blocks.map(block => block.id === id ? next : block), attachment);
  const blockName = (block: ComponentBlock) => block.type === 'section' && block.accessory === 'link' ? 'Text + link button' : TYPES.find(item => item.type === block.type)?.name;
  const move = (index: number, direction: -1 | 1) => {
    if (index + direction < 0 || index + direction >= blocks.length) return;
    const next = [...blocks]; const [item] = next.splice(index, 1); next.splice(index + direction, 0, item); onChange(next);
  };
  const reorder = (ids: string[]) => {
    const current = new Map(blocks.map(block => [block.id, block]));
    onChange(ids.map(id => current.get(id)).filter((block): block is ComponentBlock => !!block));
  };
  return <div className={nested ? 'component-block-list component-block-list--nested' : 'component-block-list'}>
    {nested && <div className="component-nest-heading"><span>Inside container</span><small title="Included in the shared message budget">{blocks.length} {blocks.length === 1 ? 'block' : 'blocks'} · {localBudget.text.toLocaleString('en-US')} characters</small></div>}
    <Reorder.Group as="div" axis="y" values={blocks.map(block => block.id)} onReorder={reorder} className="component-reorder-list">
    <AnimatedEditorList gap={0}>{blocks.map((block, index) => <AnimatedEditorRow key={block.id}><BlockReorderRow id={block.id}>{controls => <div className={`component-block${block.type === 'container' ? ' component-block--container' : ''}`} data-component-block-id={block.id} style={block.type === 'container' ? { '--container-accent': intToHex(block.colorExplicit === false ? DEFAULT_CONTAINER_ACCENT : block.color) } as CSSProperties : undefined}>
      <div className="component-block__head"><div className="component-block__title">
        <button type="button" className="component-drag-handle" disabled={blocks.length < 2}
          aria-label={`Reorder ${blockName(block)} block ${index + 1}`}
          title="Drag to reorder, or use the arrow keys"
          onPointerDown={event => { event.stopPropagation(); event.preventDefault(); event.currentTarget.focus({ preventScroll: true }); controls.start(event, { snapToCursor: false, distanceThreshold: 4 }); }}
          onKeyDown={event => { if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); event.stopPropagation(); move(index, event.key === 'ArrowUp' ? -1 : 1); } }}>
          <IconGrip size={16} aria-hidden />
        </button>
        <strong>{blockName(block)}</strong>
        {block.type === 'text' && <LimitCounter count={block.content.length} limit={4000} label="Component text" />}
        {block.type === 'gallery' && <LimitCounter count={block.items.length} limit={10} label="Gallery media" unit="items" />}
      </div><div>
        <button type="button" aria-label={`Move ${block.type} up`} disabled={index === 0} onClick={() => move(index, -1)}><IconArrowUp size={14} aria-hidden /></button>
        <button type="button" aria-label={`Move ${block.type} down`} disabled={index === blocks.length - 1} onClick={() => move(index, 1)}><IconArrowDown size={14} aria-hidden /></button>
        <button type="button" aria-label={`Remove ${block.type}`} title={`Remove ${blockName(block)}`} onClick={() => onChange(blocks.filter(item => item.id !== block.id))}><IconTrash size={15} aria-hidden /></button>
      </div></div>
      {block.type === 'text' && <div className="component-text-field"><TextFieldWithQuickActions multiline aria-label="Component text" aria-invalid={issue?.blockId === block.id || undefined} aria-describedby={issue?.blockId === block.id ? `${pickerId}-${block.id}-issue` : undefined} value={block.content} maxLength={4000} rows={4} placeholder="Write your message. Discord markdown is supported." expandedEditorTitle="Component text" onChange={content => update(block.id, { ...block, content })} /></div>}
      {block.type === 'section' && <div className="component-fields">
        <div className="component-separator-spacing" role="group" aria-label="Section accessory"><span>Beside the text</span><div className="component-separator-spacing__choices">
          <button type="button" aria-pressed={block.accessory !== 'link'} onClick={() => update(block.id, { ...block, accessory: 'thumbnail' })}>Thumbnail</button>
          <button type="button" aria-pressed={block.accessory === 'link'} onClick={() => update(block.id, { ...block, accessory: 'link', button: block.button ?? { id: uid(), label: '', url: '' } })}>Link button</button>
        </div></div>
        <div className="component-section-texts">
          <div className="editor-budget editor-budget--compact"><span>Section text blocks</span><LimitCounter count={1 + (block.texts?.length ?? 0)} limit={3} label="Section text blocks" unit="text blocks" /></div>
          <AnimatedEditorList gap={8}>
            <AnimatedEditorRow key="primary"><div className="component-text-field"><span className="editor-field-label"><span>Text</span><LimitCounter count={block.content.length} limit={4000} label="Section text" /></span><TextFieldWithQuickActions multiline aria-label="Section text" value={block.content} maxLength={4000} rows={3} placeholder="Heading and description" expandedEditorTitle="Section text" onChange={content => update(block.id, { ...block, content })} /></div></AnimatedEditorRow>
            {(block.texts ?? []).map((text, textIndex) => <AnimatedEditorRow key={text.id}><div className="component-text-field"><span className="editor-field-label"><span>Text {textIndex + 2}</span><LimitCounter count={text.content.length} limit={4000} label={`Section text ${textIndex + 2}`} /></span><TextFieldWithQuickActions multiline aria-label={`Section text ${textIndex + 2}`} value={text.content} maxLength={4000} rows={2} expandedEditorTitle={`Section text ${textIndex + 2}`} onChange={content => update(block.id, { ...block, texts: block.texts?.map(item => item.id === text.id ? { ...item, content } : item) })} /><button type="button" className="component-remove" aria-label={`Remove section text ${textIndex + 2}`} onClick={() => update(block.id, { ...block, texts: block.texts?.filter(item => item.id !== text.id) })}>Remove text</button></div></AnimatedEditorRow>)}
          </AnimatedEditorList>
          {(block.texts?.length ?? 0) < 2 && <button type="button" className="component-add" disabled={remainingComponents < 1} title={remainingComponents < 1 ? 'This message has reached its 40-component limit' : undefined} onClick={() => update(block.id, { ...block, texts: [...(block.texts ?? []), { id: uid(), content: '' }] })}>+ Add section text</button>}
        </div>
        <AnimatedEditorList gap={0} className="component-section-accessory">
        {block.accessory === 'link' ? <AnimatedEditorRow key="link"><LinkButtonFields buttons={[block.button ?? { id: block.id, label: '', url: '' }]} max={1} removable={false} onChange={buttons => update(block.id, { ...block, button: buttons[0] })} /></AnimatedEditorRow> : <AnimatedEditorRow key="thumbnail"><div className="component-accessory-fields">
          <ComponentMediaInput label="Thumbnail URL" value={block.url} attachments={attachments} onChange={(url, attachment) => update(block.id, { ...block, url }, attachment)} />
          <label><span className="editor-field-label"><span>Image description</span><LimitCounter count={block.description.length} limit={1024} label="Thumbnail description" /></span><input aria-label="Thumbnail description" value={block.description} maxLength={1024} placeholder="Describe the image" onChange={event => update(block.id, { ...block, description: event.target.value })} /></label>
          <OptionCheck label="Hide thumbnail as a spoiler" checked={!!block.spoiler} onChange={spoiler => update(block.id, { ...block, spoiler })} />
        </div></AnimatedEditorRow>}
        </AnimatedEditorList>
      </div>}
      {block.type === 'gallery' && <MediaGalleryEditor items={block.items} attachments={attachments} onChange={(items, attachment) => update(block.id, { ...block, items }, attachment)} />}
      {block.type === 'file' && <div className="component-fields"><ComponentMediaInput label="File attachment" value={block.url} fileOnly attachments={attachments} onChange={(url, attachment) => update(block.id, { ...block, url }, attachment)} /><OptionCheck label="Hide file as a spoiler" checked={!!block.spoiler} onChange={spoiler => update(block.id, { ...block, spoiler })} /></div>}
      {block.type === 'separator' && <div className="component-separator-options">
        <OptionCheck label="Show line" ariaLabel="Show separator line" checked={block.divider} onChange={divider => update(block.id, { ...block, divider })} />
        <div className="component-separator-spacing" role="group" aria-label="Separator spacing">
          <span>Spacing</span>
          <div className="component-separator-spacing__choices">
            <button type="button" aria-pressed={block.spacing === 1} onClick={() => update(block.id, { ...block, spacing: 1 })}>Small</button>
            <button type="button" aria-pressed={block.spacing === 2} onClick={() => update(block.id, { ...block, spacing: 2 })}>Large</button>
          </div>
        </div>
      </div>}
      {block.type === 'container' && <div className="component-fields"><div className="component-container-options"><OptionCheck label="Show accent color" checked={block.colorExplicit !== false} onChange={colorExplicit => update(block.id, { ...block, colorExplicit })} /><OptionCheck label="Hide container as a spoiler" checked={!!block.spoiler} onChange={spoiler => update(block.id, { ...block, spoiler })} /></div>{block.colorExplicit !== false && <ContainerColorControl color={block.color} onChange={color => update(block.id, { ...block, color })} />}<BlockList blocks={block.blocks} attachments={attachments} messageBudget={messageBudget} issue={issue} onChange={(next, attachment) => update(block.id, { ...block, blocks: next }, attachment)} nested /></div>}
      {block.type === 'links' && <LinkButtonFields buttons={block.buttons} max={5} remainingComponents={remainingComponents} onChange={buttons => update(block.id, { ...block, buttons })} />}
      {issue?.blockId === block.id && <p id={`${pickerId}-${block.id}-issue`} className="component-validation" role="status"><IconAlert size={14} aria-hidden /><span>{issue.text}</span></p>}
    </div>}</BlockReorderRow></AnimatedEditorRow>)}</AnimatedEditorList>
    </Reorder.Group>
    <div className="component-picker">
      <button type="button" className="component-picker-trigger" aria-expanded={pickerOpen} aria-controls={pickerId} onClick={() => setPickerOpen(open => !open)}>+ Add {nested ? 'inside container' : 'component'}</button>
      <AnimatedEditorList gap={0}>{pickerOpen && <AnimatedEditorRow key="picker"><div id={pickerId} className="component-picker__choices" role="group" aria-label={nested ? 'Add to container' : 'Add component'}>
        {TYPES.filter(item => !nested || item.type !== 'container').map(item => <button type="button" key={item.type + (item.accessory ?? '')} disabled={remainingComponents < newBlockCost(item.type)} title={remainingComponents < newBlockCost(item.type) ? 'This block would exceed the 40-component message limit' : undefined} onClick={() => { const block = newBlock(item.type); onChange([...blocks, block.type === 'section' && item.accessory === 'link' ? { ...block, accessory: 'link', button: { id: uid(), label: '', url: '' } } : block]); setPickerOpen(false); }}>
          <strong>{item.name}</strong><span>{item.description}</span>
        </button>)}
      </div></AnimatedEditorRow>}</AnimatedEditorList>
    </div>
  </div>;
}

type EditorProps = { message: Message; onChange: (change: Partial<Message>) => void };

export function MessageV2Toggle({ message, onChange, locked = false }: EditorProps & { locked?: boolean }) {
  const v2 = isComponentsV2(message);
  const selectMode = (nextV2: boolean) => onChange(nextV2
    ? { componentMode: 'v2', flags: (message.flags & ~4) | (1 << 15), componentBlocks: message.componentBlocks?.length ? message.componentBlocks : regularMessageToV2Blocks(message) }
    : { componentMode: 'standard', flags: message.flags & ~(1 << 15) });
  const explanation = locked ? 'Discord cannot switch this sent message back to the regular format' : v2 ? 'Only layout blocks are sent. Regular text and embeds stay saved.' : 'Build messages with Discord’s layout blocks';
  return <label className="message-v2-toggle" title={explanation}>
      <span className="message-v2-toggle__copy"><strong>Advanced V2 components</strong>{locked && <span>{explanation}</span>}</span>
      <span className="toggle"><input type="checkbox" checked={v2} disabled={locked} aria-description={explanation} onChange={event => selectMode(event.target.checked)} /><span className="toggle-slider" /></span>
    </label>;
}

export default function MessageComponentsEditor({ message, onChange }: EditorProps) {
  const v2 = isComponentsV2(message);
  const budget = componentBudget(message.componentBlocks ?? []);
  const reason = v2 ? validateComponentBlocks(message.componentBlocks ?? [], 'Message 1', false, message._attachments ?? []) : null;
  const target = reason ? validationTarget([message], `Check components\n${reason}`) : undefined;
  const issue = reason ? { blockId: target?.componentId, inputLabel: target?.inputLabel, text: reason.replace(/^Message \d+(?:,\s*block \d+)*:\s*/, '').replace(/^./, character => character.toUpperCase()) } : undefined;
  const [linksOpen, setLinksOpen] = useState(!!message.linkButtons?.length);
  return <section className={`message-components-editor${v2 ? ' message-components-editor--v2' : ''}`} aria-label="Message components">
    {!v2 && <details className="message-link-settings" open={linksOpen} onToggle={event => setLinksOpen(event.currentTarget.open)}>
      <summary title="Link buttons open websites. Buttons that trigger an action in Discord need a bot.">Link buttons {message.linkButtons?.length ? `(${message.linkButtons.length})` : ''}</summary>
      <LinkButtonFields buttons={message.linkButtons ?? []} max={25} onChange={linkButtons => onChange({ linkButtons })} />
    </details>}
    {v2 && <div className="message-v2-builder">
      <div className="editor-budget component-overview" aria-label="V2 message limits" title="All text blocks, including those inside containers and sections, share the 4,000-character limit."><strong>Layout blocks</strong><div className="editor-budget__counts"><LimitCounter count={budget.count} limit={40} label="V2 message components" unit="components" showUnit /><LimitCounter count={budget.text} limit={4000} label="V2 message text" showUnit /></div></div>
      {issue && !issue.blockId && <p className="component-validation" role="status"><IconAlert size={14} aria-hidden /><span>{issue.text}</span></p>}
      <BlockList blocks={message.componentBlocks ?? []} attachments={message._attachments ?? []} messageBudget={budget} issue={issue} onChange={(componentBlocks, attachment) => onChange({ componentBlocks, ...(attachment ? { _attachments: [...(message._attachments ?? []), attachment] } : {}) })} />
    </div>}
  </section>;
}
