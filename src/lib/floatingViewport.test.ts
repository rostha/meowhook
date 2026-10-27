import { describe, expect, it } from 'vitest';
import { clampFloatingPosition } from './floatingViewport';

describe('floating surfaces in the visible mobile viewport', () => {
  it('keeps the full surface above a keyboard after the browser pans the page', () => {
    const viewport = { left: 0, top: 180, width: 390, height: 300 };
    expect(clampFloatingPosition(8, 8, 374, 280, viewport)).toEqual({ x: 8, y: 188 });
    expect(clampFloatingPosition(8, 700, 374, 280, viewport)).toEqual({ x: 8, y: 192 });
  });
  it('respects horizontal panning and rotation', () => {
    expect(clampFloatingPosition(0, 500, 236, 242, { left: 100, top: 40, width: 360, height: 320 }, 12)).toEqual({ x: 112, y: 106 });
  });
  it('keeps the header reachable when content is larger than the viewport', () => {
    expect(clampFloatingPosition(900, 900, 440, 600, { left: 0, top: 200, width: 320, height: 240 })).toEqual({ x: 8, y: 208 });
  });
});
