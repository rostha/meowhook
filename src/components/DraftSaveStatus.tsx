'use client';
import { useState } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { stripTransientAttachmentsFromTabs } from '@/lib/draftState';
import ConfirmDialog from './ConfirmDialog';

export default function DraftSaveStatus() {
  const status = useAppStore(s => s.saveStatus);
  const [confirm, setConfirm] = useState(false);
  if (status !== 'conflict' && status !== 'error') return null;
  const download = () => {
    const blob = new Blob([JSON.stringify(stripTransientAttachmentsFromTabs(useAppStore.getState().tabs), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'meowhook-unsaved-drafts.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <div className="draft-save-notice" role="alert">
    <strong>{status === 'conflict' ? 'Another browser tab saved newer drafts.' : 'Your latest changes could not be saved.'}</strong>
    <p>Your edits are still here. Download a copy before reloading. JSON includes text and file references; keep the original uploaded files.</p>
    <div className="draft-save-notice__actions">
      <button className="btn btn-secondary btn-sm" onClick={download}>Download my drafts</button>
      {status === 'error' && <button className="btn btn-secondary btn-sm" onClick={() => useAppStore.getState().saveNow()}>Retry save</button>}
      <button className="btn btn-secondary btn-sm" onClick={() => setConfirm(true)}>Load latest saved drafts</button>
    </div>
    <ConfirmDialog open={confirm} title="Load the saved version?" message="This replaces the unsaved edits in this browser tab. Download your drafts first if you need to keep them." confirmLabel="Load saved drafts" onCancel={() => setConfirm(false)} onConfirm={() => { setConfirm(false); void useAppStore.getState().hydrate(); }} />
  </div>;
}
