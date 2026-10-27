import React from 'react';
import LazySectionContent from '@/components/LazySectionContent';
import type { Embed, Message, FileAttachment } from '@/lib/types';
import type { EmbedWithDragControls } from '@/components/EmbedEditor';

export type CrossMessageEmbedDrag = {
  sourceMessageIndex: number;
  embedId: string;
};

export type DragPoint = {
  x: number;
  y: number;
};

/** Framer drag controls must not be written into tab state (localStorage / JSON). */
export function embedForStorage(e: EmbedWithDragControls): Embed {
  const { _dragControls: _, ...rest } = e;
  return rest;
}

export function syncAvatarPreviewAttachment(message: Message, nextAvatarUrl: string, uploaded?: FileAttachment): Message {
  const avatarAttachments = (message._attachments || []).filter((attachment) => attachment.fieldKey === 'avatar');
  const nonAvatarAttachments = (message._attachments || []).filter((attachment) => attachment.fieldKey !== 'avatar');

  const matchingAvatarAttachment = uploaded?.previewUrl === nextAvatarUrl ? { ...uploaded, fieldKey: 'avatar' } : avatarAttachments.find((attachment) => attachment.previewUrl === nextAvatarUrl);
  const nextAttachments = matchingAvatarAttachment
    ? [...nonAvatarAttachments, matchingAvatarAttachment]
    : nonAvatarAttachments;

  return {
    ...message,
    avatar_url: nextAvatarUrl,
    _attachments: nextAttachments.length > 0 ? nextAttachments : undefined,
  };
}

export function MessageSectionSwap({
  expanded,
  children,
}: {
  expanded: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={[
        'message-section-transition-shell',
        expanded ? 'message-section-transition-shell--expanded' : 'message-section-transition-shell--collapsed',
      ].join(' ')}
      aria-hidden={!expanded}
      inert={!expanded}
    >
      <div className="message-section-transition-inner"><LazySectionContent expanded={expanded}>{children}</LazySectionContent></div>
    </div>
  );
}
