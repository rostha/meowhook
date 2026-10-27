'use client';
import { useEffect, useRef } from 'react';

const dialogs: HTMLElement[] = [];
const selector = 'summary, [contenteditable="true"], button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])';
export function useDialogFocus(onClose: () => void, open = true, initialFocus: 'first' | 'dialog' = 'first') {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogs.push(dialog);
    dialog.tabIndex = -1;
    dialog.inert = false;
    const isTop = () => dialogs.at(-1) === dialog;
    const focusables = () => [...dialog.querySelectorAll<HTMLElement>(selector)].filter(el => el.tabIndex >= 0 && !el.closest('[inert]') && el.getClientRects().length > 0);
    const focusFirst = () => (focusables()[0] ?? dialog).focus();
    const frame = requestAnimationFrame(() => { if (isTop()) { if (initialFocus === 'dialog') dialog.focus({ preventScroll: true }); else focusFirst(); } });
    const onKey = (event: KeyboardEvent) => {
      if (!isTop()) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation(); closeRef.current();
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      const index = items.indexOf(document.activeElement as HTMLElement);
      if (!items.length || (event.shiftKey ? index <= 0 : index === items.length - 1 || index < 0)) {
        event.preventDefault();
        (event.shiftKey ? items.at(-1) ?? dialog : items[0] ?? dialog).focus();
      }
    };
    const onFocus = (event: FocusEvent) => { if (isTop() && !dialog.contains(event.target as Node)) focusFirst(); };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('focusin', onFocus);
    return () => {
      cancelAnimationFrame(frame);
      const wasTop = isTop();
      dialogs.splice(dialogs.indexOf(dialog), 1);
      dialog.inert = true;
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('focusin', onFocus);
      if (wasTop && previous?.isConnected && !previous.closest('[inert]')) previous.focus();
    };
  }, [open, initialFocus]);
  return ref;
}
