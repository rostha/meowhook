'use client';

import type { SVGProps } from 'react';

export type MeowIconProps = {
  size?: number;
  className?: string;
  strokeWidth?: number;
  'aria-hidden'?: boolean;
  style?: SVGProps<SVGSVGElement>['style'];
};

const DEFAULT_STROKE = 2;

function Base({
  children,
  size = 24,
  strokeWidth = DEFAULT_STROKE,
  className,
  style,
  'aria-hidden': ariaHidden = true,
}: MeowIconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      style={style}
      aria-hidden={ariaHidden}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/** Mobile menu - 3 horizontal lines with varied width like a menu */
export function IconMenu(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M3 6h18M3 12h14M3 18h10" />
    </Base>
  );
}

/** Horizontal “more” (⋯) — clear at small sizes; optically balanced for square buttons */
export function IconNavHamburger(p: MeowIconProps) {
  const { size = 24, className, style, 'aria-hidden': ariaHidden = true } = p;
  const r = 2.5;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden={ariaHidden}
    >
      <circle cx="6.5" cy="12" r={r} />
      <circle cx="12" cy="12" r={r} />
      <circle cx="17.5" cy="12" r={r} />
    </svg>
  );
}

/** JSON - Curly braces with a dot in middle representing data */
export function IconJson(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M8 5H6a3 3 0 0 0-3 3v2.5a2.5 2.5 0 0 1-1.5 2.5 2.5 2.5 0 0 1 1.5 2.5V18a3 3 0 0 0 3 3h2" />
      <path d="M16 5h2a3 3 0 0 1 3 3v2.5a2.5 2.5 0 0 0 1.5 2.5 2.5 2.5 0 0 0-1.5 2.5V18a3 3 0 0 1-3 3h-2" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </Base>
  );
}

/** Embeds/Layers - Stacked planes for embed sections */
export function IconLayers(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M12 2L2 7l10 5 10-5-10-5Z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </Base>
  );
}

/** Templates - Grid of cards with a sparkle accent, distinct "pick a template" feel */
export function IconTemplates(p: MeowIconProps) {
  return (
    <Base {...p}>
      <rect x="3" y="3" width="8" height="10" rx="2" />
      <rect x="13" y="3" width="8" height="6" rx="2" />
      <rect x="13" y="11" width="8" height="10" rx="2" />
      <rect x="3" y="15" width="8" height="6" rx="2" />
      <circle cx="19" cy="5" r="1.5" fill="currentColor" stroke="none" />
    </Base>
  );
}

/** Guide/Book - Open book with visible pages */
export function IconBookOpen(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M2 5.5a2.5 2.5 0 0 1 2.5-2.5h4a2.5 2.5 0 0 1 2.5 2.5v13a2.5 2.5 0 0 0-2.5-2.5h-4A2.5 2.5 0 0 0 2 18.5v-13Z" />
      <path d="M22 5.5a2.5 2.5 0 0 0-2.5-2.5h-4a2.5 2.5 0 0 0-2.5 2.5v13a2.5 2.5 0 0 1 2.5-2.5h4A2.5 2.5 0 0 1 22 18.5v-13Z" />
      <path d="M13 18.5V5.5" />
    </Base>
  );
}

/** Help - Question mark in circle, clear and recognizable */
export function IconHelpBubble(p: MeowIconProps) {
  return (
    <Base {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9a3 3 0 1 1 4.2 4.2c-.5.4-.7.9-.7 1.3V15" />
      <circle cx="12" cy="18" r="0.8" fill="currentColor" stroke="none" />
    </Base>
  );
}

/** Theme/Appearance - Paintbrush with sparkle, represents styling */
export function IconThemeOrbit(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M8 16l2-2 6-6a2 2 0 0 0-3-3l-6 6-2 2v3h3Z" />
      <path d="M14 4l4 4" />
      <path d="M19 3l1 1-2 2-1-1a1.4 1.4 0 0 1 2-2Z" fill="currentColor" stroke="none" />
    </Base>
  );
}

/** Close X - Clean diagonal lines */
export function IconX(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Base>
  );
}

/** Checkmark - Clear tick */
export function IconCheck(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M5 12l4 4 9-9" />
    </Base>
  );
}

/** Moon - Crescent moon for dark theme */
export function IconMoon(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />
    </Base>
  );
}

