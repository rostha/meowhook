'use client';
import { useUiMotion } from '@/lib/useUiMotion';

import { createPortal } from 'react-dom';
import { useAppStore } from '@/stores/useAppStore';
import { useState, useRef, useEffect, useCallback, useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createDefaultMessage, uid } from '@/lib/utils';

import SidebarHeader from './sidebar/SidebarHeader';
import SidebarDraftsList from './sidebar/SidebarDraftsList';
import SidebarActionsPanel from './sidebar/SidebarActionsPanel';
import SidebarFooter from './sidebar/SidebarFooter';
import FormattingHints from './FormattingHints';
import SidebarConfirmDialogs from './sidebar/SidebarConfirmDialogs';

interface SidebarProps {
  visible: boolean;
  collapsed: boolean;
  onClose: () => void;
  onCollapse: () => void;
}

export default function Sidebar({ visible, collapsed, onClose, onCollapse }: SidebarProps) {
  const uiMotion = useUiMotion();
  const tabs = useAppStore((s) => s.tabs);
  const activeTabIndex = useAppStore((s) => s.activeTabIndex);
  const addTab = useAppStore((s) => s.addTab);
  const removeTab = useAppStore((s) => s.removeTab);
  const renameTab = useAppStore((s) => s.renameTab);
  const setTabs = useAppStore((s) => s.setTabs);
  const reorderTabs = useAppStore((s) => s.reorderTabs);
  const setActiveTabIndex = useAppStore((s) => s.setActiveTabIndex);
  const showToast = useAppStore((s) => s.showToast);
  const theme = useAppStore((s) => s.settings.theme);

  const [confirmClearDrafts, setConfirmClearDrafts] = useState(false);
  const [confirmDeleteDraftId, setConfirmDeleteDraftId] = useState<string | null>(null);
  const drawerRef = useRef<HTMLElement>(null);

  const isMobile = useSyncExternalStore(
    useCallback((onStoreChange: () => void) => {
      if (typeof window === 'undefined') return () => {};
      const media = window.matchMedia('(max-width: 1200px)');
      const handleChange = () => onStoreChange();

      if (typeof media.addEventListener === 'function') {
        media.addEventListener('change', handleChange);
      } else {
        media.addListener(handleChange);
      }

      return () => {
        if (typeof media.removeEventListener === 'function') {
          media.removeEventListener('change', handleChange);
        } else {
          media.removeListener(handleChange);
        }
      };
    }, []),
    () => (typeof window !== 'undefined' ? window.matchMedia('(max-width: 1200px)').matches : false),
    () => false,
  );


  useEffect(() => {
    if (!isMobile || !visible) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isMobile, visible, onClose]);

  useEffect(() => {
    if (!isMobile || !visible) return;
    const trigger = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => {
      drawerRef.current?.querySelector<HTMLButtonElement>('.drafts-close')?.focus({ preventScroll: true });
    });
    const containFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !drawerRef.current) return;
      // A confirmation dialog takes focus independently of the drawer.
      if (document.querySelector('.modal-overlay [role="dialog"], .modal-overlay [role="alertdialog"]')) return;
      const controls = Array.from(drawerRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]'
      )).filter((element) => element.getClientRects().length > 0 && !element.closest('[inert]'));
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && (document.activeElement === first || !drawerRef.current.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !drawerRef.current.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', containFocus);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', containFocus);
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [isMobile, visible]);

  const handleClearDrafts = () => setConfirmClearDrafts(true);

  const confirmClearDraftsAction = () => {
    setConfirmClearDrafts(false);
    const currentWebhookUrl = tabs[activeTabIndex]?.webhookUrl || '';
    setTabs([{ id: uid(), name: 'Draft 1', messages: [createDefaultMessage()], webhookUrl: currentWebhookUrl }]);
    setActiveTabIndex(0);
    showToast('All drafts cleared', 'info');
  };

  /** Keep a tappable scrim beside the mobile drawer. */
  const mobileStyle = isMobile
    ? {
        position: 'fixed' as const,
        left: 0,
        top: 'calc(env(safe-area-inset-top, 0px) + 56px)',
        bottom: 0,
        maxHeight: 'calc(100dvh - env(safe-area-inset-top, 0px) - 56px)',
        width: 'min(320px, 88vw)',
        minWidth: 0,
        maxWidth: 'min(320px, 88vw)',
        zIndex: 300,
        transform: visible ? 'translateX(0)' : 'translateX(calc(-100% - 24px))',
        transition: `transform var(--motion-${visible ? 'enter' : 'exit'}) var(--motion-ease)`,
        borderRight: 'none',
        pointerEvents: visible ? 'auto' as const : 'none' as const,
      }
    : {};

  const sidebar = (
    <>
      <AnimatePresence>
        {visible && isMobile && (
          <motion.div
            key="sidebar-scrim"
            className="sidebar-mobile-scrim"
            onClick={onClose}
            {...uiMotion.overlay}
          />
        )}
      </AnimatePresence>

      <aside
        id="drafts-sidebar"
        ref={drawerRef}
        role={isMobile ? 'dialog' : undefined}
        aria-label="Drafts"
        aria-modal={isMobile && visible ? true : undefined}
        inert={isMobile ? !visible : collapsed}
        aria-hidden={(isMobile ? !visible : collapsed) || undefined}
        className={`sidebar-dotmatrix${isMobile ? ' sidebar-dotmatrix--mobile' : ''}${isMobile && visible ? ' sidebar-dotmatrix--mobile-open' : ''}${!isMobile && collapsed ? ' sidebar-dotmatrix--collapsed' : ''}`}
        style={{
          width: !isMobile && collapsed ? 0 : 272,
          minWidth: !isMobile && collapsed ? 0 : 272,
          background: 'var(--bg-secondary)',
          borderRight: !isMobile && collapsed ? 'none' : '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          flexShrink: 0,
          position: 'relative',
          ...mobileStyle,
        }}
      >
        <div className="drafts-sidebar-shell">
          <SidebarHeader tabsLength={tabs.length} isMobile={isMobile} onClose={onClose} onCollapse={onCollapse} onAdd={addTab} />

          <div className="drafts-sidebar-content">
            <SidebarActionsPanel
              tabs={tabs}
              activeTabIndex={activeTabIndex}
              setTabs={setTabs}
              setActiveTabIndex={setActiveTabIndex}
              showToast={showToast}
              onClearDrafts={handleClearDrafts}
            >
              <SidebarDraftsList
                tabs={tabs}
                activeTabIndex={activeTabIndex}
                reorderTabs={reorderTabs}
                setActiveTabIndex={setActiveTabIndex}
                renameTab={renameTab}
                setConfirmDeleteDraftId={setConfirmDeleteDraftId}
              />
            </SidebarActionsPanel>
            <div className="sidebar-formatting"><FormattingHints /></div>
          </div>

          <SidebarFooter isMobile={isMobile} theme={theme} />
        </div>
      </aside>

      <SidebarConfirmDialogs
        confirmClearDrafts={confirmClearDrafts}
        confirmDeleteDraftId={confirmDeleteDraftId}
        tabs={tabs}
        onConfirmClearDrafts={confirmClearDraftsAction}
        onCancelClearDrafts={() => setConfirmClearDrafts(false)}
        onConfirmDeleteDraft={() => {
          const idx = tabs.findIndex((t) => t.id === confirmDeleteDraftId);
          if (idx >= 0) {
            if (tabs.length === 1) {
              setTabs([{ id: uid(), name: 'Draft 1', messages: [createDefaultMessage()], webhookUrl: '' }]);
              setActiveTabIndex(0);
            } else {
              removeTab(idx);
            }
          }
          setConfirmDeleteDraftId(null);
        }}
        onCancelDeleteDraft={() => setConfirmDeleteDraftId(null)}
      />
    </>
  );
  return isMobile ? createPortal(sidebar, document.body) : sidebar;
}
