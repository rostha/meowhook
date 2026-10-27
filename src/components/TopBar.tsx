'use client';
import { useUiMotion } from '@/lib/useUiMotion';
import { useDialogFocus } from '@/lib/useDialogFocus';
import { useState, useEffect, useCallback } from 'react';

import Link from 'next/link';
import { useAppStore } from '@/stores/useAppStore';
import type { AppTheme } from '@/lib/themes';
import { getBrandAssets } from '@/lib/brandAssets';
import type { ComponentType } from 'react';
import {
  IconMenu,
  IconSidebar,
  IconNavHamburger,
  IconJson,
  IconTemplates,
  IconBookOpen,
  IconFileText,
  IconHelpBubble,
  IconMessage,
  IconThemeOrbit,
  IconX,
  IconUndo,
  IconRedo,
  IconGrid,
  IconSaveDisk,
  type MeowIconProps,
} from '@/components/MeowIcons';
import ThemeFlyout from './ThemeFlyout';
import { motion, AnimatePresence } from 'framer-motion';



const SHORTCUT_GROUPS = [
  [
    { keys: 'Ctrl/Cmd+Z', label: 'Undo latest draft change' },
    { keys: 'Ctrl/Cmd+Shift+Z', label: 'Redo latest draft change' },
    { keys: '?', label: 'Open this shortcuts sheet' },
  ],
  [
    { keys: 'Alt+Shift+N', label: 'Add a new message' },
    { keys: 'Alt+Shift+E', label: 'Add an embed to the active message' },
    { keys: 'Alt+Shift+D', label: 'Duplicate the active message' },
    { keys: 'Alt+Shift+C', label: 'Jump back to active message content' },
  ],
];

interface TopBarProps {
  onOpenJson: () => void;
  onOpenTemplates: () => void;
  onOpenTutorial: () => void;
  onOpenFaq: () => void;
  onOpenFeedback: () => void;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  onToggleDesktopSidebar: () => void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}

