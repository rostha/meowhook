'use client';
import { useUiMotion } from '@/lib/useUiMotion';

import { useState, useRef, useCallback, type ChangeEvent, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  IconSaveDisk,
  IconFolder,
  IconShareNodes,
  IconDownload,
  IconUpload,
  IconTrash,
  IconX,
  IconCheck,
  IconLink,
  IconLoader,
} from '@/components/MeowIcons';
import { stripTransientAttachmentsFromTabs } from '@/lib/draftState';
import { loadBackups, saveBackups } from '@/lib/storage';
import { messagesForSharePayload, copyTextToClipboard, parseImportedDraftData } from '@/lib/utils';
import { makeTemporarySharedDraftsPersistent } from '@/lib/shareDrafts';
import { encodeMessagesForUrlHash } from '@/lib/shareHash';
import ConfirmDialog from '@/components/ConfirmDialog';
import type { SavedBackup, Tab } from '@/lib/types';

const SHARE_EXPIRY_OPTIONS: { value: string; label: string }[] = [
  { value: '86400', label: '1 day' },
  { value: '259200', label: '3 days' },
  { value: '604800', label: '7 days' },
  { value: '1209600', label: '14 days' },
  { value: '2592000', label: '30 days' },
];

interface SidebarActionsPanelProps {
  children: ReactNode;
  tabs: Tab[];
  activeTabIndex: number;
  setTabs: (tabs: Tab[]) => void;
  setActiveTabIndex: (i: number) => void;
  showToast: (msg: string, variant: 'success' | 'error' | 'info') => void;
  onClearDrafts: () => void;
}

