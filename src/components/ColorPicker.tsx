'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { useUiMotion } from '@/lib/useUiMotion';
import { useDialogFocus } from '@/lib/useDialogFocus';

import { createPortal } from 'react-dom';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { hexToHsv, hsvToHex, type HSV } from '@/lib/colorPickerColor';
import { clampFloatingPosition, floatingViewport } from '@/lib/floatingViewport';

interface ColorPickerProps {
  color: string;
  onChange: (hex: string) => void;
  label?: string;
}

const PANEL_WIDTH = 236;
const PANEL_GAP = 10;
const VIEWPORT_MARGIN = 12;

export default function ColorPicker({ color, onChange, label = 'Embed color' }: ColorPickerProps) {
  const uiMotion = useUiMotion();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(color));
  const [hexInput, setHexInput] = useState(color);
  const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useDialogFocus(() => setOpen(false), open && mounted, 'dialog');
  const [viewport, setViewport] = useState(floatingViewport);
  const gradientRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const hsvRef = useRef(hsv);
  const lastEmittedColorRef = useRef<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (color.toLowerCase() === lastEmittedColorRef.current) return;
    const nextHsv = hexToHsv(color, hsvRef.current[0]);
    hsvRef.current = nextHsv;
    setHsv(nextHsv);
    setHexInput(color);
  }, [color]);

  const commitColor = useCallback((nextHsv: HSV) => {
    const nextHex = hsvToHex(...nextHsv);
    hsvRef.current = nextHsv;
    setHsv(nextHsv);
    setHexInput(nextHex);
    lastEmittedColorRef.current = nextHex;
    onChange(nextHex);
  }, [onChange]);

  const updatePopoverPosition = useCallback(() => {
    const triggerRect = triggerRef.current?.getBoundingClientRect();
    if (!triggerRect) return;

    const panelWidth = panelRef.current?.offsetWidth ?? PANEL_WIDTH;
    const panelHeight = panelRef.current?.offsetHeight ?? 250;
    const visible = floatingViewport();

    let left = triggerRect.left;
    let top = triggerRect.bottom + PANEL_GAP;

    if (left + panelWidth > visible.left + visible.width - VIEWPORT_MARGIN) {
      left = visible.left + visible.width - panelWidth - VIEWPORT_MARGIN;
    }
    left = Math.max(VIEWPORT_MARGIN, left);

    if (top + panelHeight > visible.top + visible.height - VIEWPORT_MARGIN) {
      top = triggerRect.top - panelHeight - PANEL_GAP;
    }

    const next = clampFloatingPosition(left, top, panelWidth, panelHeight, visible, VIEWPORT_MARGIN);
    setPopoverPosition({ top: next.y, left: next.x });
    setViewport(visible);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;

    const frame = window.requestAnimationFrame(updatePopoverPosition);
    const handleViewportChange = () => updatePopoverPosition();

    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    window.visualViewport?.addEventListener('resize', handleViewportChange);
    window.visualViewport?.addEventListener('scroll', handleViewportChange);
    const observer = new ResizeObserver(handleViewportChange);
    if (panelRef.current) observer.observe(panelRef.current);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
      window.visualViewport?.removeEventListener('resize', handleViewportChange);
      window.visualViewport?.removeEventListener('scroll', handleViewportChange);
      observer.disconnect();
    };
  }, [open, updatePopoverPosition]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const updateFromGradient = useCallback((clientX: number, clientY: number) => {
    const rect = gradientRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    commitColor([hsvRef.current[0], x * 100, (1 - y) * 100]);
  }, [commitColor]);

  const updateFromHue = useCallback((clientX: number) => {
    const rect = hueRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    commitColor([x * 360, hsvRef.current[1], hsvRef.current[2]]);
  }, [commitColor]);

  const releasePointer = (element: HTMLDivElement, pointerId: number) => {
    if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
  };

  const handleHexInput = (value: string) => {
    setHexInput(value);
    if (/^#[0-9a-fA-F]{6}$/.test(value)) {
      const nextHsv = hexToHsv(value, hsvRef.current[0]);
      hsvRef.current = nextHsv;
      setHsv(nextHsv);
      lastEmittedColorRef.current = value.toLowerCase();
      onChange(value);
    }
  };

  const gradientX = hsv[1] / 100;
  const gradientY = 1 - hsv[2] / 100;

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Pick ${label.toLowerCase()}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
        style={{
          position: 'relative',
          width: 44,
          height: 44,
          borderRadius: '50%',
          border: 'none',
          padding: 0,
          flexShrink: 0,
          cursor: 'pointer',
          background: `conic-gradient(
            hsl(0, 100%, 50%), hsl(30, 100%, 50%), hsl(60, 100%, 50%),
            hsl(90, 100%, 50%), hsl(120, 100%, 50%), hsl(150, 100%, 50%),
            hsl(180, 100%, 50%), hsl(210, 100%, 50%), hsl(240, 100%, 50%),
            hsl(270, 100%, 50%), hsl(300, 100%, 50%), hsl(330, 100%, 50%),
            hsl(360, 100%, 50%)
          )`,
          boxShadow: '0 0 0 2px var(--border), inset 0 0 12px rgba(0,0,0,0.35)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: color,
            border: '2px solid var(--bg-primary)',
            boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
          }}
        />
      </button>

      {mounted
        ? createPortal(
            <AnimatePresence>{open && <motion.div
              {...uiMotion.popover}
              ref={panelRef}
              role="dialog"
              aria-label={`${label} picker`}
              style={{
                position: 'fixed',
                top: popoverPosition.top,
                left: popoverPosition.left,
                zIndex: 1400,
                width: PANEL_WIDTH,
                maxWidth: Math.max(0, viewport.width - VIEWPORT_MARGIN * 2),
                maxHeight: Math.max(0, viewport.height - VIEWPORT_MARGIN * 2),
                overflowY: 'auto',
                overscrollBehavior: 'contain',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: 12,
                boxShadow: '0 14px 40px rgba(0,0,0,0.35)',
              }}
            >
              <div
                ref={gradientRef}
                onPointerDown={(event) => {
                  if (event.pointerType === 'mouse' && event.button !== 0) return;
                  event.preventDefault();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  updateFromGradient(event.clientX, event.clientY);
                }}
                onPointerMove={(event) => {
                  if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                  if (event.pointerType === 'mouse' && event.buttons === 0) { releasePointer(event.currentTarget, event.pointerId); return; }
                  updateFromGradient(event.clientX, event.clientY);
                }}
                onPointerUp={(event) => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) updateFromGradient(event.clientX, event.clientY);
                  releasePointer(event.currentTarget, event.pointerId);
                }}
                onPointerCancel={(event) => releasePointer(event.currentTarget, event.pointerId)}
                style={{
                  width: '100%',
                  height: 140,
                  borderRadius: 8,
                  cursor: 'crosshair',
                  position: 'relative',
                  touchAction: 'none',
                  background: `linear-gradient(to bottom, transparent, #000), linear-gradient(to right, #fff, hsl(${hsv[0]}, 100%, 50%))`,
                  marginBottom: 10,
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: `${gradientX * 100}%`,
                    top: `${gradientY * 100}%`,
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    border: '2.5px solid white',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
                    transform: 'translate(-50%, -50%)',
                    pointerEvents: 'none',
                    background: color,
                  }}
                />
              </div>

              <div
                ref={hueRef}
                onPointerDown={(event) => {
                  if (event.pointerType === 'mouse' && event.button !== 0) return;
                  event.preventDefault();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  updateFromHue(event.clientX);
                }}
                onPointerMove={(event) => {
                  if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                  if (event.pointerType === 'mouse' && event.buttons === 0) { releasePointer(event.currentTarget, event.pointerId); return; }
                  updateFromHue(event.clientX);
                }}
                onPointerUp={(event) => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) updateFromHue(event.clientX);
                  releasePointer(event.currentTarget, event.pointerId);
                }}
                onPointerCancel={(event) => releasePointer(event.currentTarget, event.pointerId)}
                style={{
                  width: '100%',
                  height: 14,
                  borderRadius: 7,
                  cursor: 'pointer',
                  position: 'relative',
                  touchAction: 'none',
                  background:
                    'linear-gradient(to right, hsl(0,100%,50%), hsl(60,100%,50%), hsl(120,100%,50%), hsl(180,100%,50%), hsl(240,100%,50%), hsl(300,100%,50%), hsl(360,100%,50%))',
                  marginBottom: 10,
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: `${(hsv[0] / 360) * 100}%`,
                    top: '50%',
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    border: '2.5px solid white',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
                    transform: 'translate(-50%, -50%)',
                    pointerEvents: 'none',
                    background: `hsl(${hsv[0]}, 100%, 50%)`,
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    background: color,
                    border: '1px solid var(--border)',
                    flexShrink: 0,
                  }}
                />
                <input
                  aria-label="Selected color hex code"
                  value={hexInput}
                  onChange={(event) => handleHexInput(event.target.value)}
                  placeholder="#5865F2"
                  maxLength={7}
                  spellCheck={false}
                  style={{ flex: 1, minWidth: 0, fontSize: 16, padding: '6px 8px', fontFamily: 'monospace' }}
                />
                <span aria-live="polite" className="visually-hidden">
                  Selected color {color}
                </span>
              </div>
            </motion.div>}</AnimatePresence>,
            document.body,
          )
        : null}
    </div>
  );
}
