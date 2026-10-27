'use client';
import { useEffect, useLayoutEffect, useState, useRef, useCallback, lazy, Suspense } from 'react';
import { AnimatePresence, MotionConfig } from 'framer-motion';
import { useAppStore } from '@/stores/useAppStore';
import TopBar from '@/components/TopBar';
import Sidebar from '@/components/Sidebar';
import EditorPanel from '@/components/EditorPanel';
import PreviewPanel from '@/components/PreviewPanel';
import ToastContainer from '@/components/ToastContainer';
import DiscordErrorModal from '@/components/DiscordErrorModal';
import ActionBar from '@/components/ActionBar';
import DraftSaveStatus from '@/components/DraftSaveStatus';
import WorkspaceLoading from '@/components/WorkspaceLoading';
import CloudDraftBridge from '@/components/CloudDraftBridge';
import { IconAlert, IconCheck, IconLoader } from '@/components/MeowIcons';
import { decodeMessagesFromUrlHash, tryDecodeLegacyDataHash } from '@/lib/shareHash';
import { calculateAttachmentUsage } from '@/lib/attachmentTracker';
import { getSendBlockingReason } from '@/lib/payload';
import { isComponentsV2 } from '@/lib/messageComponents';
import { parseImportedDraftData, isValidWebhookUrl } from '@/lib/utils';
import { buildTabsForSharedDraft } from '@/lib/shareDrafts';

const JsonEditor = lazy(() => import('@/components/JsonEditor'));
const FaqModal = lazy(() => import('@/components/FaqModal'));
const FeedbackModal = lazy(() => import('@/components/FeedbackModal'));
const TemplateModal = lazy(() => import('@/components/TemplateModal'));
const TutorialModal = lazy(() => import('@/components/TutorialModal'));

