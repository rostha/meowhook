export type FloatingViewport = { left: number; top: number; width: number; height: number };

/** Fixed surfaces must follow the visible area when mobile keyboards pan the page. */
export function floatingViewport(): FloatingViewport {
  if (typeof window === 'undefined') return { left: 0, top: 0, width: 1024, height: 800 };
  const viewport = window.visualViewport;
  return { left: viewport?.offsetLeft ?? 0, top: viewport?.offsetTop ?? 0, width: viewport?.width ?? window.innerWidth, height: viewport?.height ?? window.innerHeight };
}

export function clampFloatingPosition(x: number, y: number, width: number, height: number, viewport: FloatingViewport, margin = 8) {
  return {
    x: Math.max(viewport.left + margin, Math.min(x, viewport.left + viewport.width - width - margin)),
    y: Math.max(viewport.top + margin, Math.min(y, viewport.top + viewport.height - height - margin)),
  };
}
