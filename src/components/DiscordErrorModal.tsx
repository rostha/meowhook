'use client';
import { useUiMotion } from '@/lib/useUiMotion';
import { useDialogFocus } from '@/lib/useDialogFocus';

import { useEffect } from 'react';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/stores/useAppStore';
import { IconX } from '@/components/MeowIcons';

const DEFAULT_INTRO =
  'Your message could not be submitted because it contains the following errors:';

export default function DiscordErrorModal() {
  const uiMotion = useUiMotion();
  const modal = useAppStore((s) => s.discordErrorModal);
  const close = useAppStore((s) => s.closeDiscordErrorModal);

  const dialogRef = useDialogFocus(close, Boolean(modal));
  useBodyScrollLock(Boolean(modal));

  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal, close]);

  return (
    <AnimatePresence>
      {modal && (
        <motion.div
          className="modal-overlay"
          style={{ zIndex: 1100 }}
          {...uiMotion.overlay}
          onClick={close}
        >
          <motion.div
            className="modal-content discord-error-modal"
            ref={dialogRef} role="alertdialog"
            aria-modal="true"
            aria-labelledby="discord-error-title"
            aria-describedby="discord-error-desc"
            {...uiMotion.dialog}
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 440,
              padding: 0,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 18px',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <h2
                id="discord-error-title"
                className="font-display"
                style={{ fontSize: 17, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}
              >
                Discord Error
              </h2>
              <button type="button" className="btn btn-ghost" onClick={close} aria-label="Close">
                <IconX size={20} />
              </button>
            </div>

            <div style={{ padding: '16px 18px 18px' }}>
              {modal.headline && modal.headline !== 'Discord Error' && (
                <p
                  style={{
                    margin: '0 0 10px',
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    letterSpacing: '0.02em',
                  }}
                >
                  {modal.headline}
                </p>
              )}
              <p
                id="discord-error-desc"
                style={{
                  margin: '0 0 14px',
                  fontSize: 14,
                  lineHeight: 1.55,
                  color: 'var(--text-secondary)',
                }}
              >
                {modal.intro ?? DEFAULT_INTRO}
              </p>
              <ul
                style={{
                  margin: 0,
                  padding: '0 0 0 18px',
                  fontSize: 13,
                  lineHeight: 1.65,
                  color: 'var(--text-primary)',
                }}
              >
                {modal.details.map((d, i) => (
                  <li key={`${d.path}-${i}`} style={{ marginBottom: 10 }}>
                    {d.path ? (
                      <>
                        In{' '}
                        <code className="discord-error-path">{d.path}</code>: {d.message}
                      </>
                    ) : (
                      d.message
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                padding: '12px 18px 16px',
                borderTop: '1px solid var(--border)',
                background: 'color-mix(in srgb, var(--bg-tertiary) 50%, transparent)',
              }}
            >
              <button type="button" className="btn btn-primary" onClick={close}>
                Close
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