export default function Home() {
  const hydrate = useAppStore((s) => s.hydrate);
  const hydrated = useAppStore(s => s.hydrated);
  const sidebarCollapsed = useAppStore(s => s.settings.sidebarCollapsed ?? false);
  const updateSettings = useAppStore(s => s.updateSettings);
  const saveStatus = useAppStore(s => s.saveStatus);
  const focusTarget = useAppStore(s => s.editorFocusTarget);
  const autoSave = useAppStore((s) => s.autoSave);
  const tabs = useAppStore((s) => s.tabs);
  const activeTabIndex = useAppStore((s) => s.activeTabIndex);
  const activeMessageIndex = useAppStore((s) => s.activeMessageIndex);
  const lastDraftPersistedAt = useAppStore((s) => s.lastDraftPersistedAt);

  const [showJson, setShowJson] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showFaq, setShowFaq] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  /** Default: 44% editor / 56% preview. Drag clamp 25–75%. */
  const [editorWidth, setEditorWidth] = useState(50);
  const [mobileTab, setMobileTab] = useState<'editor' | 'preview'>('editor');
  const showEditorTab = useCallback(() => setMobileTab('editor'), []);
  /** Ref: drag state for listeners (no re-render). State: `active` class on handle (must re-render). */
  const resizingRef = useRef(false);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const handledShareHashRef = useRef<string | null>(null);
  const activeTab = tabs[activeTabIndex];
  const activeMessages = activeTab?.messages ?? [];
  const webhookUrl = activeTab?.webhookUrl ?? '';
  const validWebhook = isValidWebhookUrl(webhookUrl);
  const attachmentTotals = activeMessages.map((message) => calculateAttachmentUsage(message).total);
  const totalEmbeds = activeMessages.reduce((sum, message) => sum + (isComponentsV2(message) ? 0 : message.embeds.length), 0);
  const totalComponents = activeMessages.reduce((sum, message) => sum + (isComponentsV2(message) ? message.componentBlocks?.length ?? 0 : message.linkButtons?.length ?? 0), 0);
  const formatCount = [
    totalEmbeds ? `${totalEmbeds} ${totalEmbeds === 1 ? 'embed' : 'embeds'}` : '',
    totalComponents ? `${totalComponents} ${totalComponents === 1 ? 'component' : 'components'}` : '',
  ].filter(Boolean).join(' · ') || '0 embeds';
  const totalUploads = attachmentTotals.reduce((sum, count) => sum + count, 0);
  const sendBlocked = getSendBlockingReason(activeMessages, attachmentTotals);
  const previewReady = validWebhook && sendBlocked === null;
  const activeMessageLabel =
    activeMessages.length > 0
      ? `Message ${Math.min(activeMessageIndex + 1, activeMessages.length)} of ${activeMessages.length}`
      : 'No messages yet';
  const autosaveLabel = saveStatus === 'saving' ? 'Saving…' : saveStatus === 'conflict' || saveStatus === 'error' ? 'Changes not saved' : lastDraftPersistedAt
    ? `Autosaved ${new Date(lastDraftPersistedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })}`
    : 'Autosave on edit';
  const SaveStatusIcon = saveStatus === 'saved' ? IconCheck : saveStatus === 'saving' ? IconLoader : IconAlert;

  const openSharedDraft = useCallback((data: unknown) => {
    let importedTabs;
    try {
      importedTabs = parseImportedDraftData(data);
    } catch {
      useAppStore.getState().showToast('Invalid or corrupted share data', 'error');
      return false;
    }

    const sharedMessages = importedTabs[0]?.messages;
    if (!sharedMessages || sharedMessages.length === 0) {
      useAppStore.getState().showToast('Shared link did not contain any messages', 'error');
      return false;
    }

    const state = useAppStore.getState();
    const insertResult = buildTabsForSharedDraft(state.tabs, sharedMessages);
    if ('error' in insertResult) {
      state.showToast(insertResult.error, 'error');
      return false;
    }

    state.setTabs(insertResult.tabs);
    state.setActiveTabIndex(insertResult.activeTabIndex);
    state.showToast(
      insertResult.mode === 'added'
        ? 'Share link opened in Temporary'
        : 'Share link loaded into an empty draft in Temporary',
      'success',
    );
    return true;
  }, []);

  const clearShareHash = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (!window.location.hash.startsWith('#s=') && !window.location.hash.startsWith('#data=')) {
      return;
    }
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    handledShareHashRef.current = null;
  }, []);

  const syncHash = useCallback(async () => {
    const hash = window.location.hash;
    if (!hash.startsWith('#s=') && !hash.startsWith('#data=')) {
      handledShareHashRef.current = null;
      return;
    }

    if (handledShareHashRef.current === hash) {
      return;
    }

    if (hash.startsWith('#s=')) {
      let id = hash.slice(3).trim();
      try {
        id = decodeURIComponent(id);
      } catch {
        useAppStore.getState().showToast('Invalid share link', 'error');
        clearShareHash();
        return;
      }
      if (!id) {
        useAppStore.getState().showToast('Invalid share link', 'error');
        clearShareHash();
        return;
      }
      try {
        const res = await fetch(`/api/share/${encodeURIComponent(id)}`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (openSharedDraft(Array.isArray(data) ? data : [data])) {
            handledShareHashRef.current = hash;
            clearShareHash();
          }
        } else {
          useAppStore.getState().showToast('Shared link not found or expired', 'error');
          clearShareHash();
        }
      } catch {
        useAppStore.getState().showToast('Failed to load shared link', 'error');
      }
    } else if (hash.startsWith('#data=')) {
      const raw = hash.slice(6);
      try {
        const messages = decodeMessagesFromUrlHash(raw);
        if (openSharedDraft(messages)) {
          handledShareHashRef.current = hash;
          clearShareHash();
        }
      } catch {
        const legacy = tryDecodeLegacyDataHash(raw);
        if (legacy) {
          if (openSharedDraft(legacy)) {
            handledShareHashRef.current = hash;
            clearShareHash();
          }
        } else {
          useAppStore.getState().showToast('Invalid or corrupted share data', 'error');
          clearShareHash();
        }
      }
    }
  }, [clearShareHash, openSharedDraft]);

  useLayoutEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (hydrated && saveStatus !== 'saved') { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hydrated, saveStatus]);

  useEffect(() => { if (focusTarget) setMobileTab('editor'); }, [focusTarget]);

  useEffect(() => {
    if (!hydrated) return;
    Promise.resolve().then(syncHash);
    window.addEventListener('hashchange', syncHash);
    const interval = setInterval(autoSave, 20000);
    return () => {
      window.removeEventListener('hashchange', syncHash);
      clearInterval(interval);
    };
  }, [autoSave, syncHash, hydrated]);

  // Resize handle
  const handlePointerDown = useCallback(() => {
    resizingRef.current = true;
    setIsResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    let frame = 0;
    let latestX = 0;
    const handleMouseMove = (e: PointerEvent) => {
      if (!resizingRef.current || !containerRef.current) return;
      latestX = e.clientX;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const pct = ((latestX - rect.left) / rect.width) * 100;
        setEditorWidth(Math.max(25, Math.min(75, pct)));
      });
    };
    const handleMouseUp = () => {
      resizingRef.current = false;
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('pointermove', handleMouseMove);
    window.addEventListener('pointerup', handleMouseUp);
    window.addEventListener('pointercancel', handleMouseUp);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', handleMouseMove);
      window.removeEventListener('pointerup', handleMouseUp);
      window.removeEventListener('pointercancel', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, []);

  if (!hydrated) return <WorkspaceLoading />;

  return (
    <MotionConfig reducedMotion="user">
    <div className="app-home-shell" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <TopBar
        onOpenJson={() => setShowJson(true)}
        onOpenTemplates={() => setShowTemplates(true)}
        onOpenTutorial={() => setShowTutorial(true)}
        onOpenFaq={() => setShowFaq(true)}
        onOpenFeedback={() => setShowFeedback(true)}
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
        sidebarOpen={sidebarOpen}
        sidebarCollapsed={sidebarCollapsed}
        onToggleDesktopSidebar={() => updateSettings({ sidebarCollapsed: !sidebarCollapsed })}
      />

      {/* Mobile tabs — pill segment control */}
      <div className="mobile-only mobile-tabs-wrap">
        <div className="mobile-workspace-summary">
          <span className="mobile-workspace-summary__title">{activeTab?.name || 'Draft 1'}</span>
          <span className="mobile-workspace-summary__meta">
            {activeMessages.length} {activeMessages.length === 1 ? 'message' : 'messages'} | {formatCount} | {previewReady ? 'ready' : validWebhook ? 'editing' : 'no webhook'}
          </span>
        </div>
        <div className="mobile-tabs" role="tablist" aria-label="Editor or preview">
          <button type="button" role="tab" aria-selected={mobileTab === 'editor'} className={`mobile-tab ${mobileTab === 'editor' ? 'active' : ''}`} onClick={() => setMobileTab('editor')}>Editor</button>
          <button type="button" role="tab" aria-selected={mobileTab === 'preview'} className={`mobile-tab ${mobileTab === 'preview' ? 'active' : ''}`} onClick={() => setMobileTab('preview')}>Preview</button>
        </div>
      </div>

      <div className="workspace-stage-shell" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', minHeight: 0 }}>
        <div className="workspace-stage" style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
          <Sidebar visible={sidebarOpen} collapsed={sidebarCollapsed} onClose={() => setSidebarOpen(false)} onCollapse={() => {
            document.getElementById('sidebar-toggle')?.focus({ preventScroll: true });
            updateSettings({ sidebarCollapsed: true });
          }} />

          <div
            ref={containerRef}
            className="workspace-stage__panes"
            style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0, alignItems: 'stretch', alignSelf: 'stretch', '--editor-split-pct': editorWidth } as React.CSSProperties}
          >
            <div className={`workspace-pane-shell workspace-pane-shell--editor ${mobileTab === 'preview' ? 'mobile-hidden' : ''}`} style={{ width: `${editorWidth}%` }}>
              <div className="workspace-pane-shell__header desktop-only">
                <div className="workspace-pane-shell__heading">
                  <strong>{activeTab?.name || 'Draft 1'}</strong>
                </div>
                <div className="workspace-pane-shell__meta">
                  <span className="workspace-pane-shell__pill workspace-message-position" aria-label={activeMessageLabel}>Message <strong>{Math.min(activeMessageIndex + 1, activeMessages.length)}</strong><span className="workspace-meta-divider" aria-hidden>/</span>{activeMessages.length}</span>
                  <span className="workspace-pane-shell__pill workspace-save-status" data-state={saveStatus} title="Changes save automatically in this browser"><SaveStatusIcon size={14} aria-hidden /><span>{autosaveLabel}</span></span>
                </div>
              </div>
              <div className="editor-wrapper" style={{ width: '100%', minWidth: 0, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)' }}>
                <DraftSaveStatus />
                <EditorPanel />
              </div>
            </div>
            
            <div
              className={`resize-handle ${isResizing ? 'active' : ''}`}
              role="separator"
              aria-label="Resize editor and preview"
              aria-orientation="vertical"
              aria-valuemin={25}
              aria-valuemax={75}
              aria-valuenow={Math.round(editorWidth)}
              tabIndex={0}
              onPointerDown={handlePointerDown}
              onKeyDown={(event) => {
                if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                  event.preventDefault();
                  setEditorWidth(width => Math.max(25, Math.min(75, width + (event.key === 'ArrowRight' ? 5 : -5))));
                }
                if (event.key === 'Home') setEditorWidth(50);
              }}
            />
            
            <div
              className={`workspace-pane-shell workspace-pane-shell--preview ${mobileTab === 'editor' ? 'mobile-hidden' : ''}`}
              style={{
                width: `${100 - editorWidth}%`,
              }}
            >
              <div className="workspace-pane-shell__header desktop-only">
                <div className="workspace-pane-shell__heading">
                  <strong>Preview</strong>
                </div>
                <div className="workspace-pane-shell__meta">
                  <span className={`workspace-pane-shell__pill workspace-preview-status ${previewReady ? 'is-ready' : validWebhook ? 'is-warn' : ''}`}>
                    {previewReady ? 'Ready to send' : validWebhook ? 'Draft incomplete' : 'No webhook'}
                  </span>
                  <span className="workspace-pane-shell__pill">{formatCount}</span>
                  <span className="workspace-pane-shell__pill">{totalUploads} {totalUploads === 1 ? 'upload' : 'uploads'}</span>
                </div>
              </div>
              <div
                className="preview-wrapper preview-pane-scroll"
                style={{
                  width: '100%',
                  minWidth: 0,
                  minHeight: 0,
                  overflowY: 'auto',
                  overflowX: 'auto',
                  WebkitOverflowScrolling: 'touch',
                  overscrollBehavior: 'contain',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <PreviewPanel onRequestEditorFocus={showEditorTab} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Global Mobile Action Bar */}
      <div className="mobile-only mobile-actionbar-wrap" style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)', zIndex: 10 }}>
        <ActionBar />
      </div>

      <ToastContainer />
      <DiscordErrorModal />

      {/* Load optional tools only when opened. */}
      <Suspense fallback={<span className="editor-loading-notice" role="status">Opening tool…</span>}>
      <CloudDraftBridge />
      <AnimatePresence>
        {showTemplates && (
          <Suspense fallback={null}>
            <TemplateModal key="templates" onClose={() => setShowTemplates(false)} />
          </Suspense>
        )}
        {showTutorial && (
          <Suspense fallback={null}>
            <TutorialModal key="tutorial" onClose={() => setShowTutorial(false)} />
          </Suspense>
        )}
        {showJson && (
            <JsonEditor key="json" onClose={() => setShowJson(false)} />
        )}
        {showFaq && (
            <FaqModal key="faq" onClose={() => setShowFaq(false)} />
        )}
        {showFeedback && (
            <FeedbackModal key="feedback" onClose={() => setShowFeedback(false)} />
        )}
      </AnimatePresence>
      </Suspense>
    </div>
    </MotionConfig>
  );
}
