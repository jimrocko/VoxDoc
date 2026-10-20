import type { Frame } from '../../src/scan/analyze.ts';

/** Synthetisches Kamerabild: dunkler Tisch, helles Blatt mit Textzeilen. */
export function makeFrame(
  page: { left: number; top: number; right: number; bottom: number } | null,
  { background = 60, paper = 225, width = 96, height = 128, noise = 0 } = {},
): Frame {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inside =
        page && x >= page.left * width && x < page.right * width && y >= page.top * height && y < page.bottom * height;
      let value = inside ? paper : background;
      // Textzeilen auf dem Blatt
      if (inside && y % 6 === 0 && x > page.left * width + 4 && x < page.right * width - 4) {
        value = Math.round(paper * 0.2);
      }
      value += noise ? Math.round((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1) * noise : 0;
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}
