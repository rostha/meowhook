'use client';
import { useUiMotion } from '@/lib/useUiMotion';
import { useDialogFocus } from '@/lib/useDialogFocus';
import { useState } from 'react';
import { IconX, IconShield, IconDatabase, IconLock, IconSearch, IconHelpBubble, IconChevronDown } from '@/components/MeowIcons';
import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function FaqModal({ onClose }: { onClose: () => void }) {
  const uiMotion = useUiMotion();
  const dialogRef = useDialogFocus(onClose);
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const faqs = [
    {
      icon: <IconShield size={22} className="faq-modal-item__icon-svg faq-modal-item__icon-svg--success" />,
      q: 'Is my webhook URL secure?',
      a: 'Your webhook URL stays in your browser and is only used to send requests directly to Discord. If you create a share link, only the message design is sent to the share service. The webhook URL itself is never included in that share payload.'
    },
    {
      icon: <IconDatabase size={22} className="faq-modal-item__icon-svg faq-modal-item__icon-svg--accent" />,
      q: 'Where are my drafts and saved webhooks stored?',
      a: 'Drafts, saved webhooks, backups, and custom templates are stored locally in your browser storage. If share links are enabled, the shared message design is stored remotely for the expiry period you choose so the link can be opened later.'
    },
    {
      icon: <IconLock size={22} className="faq-modal-item__icon-svg faq-modal-item__icon-svg--warning" />,
      q: 'Can anyone else see or intercept my webhook?',
      a: 'Your webhook URL is not placed in the URL bar, so ordinary share links do not leak it. The app does use privacy-focused Umami analytics for aggregate traffic stats, but that does not expose webhook secrets. The main risk is still local access to your device or manually sharing the webhook URL yourself.'
    },
    {
      icon: <IconSearch size={22} className="faq-modal-item__icon-svg faq-modal-item__icon-svg--muted" />,
      q: 'Why does Meowhook need my webhook URL?',
      a: 'Discord requires the webhook URL to send, edit, or delete messages through their API. Meowhook acts as a visual interface for constructing the JSON payload and sending it via Discord\'s API.'
    }
  ];

  return (
    <motion.div className="modal-overlay" onClick={onClose} {...uiMotion.overlay}>
      <motion.div className="modal-content faq-modal-shell" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="faq-modal-title" onClick={(e) => e.stopPropagation()} {...uiMotion.dialog}>
        <div className="faq-modal-header">
          <h2 id="faq-modal-title" className="faq-modal-title">
            <IconHelpBubble size={18} aria-hidden />
            Privacy & FAQ
          </h2>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Close"><IconX size={20} /></button>
        </div>

        <div className="faq-modal-body">

          <div className="faq-modal-banner">
            <div className="faq-modal-banner__title">Saved on this device</div>
            <div className="faq-modal-banner__text">
              Drafts and saved webhooks stay in this browser. Share links upload your message to the share service. Feedback is sent to the site owner. The site also uses Umami for visit statistics.
            </div>
          </div>

          <div className="faq-modal-list">
            {faqs.map((faq, i) => (
              <FaqItem key={i} icon={faq.icon} q={faq.q} a={faq.a} />
            ))}
          </div>

        </div>
      </motion.div>
    </motion.div>
  );
}

function FaqItem({ icon, q, a }: { icon: React.ReactNode; q: string; a: string }) {
  const uiMotion = useUiMotion();
  const [open, setOpen] = useState(false);

  return (
    <div className={`faq-modal-item ${open ? 'faq-modal-item--open' : ''}`}>
      <button type="button" className="faq-modal-item__question-row" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <div className="faq-modal-item__icon">
          {icon}
        </div>
        <span className="faq-modal-item__question">{q}</span>
        <motion.div
          className="faq-modal-item__chevron"
          animate={{ rotate: open ? 180 : 0 }}
          transition={uiMotion.feedback}
        >
          <IconChevronDown size={18} />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="faq-modal-item__answer"
            {...uiMotion.collapse}
          >
            <div className="faq-modal-item__answer-inner">{a}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
