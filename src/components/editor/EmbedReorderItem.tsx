'use client';
import { useUiMotion } from '@/lib/useUiMotion';

import React from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import EmbedEditor from '@/components/EmbedEditor';
import { intToHex, uid } from '@/lib/utils';
import { pruneUnusedMessageAttachments } from '@/lib/embedTransfers';
import { setEmbedAttachmentUrl, buildEmbedAttachmentFieldKey } from '@/lib/embedTransfers';
import type { AttachmentUsage } from '@/lib/attachmentTracker';
import type { Embed, Message } from '@/lib/types';
import type { EmbedWithDragControls } from '@/components/EmbedEditor';
import type { EmbedAttachmentField } from '@/lib/embedTransfers';
import { embedForStorage } from './helpers';
import type { CrossMessageEmbedDrag, DragPoint } from './helpers';

const EmbedReorderItem = React.memo(function EmbedReorderItem({
  embed,
  embedIndex,
  msgIndex,
  embedCount,
  attachmentUsage,
  updateMessage,
  collapsed,
  setEmbedCollapsed,
  forceCollapse,
  isRateLimited,
  setCrossMessageEmbedDrag,
  setSourceEmbedCompactReady,
  crossMessageEmbedDropTargetIndex,
  setCrossMessageEmbedDropTargetIndex,
  updateCrossMessageEmbedDropTarget,
  moveEmbedToMessage,
  isFocused,
  focusedFieldId,
  focusedSection,
  focusRequestId,
}: {
  embed: Embed;
  embedIndex: number;
  msgIndex: number;
  embedCount: number;
  attachmentUsage: AttachmentUsage;
  updateMessage: (msgIndex: number, fn: (m: Message) => Message) => void;
  collapsed: boolean;
  setEmbedCollapsed: (embedId: string, collapsed: boolean) => void;
  forceCollapse: boolean;
  isRateLimited?: boolean;
  setCrossMessageEmbedDrag: (drag: CrossMessageEmbedDrag | null) => void;
  setSourceEmbedCompactReady: (ready: boolean) => void;
  crossMessageEmbedDropTargetIndex: number | null;
  setCrossMessageEmbedDropTargetIndex: (index: number | null) => void;
  updateCrossMessageEmbedDropTarget: (point: DragPoint, sourceMessageIndex: number) => void;
  moveEmbedToMessage: (sourceMessageIndex: number, targetMessageIndex: number, embedId: string) => boolean;
  isFocused?: boolean;
  focusedFieldId?: string;
  focusedSection?: string;
  focusRequestId?: string;
}) {
  const uiMotion = useUiMotion();
  const controls = useDragControls();

  return (
    <Reorder.Item
      as="div"
      value={embed.id}
      id={embed.id}
      data-embed-editor-id={embed.id}
      dragListener={false}
      dragControls={controls}
      layout="position"
      transition={uiMotion.transition}
      onDragStart={() => {
        setCrossMessageEmbedDropTargetIndex(null);
        setSourceEmbedCompactReady(false);
        setCrossMessageEmbedDrag({ sourceMessageIndex: msgIndex, embedId: embed.id });
      }}
      onDrag={(_, info) => {
        updateCrossMessageEmbedDropTarget({ x: info.point.x, y: info.point.y }, msgIndex);
      }}
      onDragEnd={() => {
        if (
          crossMessageEmbedDropTargetIndex !== null &&
          crossMessageEmbedDropTargetIndex !== msgIndex
        ) {
          moveEmbedToMessage(msgIndex, crossMessageEmbedDropTargetIndex, embed.id);
        }
        setCrossMessageEmbedDrag(null);
        setCrossMessageEmbedDropTargetIndex(null);
        setSourceEmbedCompactReady(false);
      }}
      style={{ position: 'relative' }}
      whileDrag={{
        zIndex: 50,
        scale: uiMotion.reduced ? 1 : 1.01,
        boxShadow: `inset 4px 0 0 ${intToHex(embed.color)}, 0 14px 34px rgba(0,0,0,0.24)`,
      }}
    >
      <EmbedEditor
        embed={{ ...embed, _dragControls: controls }}
        index={embedIndex}
        collapsed={collapsed}
        onCollapsedChange={collapsed => setEmbedCollapsed(embed.id, collapsed)}
        forceCollapsed={forceCollapse}
        isFocused={!!isFocused}
        focusedSection={focusedSection}
        focusedFieldId={focusedFieldId}
        focusRequestId={focusRequestId}
        onChange={(ne) => {
          updateMessage(msgIndex, (m) => {
            const currentEmbedIndex = m.embeds.findIndex((entry) => entry.id === embed.id);
            if (currentEmbedIndex === -1) return m;

            const embeds = [...m.embeds];
            embeds[currentEmbedIndex] = embedForStorage(ne);
            return pruneUnusedMessageAttachments({ ...m, embeds });
          });
        }}
        onRemove={() =>
          updateMessage(msgIndex, (m) =>
            pruneUnusedMessageAttachments({
              ...m,
              embeds: m.embeds.filter((entry) => entry.id !== embed.id),
            })
          )
        }
        onDuplicate={() =>
          updateMessage(msgIndex, (m) => {
            const currentEmbedIndex = m.embeds.findIndex((entry) => entry.id === embed.id);
            if (currentEmbedIndex === -1) return m;
            const dup = {
              ...embedForStorage({ ...m.embeds[currentEmbedIndex] } as EmbedWithDragControls),
              id: uid(),
            };
            return pruneUnusedMessageAttachments({
              ...m,
              embeds: [...m.embeds.slice(0, currentEmbedIndex + 1), dup, ...m.embeds.slice(currentEmbedIndex + 1)],
            });
          })
        }
        onMoveUp={
          embedIndex > 0
            ? () =>
                updateMessage(msgIndex, (m) => {
                  const currentEmbedIndex = m.embeds.findIndex((entry) => entry.id === embed.id);
                  if (currentEmbedIndex <= 0) return m;
                  const e = [...m.embeds];
                  [e[currentEmbedIndex - 1], e[currentEmbedIndex]] = [e[currentEmbedIndex], e[currentEmbedIndex - 1]];
                  return pruneUnusedMessageAttachments({ ...m, embeds: e });
                })
            : undefined
        }
        onMoveDown={
          embedIndex < embedCount - 1
            ? () =>
                updateMessage(msgIndex, (m) => {
                  const currentEmbedIndex = m.embeds.findIndex((entry) => entry.id === embed.id);
                  if (currentEmbedIndex === -1 || currentEmbedIndex >= m.embeds.length - 1) return m;
                  const e = [...m.embeds];
                  [e[currentEmbedIndex], e[currentEmbedIndex + 1]] = [e[currentEmbedIndex + 1], e[currentEmbedIndex]];
                  return pruneUnusedMessageAttachments({ ...m, embeds: e });
                })
            : undefined
        }
        onFileUpload={(field: EmbedAttachmentField, previewUrl: string, file: File) => {
          updateMessage(msgIndex, (m) => {
            const currentEmbedIndex = m.embeds.findIndex((entry) => entry.id === embed.id);
            if (currentEmbedIndex === -1) return m;

            const embeds = [...m.embeds];
            embeds[currentEmbedIndex] = setEmbedAttachmentUrl(embeds[currentEmbedIndex], field, previewUrl);
            const fieldKey = buildEmbedAttachmentFieldKey(embed.id, field);
            const attachments = [...(m._attachments || [])].filter((attachment) => attachment.fieldKey !== fieldKey);
            attachments.push({ file, previewUrl, fieldKey });
            return pruneUnusedMessageAttachments({ ...m, embeds, _attachments: attachments });
          });
        }}
        attachmentUsage={attachmentUsage}
      />
    </Reorder.Item>
  );
});

export default EmbedReorderItem;
