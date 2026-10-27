'use client';
import { useUiMotion } from '@/lib/useUiMotion';
import { useDialogFocus } from '@/lib/useDialogFocus';
import { createPortal } from 'react-dom';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';
import { AnimatePresence, motion } from 'framer-motion';
import { IconAlert, IconInfo, IconCheck } from '@/components/MeowIcons';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialogContent({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {

  const uiMotion = useUiMotion();
  const dialogRef = useDialogFocus(onCancel, open);
  useBodyScrollLock(open);


  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <motion.div
      className="modal-overlay"
      onClick={onCancel}
      {...uiMotion.overlay}
      style={{ zIndex: 2000 }}
    >
      <motion.div
        ref={dialogRef} role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        data-variant={variant}
        className="confirm-dialog"
        onClick={(e) => e.stopPropagation()}
        {...uiMotion.dialog}
      >
        <div className="confirm-dialog__top">
          <div className="confirm-dialog__icon-badge" aria-hidden>
            {variant === 'danger' && <IconAlert size={18} strokeWidth={2} />}
            {variant === 'warning' && <IconAlert size={18} strokeWidth={2} style={{ color: 'var(--warning)' }} />}
            {variant === 'info' && <IconInfo size={18} strokeWidth={2} />}
          </div>
          <div className="confirm-dialog__copy">
            <h3 id="confirm-title" className="confirm-dialog__title">
              {title}
            </h3>
            <p id="confirm-message" className="confirm-dialog__message">
              {message}
            </p>
          </div>
        </div>
        <div className="confirm-dialog__actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn btn-sm ${variant === 'danger' ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </motion.div>
    </motion.div>, document.body
  );
}

export default function ConfirmDialog(props: ConfirmDialogProps) {
  return <AnimatePresence propagate>{props.open && <ConfirmDialogContent {...props} />}</AnimatePresence>;
}
