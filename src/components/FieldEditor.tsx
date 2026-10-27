'use client';

import type { Field } from '@/lib/types';
import {
  IconArrowDown,
  IconArrowUp,
  IconCopy,
  IconTrash,
} from '@/components/MeowIcons';
import TextFieldWithQuickActions from '@/components/TextFieldWithQuickActions';
import LimitCounter from '@/components/LimitCounter';

interface FieldEditorProps {
  field: Field;
  index: number;
  isFocused?: boolean;
  onChange: (field: Field) => void;
  onRemove: () => void;
  onDuplicate?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

export default function FieldEditor({
  field,
  index,
  isFocused,
  onChange,
  onRemove,
  onDuplicate,
  onMoveUp,
  onMoveDown,
}: FieldEditorProps) {
  const isPartial = (!!field.name.trim() && !field.value.trim()) || (!field.name.trim() && !!field.value.trim());

  return (
    <div
      data-field-editor-id={field.id}
      className="animate-cardIn"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: 12,
        background: 'color-mix(in srgb, var(--bg-secondary) 96%, var(--text-primary))',
        borderRadius: 12,
        border: `1px solid ${isPartial ? 'var(--warning)' : 'var(--border)'}`,
        boxShadow: isFocused
          ? '0 0 0 1px var(--text-muted)'
          : isPartial
            ? '0 0 0 1px color-mix(in srgb, var(--warning) 28%, transparent)'
            : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '4px 8px',
              borderRadius: 999,
              background: 'color-mix(in srgb, var(--text-primary) 7%, transparent)',
              color: 'var(--text-primary)',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.02em',
            }}
          >
            Field {index + 1}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {field.inline ? 'Inline layout' : 'Full width'}
          </span>
          {isPartial && (
            <span style={{ fontSize: 11, color: 'var(--warning)', fontWeight: 600 }}>
              Needs both a name and a value
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onMoveUp}
            disabled={!onMoveUp}
            title="Move field up"
            aria-label="Move field up"
            style={{ opacity: onMoveUp ? 1 : 0.35 }}
          >
            <IconArrowUp size={13} />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onMoveDown}
            disabled={!onMoveDown}
            title="Move field down"
            aria-label="Move field down"
            style={{ opacity: onMoveDown ? 1 : 0.35 }}
          >
            <IconArrowDown size={13} />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onDuplicate}
            disabled={!onDuplicate}
            title="Duplicate field"
            aria-label="Duplicate field"
            style={{ opacity: onDuplicate ? 1 : 0.35 }}
          >
            <IconCopy size={13} />
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onRemove} style={{ color: 'var(--danger)' }}>
            <IconTrash size={13} /> Remove
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gap: 8,
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        }}
      >
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="label">Name</span>
            <LimitCounter count={field.name.length} limit={256} label={`Field ${index + 1} name`} />
          </div>
          <TextFieldWithQuickActions
            value={field.name}
            aria-label={`Field ${index + 1} name`}
            onChange={(name) => onChange({ ...field, name })}
            placeholder={`Field ${index + 1} name`}
            maxLength={256}
            expandedEditorTitle={`Field ${index + 1} name`}
          />
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="label">Value</span>
            <LimitCounter count={field.value.length} limit={1024} label={`Field ${index + 1} value`} />
          </div>
          <TextFieldWithQuickActions
            multiline
            value={field.value}
            aria-label={`Field ${index + 1} value`}
            onChange={(value) => onChange({ ...field, value })}
            placeholder={'Use \\n for a new line, or press Enter. **bold**, links, etc.'}
            maxLength={1024}
            rows={3}
            expandedEditorTitle={`Field ${index + 1} value`}
            style={{
              width: '100%',
              minHeight: 72,
              fontFamily: 'inherit',
              fontSize: 13,
              lineHeight: 1.45,
              padding: '8px 10px',
            }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: 3,
            borderRadius: 999,
            border: '1px solid var(--border)',
            background: 'var(--bg-primary)',
          }}
        >
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => onChange({ ...field, inline: false })}
            aria-pressed={!field.inline}
            style={{
              borderRadius: 999,
              background: !field.inline ? 'rgba(var(--accent-rgb), 0.16)' : 'transparent',
              color: !field.inline ? 'var(--text-primary)' : 'var(--text-muted)',
            }}
          >
            Full width
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => onChange({ ...field, inline: true })}
            aria-pressed={field.inline}
            style={{
              borderRadius: 999,
              background: field.inline ? 'rgba(var(--accent-rgb), 0.16)' : 'transparent',
              color: field.inline ? 'var(--text-primary)' : 'var(--text-muted)',
            }}
          >
            Inline
          </button>
        </div>

        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {field.inline
            ? 'Inline fields share a row with up to 2 more fields in Discord.'
            : 'Full-width fields always start on their own row.'}
        </span>
      </div>
    </div>
  );
}
