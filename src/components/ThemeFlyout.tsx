'use client';
import { useUiMotion } from '@/lib/useUiMotion';

import type { ComponentType } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AppTheme } from '@/lib/themes';
import {
  IconThemeOrbit,
  IconX,
  IconCheck,
  IconMoon,
  IconSun,
  IconMonitor,
  IconMug,
  IconDroplet,
  IconSnowCrystal,
  type MeowIconProps,
} from '@/components/MeowIcons';

const THEMES: { id: AppTheme; name: string; icon: ComponentType<MeowIconProps> }[] = [
  { id: 'discord-dark', name: 'Discord Dark', icon: IconMoon },
  { id: 'discord-light', name: 'Discord Light', icon: IconSun },
  { id: 'midnight-oled', name: 'Midnight OLED', icon: IconMonitor },
  { id: 'catppuccin', name: 'Catppuccin', icon: IconMug },
  { id: 'dracula', name: 'Dracula', icon: IconDroplet },
  { id: 'nord', name: 'Nord', icon: IconSnowCrystal },
];

export { THEMES };

interface ThemeFlyoutProps {
  isOpen: boolean;
  onClose: () => void;
  activeTheme: AppTheme;
  onSelectTheme: (theme: AppTheme) => void;
  variant: 'desktop' | 'mobile';
}

export default function ThemeFlyout({ isOpen, onClose, activeTheme, onSelectTheme, variant }: ThemeFlyoutProps) {
  const uiMotion = useUiMotion();
  const isDesktop = variant === 'desktop';
  const scrimClass = isDesktop ? 'topbar-theme-scrim--desktop' : 'topbar-theme-scrim--mobile mobile-only';
  const flyoutClass = isDesktop ? 'topbar-theme-flyout--desktop' : 'topbar-theme-flyout--mobile mobile-only';

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {isDesktop ? (
            <div role="presentation" className={`topbar-theme-scrim ${scrimClass}`} onClick={onClose} />
          ) : (
            <motion.div
              role="presentation"
              className={`topbar-theme-scrim ${scrimClass}`}
              {...uiMotion.overlay}
              onClick={onClose}
            />
          )}
          <motion.div
            className={`topbar-theme-flyout ${flyoutClass}`}
            {...uiMotion.popover}
          >
            <div className="topbar-theme-flyout__head">
              <span className="topbar-theme-flyout__head-title">Theme</span>
              <button type="button" onClick={onClose} className="topbar-theme-flyout__close" aria-label="Close theme menu">
                <IconX size={13} />
              </button>
            </div>
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => { onSelectTheme(t.id); onClose(); }}
                className="topbar-theme-option"
                data-active={activeTheme === t.id ? 'true' : undefined}
              >
                <div className="topbar-theme-option__icon-wrap">
                  <t.icon size={14} style={{ color: 'currentColor' }} />
                </div>
                <span className="topbar-theme-option__name">{t.name}</span>
                {activeTheme === t.id && <IconCheck size={14} style={{ color: 'var(--success)' }} />}
              </button>
            ))}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