/** Sun - Sun with rays for light theme */
export function IconSun(p: MeowIconProps) {
  return (
    <Base {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </Base>
  );
}

/** Monitor - Display screen for OLED theme */
export function IconMonitor(p: MeowIconProps) {
  return (
    <Base {...p}>
      <rect x="2" y="4" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 18v3" />
    </Base>
  );
}

/** Coffee/Mug - For Catppuccin theme */
export function IconMug(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M5 6h10a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3H5V6Z" />
      <path d="M18 9h1.5a2 2 0 0 1 0 4H18" />
      <path d="M7 21h8" />
    </Base>
  );
}

/** Droplet - For Dracula theme (blood drop) */
export function IconDroplet(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M12 2.5c-2 3-5 6-5 9.5a5 5 0 1 0 10 0c0-3.5-3-6.5-5-9.5Z" />
    </Base>
  );
}

/** Snowflake - For Nord theme (icy) */
export function IconSnowCrystal(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M12 2v20M4 8l16 8M4 16l16-8" />
      <path d="M7 4l2 2M15 4l-2 2M7 20l2-2M15 20l-2-2" />
    </Base>
  );
}

/** Copy - Two overlapping pages */
export function IconCopy(p: MeowIconProps) {
  return (
    <Base {...p}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </Base>
  );
}

/** Paste - Clipboard with page */
export function IconPaste(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M9 2h6l1 3h3v15a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5h3l1-3Z" />
      <path d="M9 2v3h6V2" />
    </Base>
  );
}

/** Send - Paper airplane pointing up-right, clear "send" metaphor */
export function IconSendHook(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-3-9-9-3 19-8z" />
    </Base>
  );
}

/** Loading spinner - Arc with gap */
export function IconLoader(p: MeowIconProps) {
  return (
    <Base {...p} className={`${p.className || ''} meow-icon-spin`.trim()}>
      <path d="M12 2a10 10 0 1 1-6.8 2.8" />
    </Base>
  );
}

/** Plus - Clean plus sign */
export function IconPlus(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M12 5v14M5 12h14" />
    </Base>
  );
}

/** Minus - Horizontal bar (pairs with IconPlus for steppers) */
export function IconMinus(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M5 12h14" />
    </Base>
  );
}

/** Trash - Bin with lid and lines */
export function IconTrash(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M10 11v6M14 11v6M5 6l1 14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-14" />
    </Base>
  );
}

/** Message bubble - Speech bubble for content */
export function IconMessage(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M4 4h16v12H8l-4 4V4Z" />
      <path d="M8 10h8M8 14h5" />
    </Base>
  );
}

/** Save disk - Floppy disk shape */
export function IconSaveDisk(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M5 3h12l4 4v14H5V3Z" />
      <path d="M9 3v5h6V3" />
      <path d="M7 21v-6h10v6" />
    </Base>
  );
}

/** Folder - Open folder for drafts */
export function IconFolder(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-6l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" />
    </Base>
  );
}

/** Share - Connected nodes representing sharing */
export function IconShareNodes(p: MeowIconProps) {
  return (
    <Base {...p}>
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M8.5 10.5 15.5 7M8.5 13.5 15.5 17" />
    </Base>
  );
}

/** Download - Arrow pointing down to line */
export function IconDownload(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M12 3v11" />
      <path d="M8 12l4 4 4-4" />
      <path d="M4 21h16" />
    </Base>
  );
}

/** Upload - Arrow pointing up from line */
export function IconUpload(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M12 21V10" />
      <path d="M8 11l4-4 4 4" />
      <path d="M4 21h16" />
    </Base>
  );
}

/** Rotate/Reset - Circular arrow CCW */
export function IconRotateCCW(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M3 12a9 9 0 1 1 3 6.7" />
      <path d="M3 4v8h8" />
    </Base>
  );
}

/** Link/Chain - Two chain links for URL */
export function IconLink(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M10 13a4 4 0 0 1 0-5.7l1-1a4 4 0 0 1 5.7 0l.3.3a4 4 0 0 1 0 5.7" />
      <path d="M14 11a4 4 0 0 1 0 5.7l-1 1a4 4 0 0 1-5.7 0l-.3-.3a4 4 0 0 1 0-5.7" />
    </Base>
  );
}

/** Pencil - Edit icon */
export function IconPencil(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M4 20h4l10-10a2 2 0 0 0-3-3L5 17l-1 3Z" />
      <path d="M13 6l5 5" />
    </Base>
  );
}

/** Lightbulb - Tips/ideas */
export function IconLightbulb(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a5 5 0 0 0-2 9.5V15h4v-2.5A5 5 0 0 0 12 3Z" />
    </Base>
  );
}