export default function SidebarActionsPanel({
  children,
  tabs,
  activeTabIndex,
  setTabs,
  setActiveTabIndex,
  showToast,
  onClearDrafts,
}: SidebarActionsPanelProps) {
  const uiMotion = useUiMotion();
  const [showBackupForm, setShowBackupForm] = useState(false);
  const [backupName, setBackupName] = useState('');
  const [showBackupList, setShowBackupList] = useState(false);
  const [backups, setBackups] = useState<SavedBackup[]>([]);
  const [confirmDeleteBackup, setConfirmDeleteBackup] = useState<number | null>(null);
  const [showShareForm, setShowShareForm] = useState(false);
  const [shareExpiry, setShareExpiry] = useState('604800');
  const [isGenerating, setIsGenerating] = useState(false);
  const [sharedUrl, setSharedUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [shareHasExpiry, setShareHasExpiry] = useState(true);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const refreshBackups = () => setBackups(loadBackups());
  const closeShareForm = useCallback(() => {
    setShowShareForm(false);
    setSharedUrl(null);
  }, []);

  const openBackupForm = () => {
    setBackupName(`Backup ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
    setShowBackupForm(true);
    setShowBackupList(false);
    closeShareForm();
    setTimeout(() => nameInputRef.current?.select(), 50);
  };

  const confirmBackup = () => {
    if (!backupName.trim()) return;
    const existing = loadBackups();
    if (existing.length >= 15) {
      showToast('Maximum of 15 backups allowed - please delete one first.', 'error');
      return;
    }
    existing.push({
      name: backupName.trim(),
      tabs: stripTransientAttachmentsFromTabs(
        makeTemporarySharedDraftsPersistent(tabs)
      ),
      timestamp: Date.now(),
    });

    const success = saveBackups(existing);
    if (!success) {
      showToast('Storage full! Clear some browser data or backups.', 'error');
      return;
    }

    showToast(`Backup "${backupName.trim()}" saved!`, 'success');
    setShowBackupForm(false);
    setBackupName('');
  };

  const handleSave = () => openBackupForm();

  const handleLoadBackup = (backup: SavedBackup) => {
    try {
      const parsedTabs = parseImportedDraftData(
        JSON.parse(JSON.stringify(makeTemporarySharedDraftsPersistent(backup.tabs)))
      );
      setTabs(parsedTabs);
      setActiveTabIndex(0);
      showToast(`Loaded "${backup.name}"`, 'success');
      setShowBackupList(false);
    } catch {
      showToast('That backup is invalid or corrupted.', 'error');
    }
  };

  const handleDeleteBackup = (index: number) => {
    setConfirmDeleteBackup(index);
  };
  const confirmDeleteBackupAction = () => {
    if (confirmDeleteBackup === null) return;
    const existing = loadBackups();
    existing.splice(confirmDeleteBackup, 1);
    if (!saveBackups(existing)) { showToast('Could not delete the backup. Please try again.', 'error'); return; }
    refreshBackups();
    showToast('Backup deleted', 'info');
    setConfirmDeleteBackup(null);
  };

  const handleShareClick = () => {
    if (showShareForm) {
      closeShareForm();
      return;
    }
    setSharedUrl(null);
    setShowShareForm(true);
    setShowBackupForm(false);
    setShowBackupList(false);
  };

  const confirmShare = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setSharedUrl(null);
    try {
      const messages = messagesForSharePayload(tabs[activeTabIndex].messages);
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, expiresIn: parseInt(shareExpiry, 10) }),
      });
      const payload = await res.json().catch(() => ({})) as { id?: string; fallback?: boolean; error?: string };
      let url: string;
      setShareHasExpiry(payload.fallback !== true);
      if (payload.fallback === true) {
        try {
          const encoded = encodeMessagesForUrlHash(messages);
          url = `${window.location.origin}/#data=${encoded}`;
        } catch (e) {
          if (e instanceof Error && e.message === 'SHARE_TOO_LARGE') {
            showToast('Payload too large for a share link (max ~50KB).', 'error');
          } else {
            showToast('Could not build share link', 'error');
          }
          return;
        }
      } else if (!res.ok) {
        const detail = typeof payload.error === 'string' ? payload.error : 'Failed to create share URL';
        showToast(detail, 'error');
        return;
      } else {
        const { id } = payload;
        if (!id || typeof id !== 'string') {
          showToast('Invalid response from share service', 'error');
          return;
        }
        url = `${window.location.origin}/#s=${encodeURIComponent(id)}`;
      }
      setSharedUrl(url);
      const copied = await copyTextToClipboard(url);
      if (copied) {
        showToast('Share URL copied to clipboard!', 'success');
      } else {
        showToast('Share link generated!', 'success');
      }
    } catch {
      showToast('Failed to create share URL', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExport = () => {
    const blob = new Blob(
      [JSON.stringify(stripTransientAttachmentsFromTabs(makeTemporarySharedDraftsPersistent(tabs)), null, 2)],
      { type: 'application/json' }
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'meowhook-export.json';
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('JSON exported. Uploaded files stay in this browser; keep the original files when moving to another device.', 'info');
  };

  const handleImport = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        const parsedTabs = makeTemporarySharedDraftsPersistent(parseImportedDraftData(data));
        setTabs(parsedTabs);
        setActiveTabIndex(0);
        showToast('Imported!', 'success');
      } catch { showToast('Invalid JSON file', 'error'); }
    };
    reader.onerror = () => {
      showToast('Failed to read file. Please try again.', 'error');
    };
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <>
      <div className="drafts-library">{children}</div>
      <div className="drafts-tools">
        <div className="drafts-action-grid" role="group" aria-label="Draft actions">
          <button type="button" className="drafts-action" aria-label="Import JSON" title="Import JSON" onClick={() => fileRef.current?.click()}><IconUpload size={18} aria-hidden /><span>Import</span></button>
          <button type="button" className="drafts-action" aria-label="Export JSON" title="Export JSON" onClick={handleExport}><IconDownload size={18} aria-hidden /><span>Export</span></button>
          <button type="button" className="drafts-action" aria-label="Save a backup" title="Save a backup" aria-expanded={showBackupForm} onClick={() => showBackupForm ? setShowBackupForm(false) : handleSave()}><IconSaveDisk size={18} aria-hidden /><span>Backup</span></button>
          <button type="button" className="drafts-action" aria-label="Restore a backup" title="Restore a backup" aria-expanded={showBackupList} onClick={() => { refreshBackups(); setShowBackupList(!showBackupList); setShowBackupForm(false); closeShareForm(); }}><IconFolder size={18} aria-hidden /><span>Restore</span></button>
          <button type="button" className="drafts-action" aria-label="Share current draft" title="Share current draft" aria-expanded={showShareForm} onClick={handleShareClick}><IconShareNodes size={18} aria-hidden /><span>Share</span></button>
          <button type="button" className="drafts-action drafts-tools__clear" aria-label="Clear all drafts" title="Clear all drafts" onClick={onClearDrafts}><IconTrash size={18} aria-hidden /><span>Clear all</span></button>
        </div>

        <AnimatePresence>
        {showShareForm && (
          <motion.div {...uiMotion.collapse} style={{ overflow: 'hidden' }}>
          <section className="draft-share-panel" aria-label="Share draft settings">
            <p>Share a copy of <strong>{tabs[activeTabIndex]?.name || 'this draft'}</strong>.</p>
            <label className="draft-share-panel__expiry">
              <span>Link expires after</span>
              <select value={shareExpiry} disabled={isGenerating} onChange={e => { setShareExpiry(e.target.value); setSharedUrl(null); }}>
                {SHARE_EXPIRY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            {sharedUrl ? (
              <div className="draft-share-panel__result">
                <label>Share link<input aria-label="Share link" value={sharedUrl} readOnly onClick={e => e.currentTarget.select()} /></label>
                <p role="status">{shareHasExpiry ? 'Link ready. Anyone with it can view this copy.' : 'This fallback link has no expiry. Anyone with it can view this copy.'}</p>
                <button type="button" className="draft-share-panel__create" onClick={async () => {
                  const copied = await copyTextToClipboard(sharedUrl);
                  showToast(copied ? 'Link copied' : 'Select the link and copy it manually.', copied ? 'success' : 'info');
                }}><IconLink size={15} /> Copy link</button>
              </div>
            ) : (
              <button type="button" className="draft-share-panel__create" onClick={confirmShare} disabled={isGenerating}>
                {isGenerating ? <IconLoader size={15} /> : <IconLink size={15} />}
                {isGenerating ? 'Creating link…' : 'Create link'}
              </button>
            )}
          </section>
          </motion.div>
        )}
        </AnimatePresence>
      <input ref={fileRef} type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />

      {/* Inline Backup Form */}
      <AnimatePresence>
        {showBackupForm && (
          <motion.div
            {...uiMotion.collapse}
            className="drafts-backup-panel"
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '12px 10px' }}>
              <div style={{ fontSize: 11, fontWeight: 650, color: 'var(--text-secondary)', marginBottom: 8 }}>Save backup</div>
              <input ref={nameInputRef} value={backupName} onChange={(e) => setBackupName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && confirmBackup()} aria-label="Backup name" placeholder="Backup name" style={{ fontSize: 12, padding: '6px 8px', marginBottom: 6 }} autoFocus />
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn btn-success btn-sm" onClick={confirmBackup} style={{ flex: 1, justifyContent: 'center', fontSize: 11, padding: '5px' }}>
                  <IconCheck size={14} /> Save
                </button>
                <button className="btn btn-secondary btn-sm" aria-label="Cancel backup" onClick={() => setShowBackupForm(false)} style={{ padding: '5px 8px', fontSize: 11 }}><IconX size={14} /></button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Backup List */}
      <AnimatePresence>
        {showBackupList && (
          <motion.div
            {...uiMotion.collapse}
            className="drafts-backup-panel"
            style={{ maxHeight: 200, overflowY: 'auto', overflowX: 'hidden' }}
          >
            <div style={{ padding: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 650, color: 'var(--text-secondary)' }}>Saved backups</span>
                <button aria-label="Close backups" onClick={() => setShowBackupList(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2 }}><IconX size={14} /></button>
              </div>
              {backups.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '10px 0', textAlign: 'center' }}>No backups yet</div>}
              {backups.map((b, i) => (
                <div key={`${b.timestamp}-${i}`} className="drafts-backup-entry">
                  <button type="button" className="drafts-backup-entry__load" onClick={() => handleLoadBackup(b)}>
                    <div style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{b.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{new Date(b.timestamp).toLocaleString()}</div>
                  </button>
                  <button type="button" aria-label={`Delete backup ${b.name}`} className="drafts-backup-entry__delete" onClick={() => handleDeleteBackup(i)}><IconTrash size={14} /></button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      </div>

      <AnimatePresence>
        {confirmDeleteBackup !== null && (
          <ConfirmDialog
            open
            title="Delete backup?"
            message={`This will permanently delete "${backups[confirmDeleteBackup]?.name || 'this backup'}". This cannot be undone.`}
            confirmLabel="Delete"
            variant="danger"
            onConfirm={confirmDeleteBackupAction}
            onCancel={() => setConfirmDeleteBackup(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
