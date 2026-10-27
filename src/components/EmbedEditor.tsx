'use client';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { DragControls } from 'framer-motion';
import type { Embed } from '@/lib/types';
import type { EmbedAttachmentField } from '@/lib/embedTransfers';
import { createDefaultField, intToHex, hexToInt, uid } from '@/lib/utils';
import FieldEditor from './FieldEditor';
import LimitCounter from './LimitCounter';
import { embedTextLength } from '@/lib/editorLimits';
import TextFieldWithQuickActions from '@/components/TextFieldWithQuickActions';
import TimestampPicker from './TimestampPicker';
import ImageUploadButton from './ImageUploadButton';
import ColorPicker from './ColorPicker';
import LazySectionContent from './LazySectionContent';
import { AnimatedEditorList, AnimatedEditorRow } from './AnimatedEditorList';
import {
  IconChevronDown,
  IconChevronRight,
  IconCopy,
  IconTrash,
  IconArrowUp,
  IconArrowDown,
  IconPlus,
  IconGrip,
  IconUserCircle,
  IconGrid,
  IconImage,
  IconPanelBottom,
} from '@/components/MeowIcons';

/** In-memory only: used by reorder drag handle; never persisted. */
export type EmbedWithDragControls = Embed & { _dragControls?: DragControls };

interface EmbedEditorProps {
  embed: EmbedWithDragControls;
  index: number;
  onChange: (embed: EmbedWithDragControls) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  forceCollapsed?: boolean;
  onFileUpload?: (field: EmbedAttachmentField, previewUrl: string, file: File) => void;
  isRateLimited?: boolean;
  attachmentUsage?: {
    total: number;
    hasReachedLimit: boolean;
    remainingSlots: number;
  };
  isFocused?: boolean;
  focusedFieldId?: string;
  focusedSection?: string;
  focusRequestId?: string;
}

