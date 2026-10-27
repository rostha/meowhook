'use client';
import { useUiMotion } from '@/lib/useUiMotion';
import { useAppStore } from '@/stores/useAppStore';
import { IconToastOk, IconToastErr, IconToastInfo, IconX } from '@/components/MeowIcons';
import { motion, AnimatePresence } from 'framer-motion';

export default function ToastContainer() {
  const uiMotion = useUiMotion();
  const toasts = useAppStore((s) => s.toasts);
  const removeToast = useAppStore((s) => s.removeToast);

  const icons = { success: IconToastOk, error: IconToastErr, info: IconToastInfo };

  return (
    <div className="toast-container" aria-live="polite" aria-relevant="additions removals">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => {
          const Icon = icons[toast.type];
          return (
            <motion.div
              key={toast.id}
              role={toast.type === 'error' ? 'alert' : 'status'}
              className={`toast toast-${toast.type}`}
              {...uiMotion.dialog}
              layout="position"
            >
              <Icon size={20} strokeWidth={1.75} className="toast-icon" />
              <span className="toast-message" style={{ flex: 1 }}>
                {toast.message}
              </span>
              <button type="button" className="toast-dismiss" onClick={() => removeToast(toast.id)} aria-label="Dismiss">
                <IconX size={18} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
