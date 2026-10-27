export type HSV = [hue: number, saturation: number, value: number];

/** The picker square uses saturation from left to right and value from bottom to top. */
export function hexToHsv(hex: string, fallbackHue = 0): HSV {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = fallbackHue;
  if (delta > 0) {
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    else if (max === g) hue = 60 * ((b - r) / delta + 2);
    else hue = 60 * ((r - g) / delta + 4);
  }
  return [(hue + 360) % 360, max === 0 ? 0 : (delta / max) * 100, max * 100];
}

export function hsvToHex(hue: number, saturation: number, value: number): string {
  const h = ((hue % 360) + 360) % 360;
  const s = Math.max(0, Math.min(100, saturation)) / 100;
  const v = Math.max(0, Math.min(100, value)) / 100;
  const chroma = v * s;
  const secondary = chroma * (1 - Math.abs((h / 60) % 2 - 1));
  const match = v - chroma;
  const channels = h < 60 ? [chroma, secondary, 0]
    : h < 120 ? [secondary, chroma, 0]
    : h < 180 ? [0, chroma, secondary]
    : h < 240 ? [0, secondary, chroma]
    : h < 300 ? [secondary, 0, chroma]
    : [chroma, 0, secondary];
  return `#${channels.map(channel => Math.round((channel + match) * 255).toString(16).padStart(2, '0')).join('')}`;
}