export default function TopBar({ onOpenJson, onOpenTemplates, onOpenTutorial, onOpenFaq, onOpenFeedback, onToggleSidebar, sidebarOpen, sidebarCollapsed, onToggleDesktopSidebar }: TopBarProps) {
  const uiMotion = useUiMotion();
  const [showThemes, setShowThemes] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const shortcutsRef = useDialogFocus(() => setShowShortcuts(false), showShortcuts);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const canUndo = useAppStore((s) => s.canUndo);
  const canRedo = useAppStore((s) => s.canRedo);
  const brand = getBrandAssets(settings.theme);
  const undoDraftChange = useAppStore((s) => s.undoDraftChange);
  const redoDraftChange = useAppStore((s) => s.redoDraftChange);

  const closeThemes = useCallback(() => setShowThemes(false), []);
  const closeMobileTools = useCallback(() => setMobileToolsOpen(false), []);
  const openShortcuts = useCallback(() => {
    setShowShortcuts(true);
    setShowThemes(false);
    setMobileToolsOpen(false);
  }, []);

  const toggleMobileTools = useCallback(() => {
    setMobileToolsOpen((o) => !o);
    setShowThemes(false);
  }, []);
  useEffect(() => {
    if (!showThemes) return;
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') closeThemes(); };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showThemes, closeThemes]);

  useEffect(() => {
    if (!mobileToolsOpen) return;
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') closeMobileTools(); };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [mobileToolsOpen, closeMobileTools]);

  useEffect(() => {
    if (!showShortcuts) return;
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowShortcuts(false); };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showShortcuts]);

  useEffect(() => {
    const handleHistoryShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditableTarget(event.target)) return;
      const usesModifier = event.metaKey || event.ctrlKey;
      if (!usesModifier || event.altKey) return;

      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        if (!canUndo) return;
        event.preventDefault();
        undoDraftChange();
        return;
      }
      if ((key === 'z' && event.shiftKey) || key === 'y') {
        if (!canRedo) return;
        event.preventDefault();
        redoDraftChange();
      }
    };

    window.addEventListener('keydown', handleHistoryShortcut);
    return () => window.removeEventListener('keydown', handleHistoryShortcut);
  }, [canRedo, canUndo, redoDraftChange, undoDraftChange]);

  useEffect(() => {
    const handleShortcutsShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditableTarget(event.target)) return;
      if (event.key === '?' || (event.shiftKey && event.key === '/')) {
        event.preventDefault();
        openShortcuts();
      }
    };

    window.addEventListener('keydown', handleShortcutsShortcut);
    return () => window.removeEventListener('keydown', handleShortcutsShortcut);
  }, [openShortcuts]);

  const navItems: Array<{
    icon: ComponentType<MeowIconProps>;
    label: string;
    onClick?: () => void;
    href?: string;
  }> = [
    { icon: IconGrid, label: 'Dashboard', href: '/dashboard' },
    { icon: IconSaveDisk, label: 'Save to account', onClick: () => window.dispatchEvent(new Event('meowhook:save-account')) },
    { icon: IconJson, label: 'JSON', onClick: onOpenJson },
    { icon: IconTemplates, label: 'Templates', onClick: onOpenTemplates },
    { icon: IconBookOpen, label: 'Guide', onClick: onOpenTutorial },
    { icon: IconFileText, label: 'Docs', href: '/docs' },
    { icon: IconMessage, label: 'Feedback', onClick: onOpenFeedback },
    { icon: IconHelpBubble, label: 'FAQ', onClick: onOpenFaq },
  ];

  const openThemeFromMobile = () => {
    closeMobileTools();
    setShowThemes(true);
  };

  const historyButtons = (
    <div className="topbar-history-cluster">
      <button
        type="button"
        className="btn btn-ghost topbar-history-btn"
        onClick={undoDraftChange}
        title="Undo latest draft change (Ctrl/Cmd+Z)"
        aria-label="Undo latest draft change"
        disabled={!canUndo}
      >
        <IconUndo size={16} strokeWidth={2} aria-hidden />
        <span className="topbar-nav-label">Undo</span>
      </button>
      <button
        type="button"
        className="btn btn-ghost topbar-history-btn"
        onClick={redoDraftChange}
        title="Redo latest draft change (Ctrl/Cmd+Shift+Z)"
        aria-label="Redo latest draft change"
        disabled={!canRedo}
      >
        <IconRedo size={16} strokeWidth={2} aria-hidden />
        <span className="topbar-nav-label">Redo</span>
      </button>
    </div>
  );

  return (
    <>
      <header className="app-topbar">
        <button type="button" className="btn-ghost btn topbar-menu-btn mobile-only" onClick={onToggleSidebar} aria-label={sidebarOpen ? 'Close drafts panel' : 'Open drafts panel'} aria-expanded={sidebarOpen} aria-controls="drafts-sidebar">
          <IconMenu size={20} />
        </button>
        <button id="sidebar-toggle" type="button" className="topbar-sidebar-toggle desktop-only" onClick={onToggleDesktopSidebar}
          aria-label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'} title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'} aria-expanded={!sidebarCollapsed} aria-controls="drafts-sidebar">
          <IconSidebar size={18} aria-hidden />
        </button>

        <h1 className="topbar-logo-cluster topbar-site-heading">
          <motion.div
            style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
            initial={false}
            animate={{ opacity: 1, x: 0 }}
            transition={uiMotion.feedback}
          >
            <img
              src={brand.icon}
              alt="Meowhook"
              style={{ width: 28, height: 28, objectFit: 'contain' }}

            />
            <img
              src={brand.letter}
              alt=""
              className="topbar-title-img"
              style={{ height: 18, objectFit: 'contain', opacity: 0.9 }}
            />
          </motion.div>
        </h1>

        <nav className="topbar-inline-nav desktop-only" aria-label="Toolbar">
          {navItems.map((btn, i) =>
            btn.href ? (
              <div key={i}>
                <Link
                  href={btn.href}
                  className="btn btn-ghost topbar-nav-btn"
                  title={btn.label}
                  aria-label={`Open ${btn.label}`}
                >
                  <btn.icon size={16} strokeWidth={2} aria-hidden />
                  <span className="topbar-nav-label">{btn.label}</span>
                </Link>
              </div>
            ) : (
              <button
                key={i}
                type="button"
                className="btn btn-ghost topbar-nav-btn"
                onClick={btn.onClick}
                title={btn.label}
                aria-label={`Open ${btn.label}`}
              >
                <btn.icon size={16} strokeWidth={2} aria-hidden />
                <span className="topbar-nav-label">{btn.label}</span>
              </button>
            )
          )}
        </nav>

        <div className="topbar-utility-cluster desktop-only">
          {historyButtons}
          <div className="topbar-tool-pill">
            <button
              type="button"
              className="btn btn-ghost topbar-nav-btn topbar-tool-pill__trigger"
              onClick={openShortcuts}
              title="Keyboard shortcuts"
              aria-label="Open keyboard shortcuts"
            >
              <IconHelpBubble size={16} strokeWidth={2} aria-hidden />
              <span className="topbar-nav-label">Shortcuts</span>
            </button>
          </div>
        </div>

        <div className="topbar-theme-slot desktop-only">
          <div className="topbar-theme-pill">
            <button
              type="button"
              className="btn btn-ghost topbar-nav-btn topbar-theme-pill__trigger"
              onClick={() => {
                setShowThemes((open) => !open);
              }}
              title="Appearance & color theme"
              aria-expanded={showThemes}
              aria-haspopup="menu"
            >
              <IconThemeOrbit size={16} strokeWidth={2} aria-hidden />
              <span className="topbar-theme-label">Theme</span>
            </button>
          </div>

          <ThemeFlyout
            isOpen={showThemes}
            onClose={() => setShowThemes(false)}
            activeTheme={settings.theme}
            onSelectTheme={(theme) => updateSettings({ theme })}
            variant="desktop"
          />
        </div>

        <button
          type="button"
          className="btn-ghost btn topbar-mobile-tools-btn mobile-only"
          onClick={toggleMobileTools}
          aria-label={mobileToolsOpen ? 'Close tools menu' : 'Open tools menu'}
          aria-expanded={mobileToolsOpen}
          aria-haspopup="menu"
        >
          <IconNavHamburger size={20} />
        </button>
      </header>

      <AnimatePresence>
        {mobileToolsOpen && (
          <>
            <motion.div
              role="presentation"
              className="topbar-mobile-tools-backdrop mobile-only"
              {...uiMotion.overlay}
              onClick={closeMobileTools}
            />
            <motion.div
              role="menu"
              aria-label="App tools"
              className="topbar-mobile-tools-sheet mobile-only"
              {...uiMotion.popover}
            >
              <div className="topbar-mobile-tools-header">
                <span className="topbar-mobile-tools-header__title">Tools</span>
                <button
                  type="button"
                  className="topbar-mobile-tools-header__close"
                  onClick={closeMobileTools}
                  aria-label="Close tools menu"
                >
                  <IconX size={16} strokeWidth={2} />
                </button>
              </div>
              {navItems.map((item) =>
                item.href ? (
                  <Link
                    key={item.label}
                    href={item.href}
                    role="menuitem"
                    className="topbar-mobile-tools-item"
                    onClick={closeMobileTools}
                  >
                    <span className="topbar-mobile-tools-item__icon" aria-hidden>
                      <item.icon size={18} />
                    </span>
                    <span className="topbar-mobile-tools-item__label">{item.label}</span>
                  </Link>
                ) : (
                  <button
                    key={item.label}
                    type="button"
                    role="menuitem"
                    className="topbar-mobile-tools-item"
                    onClick={() => {
                      item.onClick?.();
                      closeMobileTools();
                    }}
                  >
                    <span className="topbar-mobile-tools-item__icon" aria-hidden>
                      <item.icon size={18} />
                    </span>
                    <span className="topbar-mobile-tools-item__label">{item.label}</span>
                  </button>
                )
              )}
              <div className="topbar-mobile-tools-divider" role="separator" />
              <button
                type="button"
                role="menuitem"
                className="topbar-mobile-tools-item"
                disabled={!canUndo}
                onClick={() => {
                  undoDraftChange();
                  closeMobileTools();
                }}
                style={{ opacity: canUndo ? 1 : 0.45 }}
              >
                <span className="topbar-mobile-tools-item__icon" aria-hidden>
                  <IconUndo size={18} />
                </span>
                <span className="topbar-mobile-tools-item__label">Undo</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="topbar-mobile-tools-item"
                disabled={!canRedo}
                onClick={() => {
                  redoDraftChange();
                  closeMobileTools();
                }}
                style={{ opacity: canRedo ? 1 : 0.45 }}
              >
                <span className="topbar-mobile-tools-item__icon" aria-hidden>
                  <IconRedo size={18} />
                </span>
                <span className="topbar-mobile-tools-item__label">Redo</span>
              </button>
              <div className="topbar-mobile-tools-divider" role="separator" />
              <button
                type="button"
                role="menuitem"
                className="topbar-mobile-tools-item"
                onClick={openThemeFromMobile}
              >
                <span className="topbar-mobile-tools-item__icon" aria-hidden>
                  <IconThemeOrbit size={18} />
                </span>
                <span className="topbar-mobile-tools-item__label">Theme</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="topbar-mobile-tools-item"
                onClick={openShortcuts}
              >
                <span className="topbar-mobile-tools-item__icon" aria-hidden>
                  <IconHelpBubble size={18} />
                </span>
                <span className="topbar-mobile-tools-item__label">Shortcuts</span>
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <ThemeFlyout
        isOpen={showThemes}
        onClose={() => setShowThemes(false)}
        activeTheme={settings.theme}
        onSelectTheme={(theme) => updateSettings({ theme })}
        variant="mobile"
      />

      <AnimatePresence>
        {showShortcuts && (
          <motion.div
            className="modal-overlay"
            {...uiMotion.overlay}
            onClick={() => setShowShortcuts(false)}
          >
            <motion.div
              className="modal-content shortcuts-modal-shell"
              ref={shortcutsRef} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts"
              {...uiMotion.dialog}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="shortcuts-modal-header">
                <div>
                  <h2 className="shortcuts-modal-title">Keyboard Shortcuts</h2>
                  <p className="shortcuts-modal-subtitle">Power actions for faster draft editing and navigation.</p>
                </div>
                <button type="button" className="topbar-theme-flyout__close" onClick={() => setShowShortcuts(false)} aria-label="Close shortcuts">
                  <IconX size={14} />
                </button>
              </div>

              <div className="shortcuts-modal-grid">
                {SHORTCUT_GROUPS.map((group, groupIndex) => (
                  <div key={groupIndex} className="shortcuts-modal-card">
                    {group.map((shortcut) => (
                      <div key={shortcut.keys} className="shortcuts-modal-row">
                        <span className="shortcuts-modal-keys">{shortcut.keys}</span>
                        <span className="shortcuts-modal-label">{shortcut.label}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              <div className="shortcuts-modal-footnote">
                Preview panels are clickable too. Tap a message, embed, field, or attachment in the live preview to jump back to that editor section.
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