/** Clock - Time/circular clock face */
export function IconClock(p: MeowIconProps) {
  return (
    <Base {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </Base>
  );
}

/** Calendar - Simple calendar with header */
export function IconCalendar(p: MeowIconProps) {
  return (
    <Base {...p}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4" />
      <path d="M4 10h16" />
    </Base>
  );
}

/** CalendarWeek - Calendar with dots representing days */
export function IconCalendarWeek(p: MeowIconProps) {
  return (
    <Base {...p}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4" />
      <path d="M4 10h16" />
      <path d="M7 14h2M11 14h2M15 14h2" />
    </Base>
  );
}

/** CalendarRange - Calendar with lines indicating range */
export function IconCalendarRange(p: MeowIconProps) {
  return (
    <Base {...p}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4" />
      <path d="M4 10h16" />
      <path d="M7 14h4M13 14h4" />
    </Base>
  );
}

/** CalendarClock - Calendar with small clock */
export function IconCalendarClock(p: MeowIconProps) {
  return (
    <Base {...p}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4" />
      <path d="M4 10h16" />
      <circle cx="12" cy="15" r="2" />
      <path d="M12 15v-1l1-1" />
    </Base>
  );
}

/** Infinity - Lemniscate for "never expires" */
export function IconInfinity(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M8 12c0-2.2 1.8-4 4-4s4 1.8 4 4-1.8 4-4 4" />
      <path d="M16 12c0 2.2-1.8 4-4 4s-4-1.8-4-4 1.8-4 4-4" />
    </Base>
  );
}

/** Toast OK - Circle with check */
export function IconToastOk(p: MeowIconProps) {
  return (
    <Base {...p} strokeWidth={2}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12l3 3 5-5" />
    </Base>
  );
}

/** Toast Error - Circle with X */
export function IconToastErr(p: MeowIconProps) {
  return (
    <Base {...p} strokeWidth={2}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </Base>
  );
}

/** Toast Info - Circle with i */
export function IconToastInfo(p: MeowIconProps) {
  return (
    <Base {...p} strokeWidth={2}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v.01" strokeWidth={2.5} />
      <path d="M12 11v5" />
    </Base>
  );
}

/** ChevronDown - Down arrow */
export function IconChevronDown(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M6 9l6 6 6-6" />
    </Base>
  );
}

/** ChevronUp - Up arrow (pair with ChevronDown for expand/collapse) */
export function IconChevronUp(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M18 15l-6-6-6 6" />
    </Base>
  );
}

/** ChevronRight - Right arrow */
export function IconChevronRight(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M9 6l6 6-6 6" />
    </Base>
  );
}

/** ChevronLeft - Left arrow */
export function IconChevronLeft(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M15 6l-6 6 6 6" />
    </Base>
  );
}

/** Alert - Triangle with exclamation */
export function IconAlert(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M12 3L2 20h20L12 3Z" />
      <path d="M12 9v5M12 17h.01" />
    </Base>
  );
}

/** Info - Circle with i */
export function IconInfo(p: MeowIconProps) {
  return (
    <Base {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v.01" strokeWidth={2.5} />
      <path d="M12 11v5" />
    </Base>
  );
}

/** Eye - Visible/open eye */
export function IconEye(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </Base>
  );
}

/** EyeOff - Crossed out eye for hidden */
export function IconEyeOff(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M2 2l20 20" />
      <path d="M10 10a3 3 0 0 0 3 3" />
      <path d="M9.5 5.5A9.3 9.3 0 0 1 12 5c6 0 10 7 10 7a16 8 0 0 1-2 2.5M6.5 6.5A16 8 0 0 0 2 12s4 7 10 7a9 9 0 0 0 3-.5" />
    </Base>
  );
}

/** Image - Picture frame with mountain */
export function IconImage(p: MeowIconProps) {
  return (
    <Base {...p}>
      <rect x="3" y="4" width="18" height="15" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" fill="currentColor" stroke="none" />
      <path d="m21 14-4-4-5 5-3-3-4 4" />
    </Base>
  );
}

/** User - Person silhouette */
export function IconUser(p: MeowIconProps) {
  return (
    <Base {...p}>
      <circle cx="12" cy="8" r="4" />
      <path d="M5 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2" />
    </Base>
  );
}

/** Sliders - 3 horizontal sliders with knobs */
export function IconSliders(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M4 6h3M10 6h10" />
      <path d="M4 12h10M18 12h2" />
      <path d="M4 18h7M15 18h5" />
      <circle cx="8" cy="6" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="14" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="11" cy="18" r="1.5" fill="currentColor" stroke="none" />
    </Base>
  );
}