export default function EmbedEditor({
  embed,
  index,
  onChange,
  onRemove,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  collapsed: controlledCollapsed,
  onCollapsedChange,
  forceCollapsed,
  onFileUpload,
  isRateLimited,
  attachmentUsage,
  isFocused,
  focusedFieldId,
  focusedSection,
  focusRequestId,
}: EmbedEditorProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const toggle = (key: string) => setOpenSections((p) => ({ ...p, [key]: !p[key] }));
  const isOpen = (key: string) => !!openSections[key];
  const isUserCollapsed = controlledCollapsed ?? internalCollapsed;
  const setUserCollapsed = (nextCollapsed: boolean) => {
    if (onCollapsedChange) {
      onCollapsedChange(nextCollapsed);
      return;
    }
    setInternalCollapsed(nextCollapsed);
  };
  const isCurrentlyCollapsed = isUserCollapsed || forceCollapsed;
  const compactSummaryChips = [
    embed.title.trim() ? { key: 'title', label: embed.title.trim(), tone: 'accent' as const } : null,
    embed.description.trim()
      ? {
          key: 'description',
          label: `${embed.description.trim().length} description chars`,
          tone: 'muted' as const,
        }
      : null,
    embed.fields.length > 0
      ? {
          key: 'fields',
          label: `${embed.fields.length} field${embed.fields.length === 1 ? '' : 's'}`,
          tone: 'muted' as const,
        }
      : null,
    embed.image.url || embed.thumbnail.url
      ? {
          key: 'media',
          label: embed.image.url && embed.thumbnail.url ? 'Image + thumbnail' : embed.image.url ? 'Image' : 'Thumbnail',
          tone: 'muted' as const,
        }
      : null,
    embed.footer.text || embed.footer.icon_url
      ? {
          key: 'footer',
          label: embed.footer.text ? 'Footer' : 'Footer icon',
          tone: 'muted' as const,
        }
      : null,
    embed.timestamp ? { key: 'timestamp', label: 'Timestamp', tone: 'muted' as const } : null,
  ].filter((chip): chip is { key: string; label: string; tone: 'accent' | 'muted' } => Boolean(chip));

  useEffect(() => {
    if (!isFocused || !focusRequestId) return;
    setUserCollapsed(false);
    if (focusedFieldId || focusedSection) {
      setOpenSections((current) => ({ ...current, [focusedSection ?? 'fields']: true }));
    }
  }, [focusRequestId, focusedFieldId, focusedSection, isFocused]);

  const handleImageUpload = (field: EmbedAttachmentField, urlSetter: (url: string) => void) => {
    return (previewUrl: string, file: File) => {
      if (onFileUpload) {
        onFileUpload(field, previewUrl, file);
        return;
      }
      urlSetter(previewUrl);
    };
  };

  const renderAnimatedSection = (
    key: string,
    label: ReactNode,
    children: ReactNode,
    summary?: string,
  ) => {
    const open = isOpen(key);

    return (
      <div className="embed-editor-section" data-embed-option={key}>
        <button
          type="button"
          className="section-header embed-editor-section-header"
          aria-controls={`embed-${embed.id}-${key}`}
          aria-expanded={open}
          onClick={() => toggle(key)}
        >
          <span className="embed-editor-section-header__label">{label}</span>
          <span className="embed-editor-section-header__meta">
            {!open && summary ? (
              <span className="embed-editor-section-summary" title={summary}>
                {summary}
              </span>
            ) : null}
            {open ? (
              <IconChevronDown className="section-header__chevron" size={18} strokeWidth={2} />
            ) : (
              <IconChevronRight className="section-header__chevron" size={18} strokeWidth={2} />
            )}
          </span>
        </button>
        <div
          id={`embed-${embed.id}-${key}`}
          className={[
            'embed-editor-section-shell',
            open ? 'embed-editor-section-shell--open' : '',
          ].join(' ')}
          aria-hidden={!open}
          inert={!open}
        >
          <div className="embed-editor-section-inner"><LazySectionContent expanded={open}>{children}</LazySectionContent></div>
        </div>
      </div>
    );
  };

  return (
    <div
      className={[
        'card',
        'embed-editor-card',
        isCurrentlyCollapsed ? 'embed-editor-card--collapsed' : '',
        isFocused ? 'editor-focus-highlight' : '',
      ].filter(Boolean).join(' ')}
      style={{ '--embed-accent': intToHex(embed.color) } as CSSProperties}
    >
      {/* Header */}
      <div
        className={`embed-editor-header ${isCurrentlyCollapsed ? 'embed-editor-header--collapsed' : ''}`}
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div 
            style={{ cursor: 'grab', touchAction: 'none', color: 'var(--text-muted)', padding: '2px', borderRadius: 4, transition: 'color 0.15s' }} 
            title="Drag to reorder or move to another message" 
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent)'} 
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.nativeEvent.preventDefault();
              embed._dragControls?.start(e, { snapToCursor: false });
            }}
          >
            <IconGrip size={18} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <button type="button" className="btn btn-ghost" onClick={onMoveUp} disabled={!onMoveUp} title="Move up" aria-label="Move embed up" style={{ padding: 1, height: 'auto', minHeight: 0, opacity: onMoveUp ? 1 : 0.25 }}><IconArrowUp size={14} /></button>
            <button type="button" className="btn btn-ghost" onClick={onMoveDown} disabled={!onMoveDown} title="Move down" aria-label="Move embed down" style={{ padding: 1, height: 'auto', minHeight: 0, opacity: onMoveDown ? 1 : 0.25 }}><IconArrowDown size={14} /></button>
          </div>
        </div>
        <button type="button" aria-expanded={!isCurrentlyCollapsed} className="embed-editor-title-toggle" onClick={() => setUserCollapsed(!isUserCollapsed)}>
          {isCurrentlyCollapsed ? <IconChevronRight className="section-header__chevron" size={18} strokeWidth={2} /> : <IconChevronDown className="section-header__chevron" size={18} strokeWidth={2} />}
          Embed {index + 1}
          {embed.title && <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 12 }}>- {embed.title}</span>}
        </button>
        <LimitCounter count={embedTextLength(embed)} limit={6000} label={`Embed ${index + 1} text (shared message allowance)`} className="embed-total-counter" />
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDuplicate} title="Duplicate" aria-label="Duplicate embed"><IconCopy size={14} /></button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onRemove} title="Delete" aria-label="Delete embed" style={{ color: 'var(--danger)' }}><IconTrash size={14} /></button>
      </div>

      <div
        className={[
          'embed-editor-compact-shell',
          isCurrentlyCollapsed ? 'embed-editor-compact-shell--visible' : '',
        ].join(' ')}
        aria-hidden={!isCurrentlyCollapsed}
        inert={!isCurrentlyCollapsed}
      >
        <div className="embed-editor-compact-inner">
          <div className="embed-editor-compact-strip">
            {compactSummaryChips.length > 0 ? (
              compactSummaryChips.map((chip) => (
                <span
                  key={chip.key}
                  className={[
                    'embed-editor-compact-chip',
                    chip.tone === 'accent' ? 'embed-editor-compact-chip--accent' : '',
                  ].filter(Boolean).join(' ')}
                  title={chip.label}
                >
                  {chip.label}
                </span>
              ))
            ) : (
              <span className="embed-editor-compact-chip">No embed content yet</span>
            )}
          </div>
        </div>
      </div>

      <div
        className={`embed-editor-body-shell ${isCurrentlyCollapsed ? 'embed-editor-body-shell--collapsed' : ''}`}
        aria-hidden={isCurrentlyCollapsed}
        inert={isCurrentlyCollapsed}
      >
        <div className="embed-editor-body-content" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <LazySectionContent expanded={!isCurrentlyCollapsed}>
          <div className="embed-compose">
            <div className="embed-compose__color">
              <span className="label">Accent color</span>
              <EmbedColorControl color={embed.color} onChange={(color) => onChange({ ...embed, color, colorExplicit: true })} />
            </div>
            <div>
              <div className="embed-compose__label"><span className="label">Title</span><LimitCounter count={embed.title.length} limit={256} label="Embed title" /></div>
              <TextFieldWithQuickActions aria-label="Embed title" value={embed.title} onChange={(title) => onChange({ ...embed, title })} placeholder="Give your embed a title" maxLength={256} expandedEditorTitle="Embed title" />
            </div>
            <div>
              <div className="embed-compose__label"><span className="label">Description</span><LimitCounter count={embed.description.length} limit={4096} label="Embed description" /></div>
              <TextFieldWithQuickActions multiline aria-label="Embed description" value={embed.description} onChange={(description) => onChange({ ...embed, description })} placeholder="Write the main text. Markdown works here." maxLength={4096} rows={5} expandedEditorTitle="Embed description" />
            </div>
            <details className="embed-title-link" open={isOpen('link')} onToggle={(event) => {
              const open = event.currentTarget.open;
              setOpenSections((current) => current.link === open ? current : { ...current, link: open });
            }}>
              <summary>{embed.url ? 'Title link added' : 'Add a link to the title'}</summary>
              <input aria-label="Embed title link" value={embed.url} onChange={(e) => onChange({ ...embed, url: e.target.value })} placeholder="https://example.com" />
            </details>
          </div>

          {/* Fields */}
          {renderAnimatedSection(
            'fields',
            <>
              <IconGrid className="section-header__leading-icon" size={17} strokeWidth={2} /> Fields <LimitCounter count={embed.fields.length} limit={25} label="Embed fields" unit="fields" />
            </>,
            <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <AnimatedEditorList gap={6}>{embed.fields.map((f, fi) => (
                <AnimatedEditorRow key={f.id}>
                <FieldEditor
                  key={f.id}
                  field={f}
                  index={fi}
                  isFocused={focusedFieldId === f.id}
                  onChange={(nf) => {
                    const fields = [...embed.fields];
                    fields[fi] = nf;
                    onChange({ ...embed, fields });
                  }}
                  onRemove={() => onChange({ ...embed, fields: embed.fields.filter((_, j) => j !== fi) })}
                  onDuplicate={
                    embed.fields.length < 25
                      ? () => {
                          const fields = [...embed.fields];
                          fields.splice(fi + 1, 0, { ...f, id: uid() });
                          onChange({ ...embed, fields });
                        }
                      : undefined
                  }
                  onMoveUp={
                    fi > 0
                      ? () => {
                          const fields = [...embed.fields];
                          [fields[fi - 1], fields[fi]] = [fields[fi], fields[fi - 1]];
                          onChange({ ...embed, fields });
                        }
                      : undefined
                  }
                  onMoveDown={
                    fi < embed.fields.length - 1
                      ? () => {
                          const fields = [...embed.fields];
                          [fields[fi], fields[fi + 1]] = [fields[fi + 1], fields[fi]];
                          onChange({ ...embed, fields });
                        }
                      : undefined
                  }
                />
                </AnimatedEditorRow>
              ))}</AnimatedEditorList>
              {embed.fields.length < 25 && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange({ ...embed, fields: [...embed.fields, createDefaultField()] })}>
                  <IconPlus size={14} /> Add field
                </button>
              )}
            </div>,
            embed.fields.length > 0 ? undefined : 'Name and value pairs',
          )}

          {/* Images */}
          {renderAnimatedSection(
            'images',
            <>
              <IconImage className="section-header__leading-icon" size={17} strokeWidth={2} /> Images
            </>,
            <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div>
                <div className="label">Image URL</div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input aria-label="Embed image URL" value={embed.image.url} onChange={(e) => onChange({ ...embed, image: { url: e.target.value } })} placeholder="https://example.com/image.png (large image)" style={{ flex: 1 }} />
                  <ImageUploadButton
                    disabled={isRateLimited || attachmentUsage?.hasReachedLimit}
                    disabledTitle={isRateLimited ? 'Rate limited - wait before uploading' : attachmentUsage?.hasReachedLimit ? `At ${attachmentUsage.total}/10 attachments - remove files to add more` : undefined}
                    onUpload={handleImageUpload('image', (url) => onChange({ ...embed, image: { url } }))}
                  />
                </div>
                {attachmentUsage?.hasReachedLimit && (
                  <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                    At {attachmentUsage.total}/10 attachments - use a URL instead
                  </p>
                )}
              </div>
              <div>
                <div className="label">Thumbnail URL</div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input aria-label="Embed thumbnail URL" value={embed.thumbnail.url} onChange={(e) => onChange({ ...embed, thumbnail: { url: e.target.value } })} placeholder="https://example.com/thumb.png (small, top-right)" style={{ flex: 1 }} />
                  <ImageUploadButton
                    disabled={isRateLimited || attachmentUsage?.hasReachedLimit}
                    disabledTitle={isRateLimited ? 'Rate limited - wait before uploading' : attachmentUsage?.hasReachedLimit ? `At ${attachmentUsage.total}/10 attachments - remove files to add more` : undefined}
                    onUpload={handleImageUpload('thumbnail', (url) => onChange({ ...embed, thumbnail: { url } }))}
                  />
                </div>
                {attachmentUsage?.hasReachedLimit && (
                  <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                    At {attachmentUsage.total}/10 attachments - use a URL instead
                  </p>
                )}
              </div>
            </div>,
            embed.image.url && embed.thumbnail.url
              ? 'Image + thumbnail'
              : embed.image.url
                ? 'Image attached'
                : embed.thumbnail.url
                  ? 'Thumbnail attached'
                  : '',
          )}

          {/* Author */}
          {renderAnimatedSection(
            'author',
            <>
              <IconUserCircle className="section-header__leading-icon" size={17} strokeWidth={2} /> Author
            </>,
            <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="label">Name</span>
                  <LimitCounter count={embed.author.name.length} limit={256} label="Embed author name" />
                </div>
                <TextFieldWithQuickActions
                  value={embed.author.name}
                  onChange={(name) => onChange({ ...embed, author: { ...embed.author, name } })}
                  aria-label="Embed author name"
                  placeholder="Author name"
                  maxLength={256}
                  expandedEditorTitle="Author name"
                />
              </div>
              <div>
                <div className="label">URL</div>
                <input
                  value={embed.author.url}
                  onChange={(e) =>
                    onChange({ ...embed, author: { ...embed.author, url: e.target.value } })
                  }
                  placeholder="https://"
                />
              </div>
              <div>
                <div className="label">Icon URL</div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input
                    value={embed.author.icon_url}
                    onChange={(e) =>
                      onChange({ ...embed, author: { ...embed.author, icon_url: e.target.value } })
                    }
                    placeholder="https:// (direct image link)"
                    style={{ flex: 1 }}
                  />
                  <ImageUploadButton
                    disabled={attachmentUsage?.hasReachedLimit}
                    disabledTitle={
                      attachmentUsage?.hasReachedLimit
                        ? `At ${attachmentUsage.total}/10 attachments - remove files to add more`
                        : undefined
                    }
                    onUpload={handleImageUpload('author_icon', (url) =>
                      onChange({ ...embed, author: { ...embed.author, icon_url: url } })
                    )}
                  />
                </div>
                {attachmentUsage?.hasReachedLimit && (
                  <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                    At {attachmentUsage.total}/10 attachments - use a URL instead
                  </p>
                )}
              </div>
            </div>,
            embed.author.name.trim() ||
              (embed.author.icon_url ? 'Icon attached' : '') ||
              (embed.author.url ? 'Linked author' : ''),
          )}

          {/* Footer */}
          {renderAnimatedSection(
            'footer',
            <>
              <IconPanelBottom className="section-header__leading-icon" size={17} strokeWidth={2} /> Footer & timestamp
            </>,
            <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="label">Text</span>
                  <LimitCounter count={embed.footer.text.length} limit={2048} label="Embed footer text" />
                </div>
                <TextFieldWithQuickActions
                  value={embed.footer.text}
                  onChange={(text) => onChange({ ...embed, footer: { ...embed.footer, text } })}
                  aria-label="Embed footer text"
                  placeholder="Footer text"
                  maxLength={2048}
                  expandedEditorTitle="Footer text"
                />
              </div>
              <div>
                <div className="label">Icon URL</div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input value={embed.footer.icon_url} onChange={(e) => onChange({ ...embed, footer: { ...embed.footer, icon_url: e.target.value } })} placeholder="https:// (small icon)" style={{ flex: 1 }} />
                  <ImageUploadButton
                    disabled={isRateLimited || attachmentUsage?.hasReachedLimit}
                    disabledTitle={isRateLimited ? 'Rate limited - wait before uploading' : attachmentUsage?.hasReachedLimit ? `At ${attachmentUsage.total}/10 attachments - remove files to add more` : undefined}
                    onUpload={handleImageUpload('footer_icon', (url) => onChange({ ...embed, footer: { ...embed.footer, icon_url: url } }))}
                  />
                </div>
                {attachmentUsage?.hasReachedLimit && (
                  <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                    At {attachmentUsage.total}/10 attachments - use a URL instead
                  </p>
                )}
              </div>
              <div>
                <div className="label">Timestamp</div>
                <TimestampPicker
                  value={embed.timestamp}
                  onChange={(val) => onChange({ ...embed, timestamp: val })}
                />
              </div>
            </div>,
            embed.footer.text.trim()
              ? 'Footer text'
              : embed.footer.icon_url
                ? 'Footer icon'
                : embed.timestamp
                  ? 'Timestamp'
                  : '',
          )}
          </LazySectionContent>
        </div>
      </div>
    </div>
  );
}

function EmbedColorControl({ color, onChange }: { color: number; onChange: (color: number) => void }) {
  const [hex, setHex] = useState(intToHex(color));
  useEffect(() => setHex(intToHex(color)), [color]);
  const apply = () => {
    const match = hex.trim().match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i);
    if (!match) { setHex(intToHex(color)); return; }
    const value = match[1].length === 3 ? [...match[1]].map((c) => c + c).join('') : match[1];
    onChange(hexToInt(value));
    setHex('#' + value.toLowerCase());
  };
  return <div className="embed-color-control">
    <ColorPicker color={intToHex(color)} onChange={(value) => onChange(hexToInt(value))} />
    <input aria-label="Embed color hex code" spellCheck={false} value={hex} maxLength={7} onChange={(event) => setHex(event.target.value)} onBlur={apply} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { setHex(intToHex(color)); } }} />
  </div>;
}
