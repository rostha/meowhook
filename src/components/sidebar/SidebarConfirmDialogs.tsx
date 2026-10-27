'use client';

import { AnimatePresence } from 'framer-motion';
import ConfirmDialog from '@/components/ConfirmDialog';
import type { Tab } from '@/lib/types';

interface SidebarConfirmDialogsProps {
  confirmClearDrafts: boolean;
  confirmDeleteDraftId: string | null;
  tabs: Tab[];
  onConfirmClearDrafts: () => void;
  onCancelClearDrafts: () => void;
  onConfirmDeleteDraft: () => void;
  onCancelDeleteDraft: () => void;
}

export default function SidebarConfirmDialogs({
  confirmClearDrafts,
  confirmDeleteDraftId,
  tabs,
  onConfirmClearDrafts,
  onCancelClearDrafts,
  onConfirmDeleteDraft,
  onCancelDeleteDraft,
}: SidebarConfirmDialogsProps) {
  return (
    <AnimatePresence>
      {confirmClearDrafts && (
        <ConfirmDialog
          open
          title="Clear all drafts?"
          message="This will permanently delete every draft tab and reset the workspace to a single empty draft. All unsent content across all tabs will be lost. This cannot be undone."
          confirmLabel="Clear All Drafts"
          variant="danger"
          onConfirm={onConfirmClearDrafts}
          onCancel={onCancelClearDrafts}
        />
      )}
      {confirmDeleteDraftId !== null && (
        <ConfirmDialog
          open
          title="Delete draft?"
          message={`Delete "${tabs.find((t) => t.id === confirmDeleteDraftId)?.name || 'this draft'}"? Any unsent content will be lost.${tabs.length === 1 ? ' A new empty draft will take its place.' : ''}`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={onConfirmDeleteDraft}
          onCancel={onCancelDeleteDraft}
        />
      )}
    </AnimatePresence>
  );
}
