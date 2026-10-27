'use client';
import { useUiMotion } from '@/lib/useUiMotion';

import { useState, useRef, memo, useCallback, useEffect, type MutableRefObject } from 'react';
import {
  IconFileText,
  IconGrip,
  IconPencil,
  IconTrash,
} from '@/components/MeowIcons';
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion';
import type { DragControls } from 'framer-motion';
import type { ComponentBlock, Tab } from '@/lib/types';
import { isTemporarySharedDraft } from '@/lib/shareDrafts';

function blockPreview(blocks: ComponentBlock[]): string {
  for (const block of blocks) {
    const text = block.type === 'container' ? blockPreview(block.blocks)
      : block.type === 'section' ? block.content || block.texts?.map(text => text.content).join(' ') || ''
      : block.type === 'text' ? block.content : '';
    if (text.trim()) return text;
  }
  return '';
}

function draftPreview(tab: Tab): string {
  for (const message of tab.messages) {
    const text = message.componentMode === 'v2' ? blockPreview(message.componentBlocks ?? [])
      : message.content || message.embeds.find(embed => embed.title || embed.description)?.title || message.embeds.find(embed => embed.description)?.description || '';
    const preview = text.replace(/\u001b\[[\d;]*m/g, '').replace(/```\w*/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_~`#>|]/g, '').replace(/\s+/g, ' ').trim();
    if (preview) return preview.slice(0, 160);
  }
  const count = tab.messages.length;
  const hasMedia = tab.messages.some(message => message._attachments?.length || message.embeds.length || message.componentBlocks?.length);
  return hasMedia || count > 1 ? `${count} ${count === 1 ? 'message' : 'messages'} · No text yet` : 'Empty draft';
}

type DraftReorderItemProps = {
  tab: Tab;
  index: number;
  isActive: boolean;
  tabsLength: number;
  editingTabId: string | null;
  renameDraftValue: string;
  setRenameDraftValue: (v: string) => void;
  setEditingTabId: (id: string | null) => void;
  renameCanceledRef: MutableRefObject<boolean>;
  renameTab: (index: number, name: string) => void;
  setActiveTabIndex: (i: number) => void;
  setConfirmDeleteDraftId: (id: string | null) => void;
  tabs: Tab[];
  hideDragHandle?: boolean;
  badgeText?: string;
  highlightOnMount?: boolean;
};

const SidebarDraftRow = memo(function SidebarDraftRow({
  tab,
  index,
  isActive,
  editingTabId,
  renameDraftValue,
  setRenameDraftValue,
  setEditingTabId,
  renameCanceledRef,
  renameTab,
  setActiveTabIndex,
  setConfirmDeleteDraftId,
  tabs,
  hideDragHandle,
  badgeText,
  highlightOnMount,
  dragControls,
}: DraftReorderItemProps & { dragControls: DragControls | null }) {
  const isEditing = editingTabId === tab.id;
  const canDrag = dragControls != null && !hideDragHandle;

  return (
    <div
      className={`sidebar-item ${isActive ? 'active' : ''}`}
      data-recent={highlightOnMount ? 'true' : 'false'}
    >
      <span
        className="sidebar-draft-grip"
        title={canDrag ? 'Drag to reorder' : undefined}
        aria-label={canDrag ? 'Drag to reorder drafts' : undefined}
        aria-hidden={!canDrag}
        onPointerDown={
          canDrag
            ? (e) => {
                e.preventDefault();
                e.stopPropagation();
                dragControls!.start(e);
              }
            : undefined
        }
        style={{
          cursor: canDrag ? undefined : 'default',
          pointerEvents: canDrag ? undefined : 'none',
        }}
      >
        <IconFileText size={17} strokeWidth={1.7} className="sidebar-draft-grip__file" aria-hidden />
        {canDrag && <IconGrip size={16} className="sidebar-draft-grip__handle" aria-hidden />}
      </span>
      <div className="sidebar-draft-row__content">
        <div className="sidebar-draft-row__details">
        {isEditing ? (
          <input
            className="sidebar-draft-rename-input"
            value={renameDraftValue}
            onChange={(e) => setRenameDraftValue(e.target.value)}
            maxLength={120}
            autoFocus
            aria-label="Draft name"
            onFocus={(e) => e.target.select()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                renameCanceledRef.current = true;
                setEditingTabId(null);
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }
            }}
            onBlur={() => {
              if (renameCanceledRef.current) {
                renameCanceledRef.current = false;
                return;
              }
              const idx = tabs.findIndex((t) => t.id === tab.id);
              if (idx >= 0) renameTab(idx, renameDraftValue);
              setEditingTabId(null);
            }}
          />
        ) : (
          <button type="button" className="drafts-row-select" aria-current={isActive ? 'page' : undefined} aria-label={`Open ${tab.name || `Draft ${index + 1}`}`} title={tab.name} onClick={() => setActiveTabIndex(index)}>
            <span className="drafts-row-select__name">{tab.name || `Draft ${index + 1}`}</span>
            <span className="drafts-row-select__preview">{draftPreview(tab)}</span>
          </button>
        )}
        </div>
        {!isEditing && badgeText && (
          <span
            style={{
              padding: '2px 6px',
              borderRadius: 999,
              border: '1px solid color-mix(in srgb, var(--accent) 24%, var(--border))',
              background: 'color-mix(in srgb, var(--accent) 10%, var(--bg-secondary))',
              color: 'var(--text-secondary)',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              flexShrink: 0,
            }}
          >
            {badgeText}
          </span>
        )}
        {!isEditing && (
          <button
            type="button"
            className="sidebar-draft-row__icon-btn sidebar-draft-row__rename"
            title="Rename draft"
            aria-label="Rename draft"
            onClick={(e) => {
              e.stopPropagation();
              renameCanceledRef.current = false;
              setRenameDraftValue(tab.name || `Draft ${index + 1}`);
              setEditingTabId(tab.id);
            }}
          >
            <IconPencil size={15} strokeWidth={2} aria-hidden />
          </button>
        )}
        {!isEditing && (
          <button
            type="button"
            className="sidebar-draft-row__icon-btn sidebar-draft-row__icon-btn--danger"
            title="Delete draft"
            aria-label="Delete draft"
            onClick={(e) => {
              e.stopPropagation();
              setConfirmDeleteDraftId(tab.id);
            }}
          >
            <IconTrash size={15} strokeWidth={2} aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
});

const DraftRowStatic = memo(function DraftRowStatic(props: DraftReorderItemProps) {
  const uiMotion = useUiMotion();
  return (
    <motion.div
      layout="position"
      {...uiMotion.dialog}
      initial={props.highlightOnMount ? uiMotion.dialog.initial : false}
      transition={uiMotion.transition}
      style={{ listStyle: 'none', position: 'relative' }}
    >
      <SidebarDraftRow {...props} dragControls={null} />
    </motion.div>
  );
});

const DraftReorderItem = memo(function DraftReorderItem(props: DraftReorderItemProps) {
  const uiMotion = useUiMotion();
  const controls = useDragControls();

  return (
    <Reorder.Item
      as="div"
      value={props.tab.id}
      id={props.tab.id}
      dragListener={false}
      dragControls={controls}
      layout="position"
      transition={uiMotion.transition}
      {...uiMotion.dialog}
      initial={props.highlightOnMount ? uiMotion.dialog.initial : false}
      whileDrag={{
        zIndex: 20,
        boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
        cursor: 'grabbing',
      }}
      dragMomentum={false}
      style={{ listStyle: 'none', position: 'relative' }}
    >
      <SidebarDraftRow {...props} dragControls={controls} />
    </Reorder.Item>
  );
});

interface SidebarDraftsListProps {
  tabs: Tab[];
  activeTabIndex: number;
  reorderTabs: (ids: string[]) => void;
  setActiveTabIndex: (i: number) => void;
  renameTab: (index: number, name: string) => void;
  setConfirmDeleteDraftId: (id: string | null) => void;
}

export default function SidebarDraftsList({
  tabs,
  activeTabIndex,
  reorderTabs,
  setActiveTabIndex,
  renameTab,
  setConfirmDeleteDraftId,
}: SidebarDraftsListProps) {
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [renameDraftValue, setRenameDraftValue] = useState('');
  const renameCanceledRef = useRef(false);
  const [recentDraftId, setRecentDraftId] = useState<string | null>(null);
  const [draftReorderReady, setDraftReorderReady] = useState(false);
  const previousTabIdsRef = useRef<string[]>([]);

  const persistentTabEntries = tabs
    .map((tab, index) => ({ tab, index }))
    .filter(({ tab }) => !isTemporarySharedDraft(tab));
  const temporaryTabEntries = tabs
    .map((tab, index) => ({ tab, index }))
    .filter(({ tab }) => isTemporarySharedDraft(tab));

  const handleDraftReorder = useCallback(
    (newOrder: string[]) => {
      reorderTabs([...newOrder, ...temporaryTabEntries.map(({ tab }) => tab.id)]);
    },
    [reorderTabs, temporaryTabEntries],
  );

  useEffect(() => {
    setDraftReorderReady(true);
  }, []);

  useEffect(() => {
    const previousIds = previousTabIdsRef.current;
    const nextIds = tabs.map((tab) => tab.id);
    const addedId = nextIds.find((id) => !previousIds.includes(id)) ?? null;

    previousTabIdsRef.current = nextIds;

    if (!addedId) return;

    setRecentDraftId(addedId);
    const timeout = window.setTimeout(() => {
      setRecentDraftId((current) => (current === addedId ? null : current));
    }, 900);

    return () => window.clearTimeout(timeout);
  }, [tabs]);

  return (
    <div className="sidebar-scroll-area">
      <div className="sidebar-scroll-inner">

        {draftReorderReady ? (
          <Reorder.Group
            axis="y"
            as="div"
            values={persistentTabEntries.map(({ tab }) => tab.id)}
            onReorder={handleDraftReorder}
            style={{ display: 'flex', flexDirection: 'column', gap: 3, margin: 0, padding: 0 }}
          >
            {persistentTabEntries.map(({ tab, index }) => (
              <DraftReorderItem
                key={tab.id}
                tab={tab}
                index={index}
                isActive={index === activeTabIndex}
                tabsLength={tabs.length}
                editingTabId={editingTabId}
                renameDraftValue={renameDraftValue}
                setRenameDraftValue={setRenameDraftValue}
                setEditingTabId={setEditingTabId}
                renameCanceledRef={renameCanceledRef}
                renameTab={renameTab}
                setActiveTabIndex={setActiveTabIndex}
                setConfirmDeleteDraftId={setConfirmDeleteDraftId}
                tabs={tabs}
                highlightOnMount={recentDraftId === tab.id}
              />
            ))}
          </Reorder.Group>
        ) : (
          <AnimatePresence initial={false}>
            {persistentTabEntries.map(({ tab, index }) => (
              <DraftRowStatic
                key={tab.id}
                tab={tab}
                index={index}
                isActive={index === activeTabIndex}
                tabsLength={tabs.length}
                editingTabId={editingTabId}
                renameDraftValue={renameDraftValue}
                setRenameDraftValue={setRenameDraftValue}
                setEditingTabId={setEditingTabId}
                renameCanceledRef={renameCanceledRef}
                renameTab={renameTab}
                setActiveTabIndex={setActiveTabIndex}
                setConfirmDeleteDraftId={setConfirmDeleteDraftId}
                tabs={tabs}
                highlightOnMount={recentDraftId === tab.id}
              />
            ))}
          </AnimatePresence>
        )}

        {temporaryTabEntries.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 4px 0' }}>
              <span className="font-display-wide" style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Temporary
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                Session only
              </span>
            </div>
            <div style={{ padding: '0 4px 6px', fontSize: 11, lineHeight: 1.45, color: 'var(--text-muted)' }}>
              Share links open here and disappear when this browser session is closed.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, margin: 0, padding: 0 }}>
              {temporaryTabEntries.map(({ tab, index }) => (
                <DraftRowStatic
                  key={tab.id}
                  tab={tab}
                  index={index}
                  isActive={index === activeTabIndex}
                  tabsLength={tabs.length}
                  editingTabId={editingTabId}
                  renameDraftValue={renameDraftValue}
                  setRenameDraftValue={setRenameDraftValue}
                  setEditingTabId={setEditingTabId}
                  renameCanceledRef={renameCanceledRef}
                  renameTab={renameTab}
                  setActiveTabIndex={setActiveTabIndex}
                  setConfirmDeleteDraftId={setConfirmDeleteDraftId}
                  tabs={tabs}
                  hideDragHandle
                  badgeText="Temp"
                  highlightOnMount={recentDraftId === tab.id}
                />
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
