'use client';
import { useUiMotion } from '@/lib/useUiMotion';
import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { IconCalendarNav, IconClock, IconX, IconChevronLeft, IconChevronRight } from '@/components/MeowIcons';

interface TimestampPickerProps {
  value: string; // ISO string 2024-01-01T12:00
  onChange: (val: string) => void;
}

export default function TimestampPicker({ value, onChange }: TimestampPickerProps) {
  const uiMotion = useUiMotion();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [origin, setOrigin] = useState<'right' | 'left'>('right');
  
  const initialDate = value ? new Date(value) : new Date();
  const validDate = isNaN(initialDate.getTime()) ? new Date() : initialDate;
  const [date, setDate] = useState(validDate);
  const [viewDate, setViewDate] = useState(validDate);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        popoverRef.current && !popoverRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Position recalculation - wrapped in useCallback for stable reference
  const updatePosition = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const popoverHeight = 360;
    const hasRoomBelow = (rect.bottom + popoverHeight + 12) < window.innerHeight;

    setOrigin('left');
    setCoords({
      top: hasRoomBelow ? rect.bottom + 8 : rect.top - popoverHeight - 8,
      left: rect.left,
    });
  }, []);

  // Stable handler references for event listeners
  const closeOnScroll = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (open) {
      updatePosition();
      // Close on scroll to prevent detached popover
      window.addEventListener('scroll', closeOnScroll, true);
      window.addEventListener('resize', updatePosition);
    }
    return () => {
      window.removeEventListener('scroll', closeOnScroll, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, closeOnScroll, updatePosition]);

  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
  const firstDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay();

  const handleDaySelect = (d: number) => {
    const newDate = new Date(date);
    newDate.setFullYear(viewDate.getFullYear());
    newDate.setMonth(viewDate.getMonth());
    newDate.setDate(d);
    setDate(newDate);
    
    const year = newDate.getFullYear();
    const month = String(newDate.getMonth() + 1).padStart(2, '0');
    const day = String(newDate.getDate()).padStart(2, '0');
    const hours = String(newDate.getHours()).padStart(2, '0');
    const minutes = String(newDate.getMinutes()).padStart(2, '0');
    onChange(`${year}-${month}-${day}T${hours}:${minutes}`);
  };

  const handleTimeChange = (type: 'h' | 'm', val: string) => {
    let num = parseInt(val, 10);
    if (isNaN(num)) num = 0;
    
    const newDate = new Date(date);
    if (type === 'h') newDate.setHours(Math.min(23, Math.max(0, num)));
    else newDate.setMinutes(Math.min(59, Math.max(0, num)));
    
    setDate(newDate);
    const year = newDate.getFullYear();
    const month = String(newDate.getMonth() + 1).padStart(2, '0');
    const day = String(newDate.getDate()).padStart(2, '0');
    const hours = String(newDate.getHours()).padStart(2, '0');
    const minutes = String(newDate.getMinutes()).padStart(2, '0');
    onChange(`${year}-${month}-${day}T${hours}:${minutes}`);
  };

  const setNow = () => {
    const newDate = new Date();
    setDate(newDate);
    setViewDate(newDate);
    const year = newDate.getFullYear();
    const month = String(newDate.getMonth() + 1).padStart(2, '0');
    const day = String(newDate.getDate()).padStart(2, '0');
    const hours = String(newDate.getHours()).padStart(2, '0');
    const minutes = String(newDate.getMinutes()).padStart(2, '0');
    onChange(`${year}-${month}-${day}T${hours}:${minutes}`);
  };

  const clear = () => {
    onChange('');
    setOpen(false);
  };

  const formattedDisplay = value 
    ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'Select timestamp...';

  // Popover content
  const popoverContent = (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={popoverRef}
          {...uiMotion.popover}
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
            width: 260,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 16,
            boxShadow: 'var(--shadow)',
            zIndex: 9999
          }}
        >
          {/* Header: Month/Year Nav */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <button 
              type="button" 
              aria-label="Previous month"
              onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4 }}
            >
              <IconChevronLeft size={18} />
            </button>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }} aria-live="polite">
              {viewDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
            </div>
            <button 
              type="button" 
              aria-label="Next month"
              onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4 }}
            >
              <IconChevronRight size={18} />
            </button>
          </div>

          {/* Calendar Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 16 }}>
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
              <div key={day} style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                {day}
              </div>
            ))}
            {Array.from({ length: firstDay }).map((_, i) => <div key={`empty-${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const d = i + 1;
              const isSelected = value && date.getDate() === d && date.getMonth() === viewDate.getMonth() && date.getFullYear() === viewDate.getFullYear();
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => handleDaySelect(d)}
                  style={{
                    aspectRatio: '1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    borderRadius: 6,
                    border: 'none',
                    background: isSelected ? 'var(--accent)' : 'transparent',
                    color: isSelected ? '#fff' : 'var(--text-primary)',
                    cursor: 'pointer',
                    fontWeight: isSelected ? 600 : 400
                  }}
                  className="timestamp-day"
                >
                  {d}
                </button>
              );
            })}
          </div>

          <div style={{ height: 1, background: 'var(--border)', margin: '0 -16px 12px -16px' }} />

          {/* Time Picker */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', fontSize: 13 }}>
              <IconClock size={15} /> Time
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input 
                type="number" 
                aria-label="Hour"
                min="0" max="23"
                value={String(date.getHours()).padStart(2, '0')}
                onChange={(e) => handleTimeChange('h', e.target.value)}
                style={{ width: 44, padding: '4px 6px', textAlign: 'center', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 13 }}
              />
              <span style={{ color: 'var(--text-muted)' }} aria-hidden>:</span>
              <input 
                type="number" 
                aria-label="Minute"
                min="0" max="59"
                value={String(date.getMinutes()).padStart(2, '0')}
                onChange={(e) => handleTimeChange('m', e.target.value)}
                style={{ width: 44, padding: '4px 6px', textAlign: 'center', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 13 }}
              />
            </div>
          </div>

          {/* Now Button */}
          <button
            type="button"
            onClick={setNow}
            style={{
              width: '100%',
              marginTop: 12,
              padding: '6px',
              background: 'rgba(var(--accent-rgb), 0.1)',
              color: 'var(--accent)',
              border: 'none',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer'
            }}
            className="timestamp-now-btn"
          >
            Set to Now
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <button 
        ref={containerRef}
        type="button" 
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={value ? `Timestamp: ${formattedDisplay}` : 'Select timestamp'}
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          background: 'var(--bg-modifier)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          color: value ? 'var(--text-primary)' : 'var(--text-muted)',
          fontSize: 14,
          cursor: 'pointer',
          textAlign: 'left'
        }}
        className="timestamp-btn"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <IconCalendarNav size={16} style={{ color: 'var(--text-secondary)' }} />
          <span>{formattedDisplay}</span>
        </div>
        {value && (
          <button 
             type="button"
             aria-label="Clear timestamp"
             onClick={(e) => { e.stopPropagation(); clear(); }}
             style={{ padding: 2, borderRadius: 4, display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer' }}
             className="timestamp-clear"
          >
            <IconX size={16} style={{ color: 'var(--text-muted)' }} />
          </button>
        )}
      </button>

      {/* Render portal if browser env */}
      {typeof window !== 'undefined' && createPortal(popoverContent, document.body)}
    </div>
  );
}