/** Stack - Simplified layers for embeds */
export function IconStack(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M12 2 4 7l8 5 8-5-8-5Z" />
      <path d="m4 13 8 5 8-5" />
    </Base>
  );
}

/** Bookmark - Flag bookmark */
export function IconBookmark(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M6 3h12v18l-6-4-6 4V3Z" />
    </Base>
  );
}

/** ArrowUp - Up arrow */
export function IconArrowUp(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </Base>
  );
}

/** ArrowDown - Down arrow */
export function IconArrowDown(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M12 5v14M19 12l-7 7-7-7" />
    </Base>
  );
}

/** Grip - 6 dots for drag handle */
export function IconGrip(p: MeowIconProps) {
  return (
    <Base {...p}>
      <circle cx="9" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="18" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="18" r="1" fill="currentColor" stroke="none" />
    </Base>
  );
}

/** Palette - Paint palette with dots */
export function IconPalette(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M12 3a9 9 0 0 0-9 9 5 5 0 0 0 5 5h5a3 3 0 0 0 3-3V9a4.5 4.5 0 0 0-4-6Z" />
      <circle cx="8.5" cy="10" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="7" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="10" r="1" fill="currentColor" stroke="none" />
    </Base>
  );
}

/** UserCircle - User in circle */
export function IconUserCircle(p: MeowIconProps) {
  return (
    <Base {...p}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6 19a5 5 0 0 1 12 0" />
    </Base>
  );
}

/** AlignLeft - Left aligned lines */
export function IconAlignLeft(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M4 6h16M4 12h12M4 18h16" />
    </Base>
  );
}

/** Grid - 2x2 grid squares */
export function IconGrid(p: MeowIconProps) {
  return (
    <Base {...p}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </Base>
  );
}

/** PanelBottom - Window with bottom panel */
export function IconPanelBottom(p: MeowIconProps) {
  return (
    <Base {...p}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 15h18" />
    </Base>
  );
}

export function IconSidebar(p: MeowIconProps) {
  return <Base {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18" /></Base>;
}

/** Search - Magnifying glass */
export function IconSearch(p: MeowIconProps) {
  return (
    <Base {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="M16 16l4 4" />
    </Base>
  );
}

/** Shield - Shield with checkmark */
export function IconShield(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="M9 12l2 2 4-4" />
    </Base>
  );
}

/** Database - Cylindrical database stack */
export function IconDatabase(p: MeowIconProps) {
  return (
    <Base {...p}>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v14" />
      <path d="M20 5v14" />
      <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </Base>
  );
}

/** Lock - Closed padlock */
export function IconLock(p: MeowIconProps) {
  return (
    <Base {...p}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </Base>
  );
}

/** FileText - Document with lines */
export function IconFileText(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h8M8 9h3" />
    </Base>
  );
}

/** Minimize - Compress arrows inward */
export function IconMinimize(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M4 14h6v6M14 4h6v6" />
      <path d="M20 14l-6-6M10 10l-6 6" />
    </Base>
  );
}

/** Maximize - Expand arrows outward */
export function IconMaximize(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M4 8V4h4M16 4h4v4M4 16v4h4M20 16v4h-4" />
    </Base>
  );
}

/** BellOff - Muted bell with slash */
export function IconBellOff(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M6 5a5 5 0 0 1 12 0v2.5a3 3 0 0 0 1.5 2.5v1.5H4V10a3 3 0 0 0 1.5-2.5V5Z" />
      <path d="M9 20h6" />
      <path d="M2 2l20 20" />
    </Base>
  );
}

/** Hash - # symbol */
export function IconHash(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M10 3L7 21M17 3l-3 18" />
      <path d="M4 9h16M4 15h16" />
    </Base>
  );
}

/** Messages - Two overlapping speech bubbles */
export function IconMessages(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M8 4h11v9h-6l-3 2v-2H8V4Z" />
      <path d="M5 9h6v6l2-1v1H5V9Z" />
    </Base>
  );
}

/** CalendarNav - Simple calendar */
export function IconCalendarNav(p: MeowIconProps) {
  return (
    <Base {...p}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4" />
      <path d="M4 10h16" />
    </Base>
  );
}

/** Duplicate - Two overlapping rectangles */
export function IconDuplicate(p: MeowIconProps) {
  return (
    <Base {...p}>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M4 16V6a2 2 0 0 1 2-2h10" />
    </Base>
  );
}

