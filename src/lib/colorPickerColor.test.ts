import { describe, expect, it } from 'vitest';
import { hexToHsv, hsvToHex } from './colorPickerColor';

describe('color picker coordinates', () => {
  it('maps the square corners to white, hue, and black', () => {
    expect(hsvToHex(240, 0, 100)).toBe('#ffffff');
    expect(hsvToHex(240, 100, 100)).toBe('#0000ff');
    expect(hsvToHex(240, 100, 0)).toBe('#000000');
  });

  it('keeps the selector at the color represented by its hex value', () => {
    for (const hex of ['#676785', '#8996a8', '#5865f2', '#ffffff', '#000000', '#ff0000']) {
      expect(hsvToHex(...hexToHsv(hex))).toBe(hex);
    }
  });

  it('retains the chosen hue when saturation reaches zero', () => {
    expect(hexToHsv('#ffffff', 240)).toEqual([240, 0, 100]);
  });
});
