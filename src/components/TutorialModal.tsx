'use client';
import { useUiMotion } from '@/lib/useUiMotion';
import { useDialogFocus } from '@/lib/useDialogFocus';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { tutorialSections } from '@/lib/tutorials';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';
import { IconBookOpen, IconX } from '@/components/MeowIcons';
import { motion } from 'framer-motion';

interface TutorialModalProps {
  onClose: () => void;
}

export default function TutorialModal({ onClose }: TutorialModalProps) {
  const [activeSection, setActiveSection] = useState(0);
  const articleRef = useRef<HTMLDivElement>(null);

  useBodyScrollLock(true);

  const uiMotion = useUiMotion();
  const dialogRef = useDialogFocus(onClose);
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  useEffect(() => {
    articleRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [activeSection]);

  return (
    <motion.div className="modal-overlay" onClick={onClose} {...uiMotion.overlay}>
      <motion.div className="modal-content tutorial-modal-shell font-display" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="tutorial-modal-title" onClick={(e) => e.stopPropagation()} style={{ padding: 0 }} {...uiMotion.dialog}>
        <div className="tutorial-modal-header">
          <div className="tutorial-modal-header__brand">
            <span className="tutorial-modal-header__icon" aria-hidden>
              <IconBookOpen size={22} strokeWidth={2} />
            </span>
            <div>
              <h2 id="tutorial-modal-title" className="font-display tutorial-modal-title">Guide</h2>
              <p className="tutorial-modal-subtitle">Limits, editor tips, and Discord webhook behavior</p>
            </div>
          </div>
          <div className="tutorial-modal-header__actions">
            <Link href="/docs" className="btn btn-secondary btn-sm tutorial-modal-docs-btn" onClick={onClose}>
              Full docs
            </Link>
            <button type="button" className="btn btn-ghost tutorial-modal-close" onClick={onClose} aria-label="Close guide">
              <IconX size={20} />
            </button>
          </div>
        </div>

        <div className="tutorial-modal-layout">
          <nav className="tutorial-modal-sidebar" aria-label="Guide sections">
            {tutorialSections.map((section, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActiveSection(i)}
                className={`tutorial-modal-tab ${activeSection === i ? 'is-active' : ''}`}
              >
                <span>{section.title}</span>
              </button>
            ))}
          </nav>

          <div ref={articleRef} className="tutorial-modal-body tutorial-content">
            <div dangerouslySetInnerHTML={{ __html: tutorialSections[activeSection].content }} />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