/** Rocket - Rocket ship for tutorial */
export function IconRocket(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M4.5 16.5c-2-4-1-9 1-12l3-2 3 8-4 4-3 2Z" />
      <path d="M19.5 2.5c2 4 1 9-1 12l-3 2-3-8 4-4 3-2Z" />
      <circle cx="12" cy="11" r="2" />
      <path d="M12 15v4" />
    </Base>
  );
}

/** Braces - { } for code */
export function IconBraces(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M8 5H6a3 3 0 0 0-3 3v2.5a2.5 2.5 0 0 1-1.5 2.5 2.5 2.5 0 0 1 1.5 2.5V18a3 3 0 0 0 3 3h2" />
      <path d="M16 5h2a3 3 0 0 1 3 3v2.5a2.5 2.5 0 0 0 1.5 2.5 2.5 2.5 0 0 0-1.5 2.5V18a3 3 0 0 1-3 3h-2" />
    </Base>
  );
}

/** FileJson - Document with { } */
export function IconFileJson(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" />
      <path d="M14 2v6h6" />
      <path d="M8 12h.01M8 16h.01" strokeWidth={2.5} />
    </Base>
  );
}

/** UploadImage - Image with upload arrow */
export function IconUploadImage(p: MeowIconProps) {
  return (
    <Base {...p}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8" cy="9" r="1.5" fill="currentColor" stroke="none" />
      <path d="m3 14 5-5 4 4 3-3 4 4" />
      <path d="M16 4v4M16 6h4" />
    </Base>
  );
}

/** Eraser - Eraser tool for clearing content */
export function IconEraser(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M7 21h10" />
      <path d="m17 4-8 8-4 4a2 2 0 0 0 0 3h4l8-8a2.83 2.83 0 0 0 0-4l-3-3a2 2 0 0 0-3 0Z" />
      <path d="m9 12 4 4" />
    </Base>
  );
}

/** Broom - Sweep/clean for clearing all drafts */
export function IconBroom(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M12 3v10" />
      <path d="M5 13c0 5 3 8 7 8s7-3 7-8H5Z" />
      <path d="M9 13v4M15 13v4M12 13v5" />
    </Base>
  );
}

/** Timer - Short duration (1 day) */
export function IconTimer(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M10 2h4" />
      <path d="M12 14l2-2" />
      <circle cx="12" cy="14" r="8" />
    </Base>
  );
}

/** Hourglass - Medium duration (3 days) */
export function IconHourglass(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M5 22h14" />
      <path d="M5 2h14" />
      <path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22" />
      <path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" />
    </Base>
  );
}

/** CalendarStar - 7 day duration */
export function IconCalendarStar(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M21 13V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6" />
      <path d="M16 2v4M8 2v4M3 10h18" />
      <path d="m17.8 13.8-.9 1.7-2 .3 1.5 1.4-.4 2 1.8-.9 1.8.9-.4-2 1.5-1.4-2-.3Z" />
    </Base>
  );
}

/** ShieldClock - 14 day duration (protection + time) */
export function IconShieldClock(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <circle cx="12" cy="13" r="3" />
      <path d="M12 11v2l1 1" />
    </Base>
  );
}

/** Film - Video files */
export function IconFilm(p: MeowIconProps) {
  return (
    <Base {...p}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M7 3v18M17 3v18M3 7h4M3 12h18M3 17h4M17 7h4M17 17h4" />
    </Base>
  );
}

/** Music - Audio files */
export function IconMusic(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </Base>
  );
}

/** FileArchive - Zip/compressed files */
export function IconFileArchive(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M16 22h2a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v18" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <circle cx="10" cy="20" r="2" />
      <path d="M10 7V6M10 12v-1M10 18v-2" />
    </Base>
  );
}

/** FileCode - Source/code files */
export function IconFileCode(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="m10 13-2 2 2 2M14 17l2-2-2-2" />
    </Base>
  );
}

/** Paperclip - Generic attachment */
export function IconPaperclip(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </Base>
  );
}

/** Zoom In */
export function IconZoomIn(p: MeowIconProps) {
  return (
    <Base {...p}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="11" y1="8" x2="11" y2="14" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </Base>
  );
}

/** Zoom Out */
export function IconZoomOut(p: MeowIconProps) {
  return (
    <Base {...p}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </Base>
  );
}

/** Undo */
export function IconUndo(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
    </Base>
  );
}

/** Redo */
export function IconRedo(p: MeowIconProps) {
  return (
    <Base {...p}>
      <path d="M21 7v6h-6" />
      <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
    </Base>
  );
}

export type MeowIcon = typeof IconMenu;
