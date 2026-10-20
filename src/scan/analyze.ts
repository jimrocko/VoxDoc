/**
 * Einfache Bildanalyse für die Kameraführung. Sie arbeitet auf einem stark
 * verkleinerten Vorschaubild und erkennt ein helles Blatt auf dunklerem
 * Untergrund – keine echte Kantenerkennung, aber robust und schnell genug für
 * mehrere Bilder pro Sekunde auf dem iPhone.
 */
export interface Frame {
  width: number;
  height: number;
  /** RGBA wie in `ImageData.data`. */
  data: Uint8ClampedArray;
}

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Analysis {
  /** Mittlere Helligkeit 0–255. */
  brightness: number;
  /** Helligkeit der hellsten 5 % des Bildes – zeigt, ob überhaupt genug Licht da ist. */
  highlights: number;
  /** Mittlere Helligkeit des Blatts, wenn eins erkannt wurde, sonst 0. */
  paperBrightness: number;
  /** Erkanntes Blatt in relativen Koordinaten (0–1), sonst `null`. */
  document: Box | null;
  /** Anteil der Bildfläche, den das Blatt einnimmt. */
  coverage: number;
  /** Abweichung der Blattmitte von der Bildmitte, −0,5 bis 0,5. */
  offsetX: number;
  offsetY: number;
  /** Kanten, an denen das Blatt aus dem Bild ragt. */
  cutOff: { left: boolean; top: boolean; right: boolean; bottom: boolean };
  /** Graustufen-Miniatur zum Vergleich aufeinanderfolgender Bilder. */
  luma: Uint8Array;
}

/** Mindestabstand zwischen Blatt- und Untergrundhelligkeit. */
const MIN_CONTRAST = 40;
/** Eine Zeile/Spalte gehört zum Blatt, wenn sie mindestens so viele helle Pixel hat wie dieser Anteil der hellsten. */
const LINE_FILL = 0.5;
/** Mindestanzahl heller Pixel je Zeile/Spalte (gegen Rauschen). */
const MIN_LINE_PIXELS = 3;
const MIN_COVERAGE = 0.02;

export function toLuma(frame: Frame): Uint8Array {
  const luma = new Uint8Array(frame.width * frame.height);
  const { data } = frame;
  for (let i = 0, p = 0; p < luma.length; i += 4, p++) {
    luma[p] = (data[i]! * 77 + data[i + 1]! * 150 + data[i + 2]! * 29) >> 8;
  }
  return luma;
}

function histogramOf(luma: Uint8Array): number[] {
  const histogram = new Array<number>(256).fill(0);
  for (const value of luma) {
    histogram[value]!++;
  }
  return histogram;
}

function percentile(histogram: readonly number[], total: number, fraction: number): number {
  let seen = 0;
  for (let i = 0; i < 256; i++) {
    seen += histogram[i]!;
    if (seen >= total * fraction) {
      return i;
    }
  }
  return 255;
}

/** Schwellwert nach Otsu: trennt hell (Papier) und dunkel (Untergrund). */
export function otsuThreshold(luma: Uint8Array, histogram = histogramOf(luma)): number {
  const total = luma.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) {
    sum += i * histogram[i]!;
  }
  let sumBackground = 0;
  let weightBackground = 0;
  let best = 0;
  let threshold = 127;
  for (let i = 0; i < 256; i++) {
    weightBackground += histogram[i]!;
    if (weightBackground === 0) {
      continue;
    }
    const weightForeground = total - weightBackground;
    if (weightForeground === 0) {
      break;
    }
    sumBackground += i * histogram[i]!;
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const between = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;
    if (between > best) {
      best = between;
      threshold = i;
    }
  }
  return threshold;
}

function span(counts: Uint32Array): [number, number] | null {
  let max = 0;
  for (const count of counts) {
    max = Math.max(max, count);
  }
  const needed = Math.max(MIN_LINE_PIXELS, max * LINE_FILL);
  let first = -1;
  let last = -1;
  for (let i = 0; i < counts.length; i++) {
    if (counts[i]! >= needed) {
      if (first < 0) {
        first = i;
      }
      last = i;
    }
  }
  return first < 0 ? null : [first, last];
}

export function analyzeFrame(frame: Frame): Analysis {
  const { width, height } = frame;
  const luma = toLuma(frame);
  let total = 0;
  for (const value of luma) {
    total += value;
  }
  const brightness = total / luma.length;

  const histogram = histogramOf(luma);
  const highlights = percentile(histogram, luma.length, 0.95);
  const threshold = otsuThreshold(luma, histogram);
  const columns = new Uint32Array(width);
  const rows = new Uint32Array(height);
  let brightSum = 0;
  let brightCount = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = luma[y * width + x]!;
      if (value > threshold) {
        columns[x]!++;
        rows[y]!++;
        brightSum += value;
        brightCount++;
      }
    }
  }
  const darkCount = luma.length - brightCount;
  const contrast =
    brightCount > 0 && darkCount > 0 ? brightSum / brightCount - (total - brightSum) / darkCount : 0;

  const empty: Analysis = {
    brightness,
    highlights,
    paperBrightness: 0,
    document: null,
    coverage: 0,
    offsetX: 0,
    offsetY: 0,
    cutOff: { left: false, top: false, right: false, bottom: false },
    luma,
  };
  if (contrast < MIN_CONTRAST) {
    return empty;
  }

  const xs = span(columns);
  const ys = span(rows);
  if (!xs || !ys) {
    return empty;
  }
  const document: Box = {
    left: xs[0] / width,
    top: ys[0] / height,
    right: (xs[1] + 1) / width,
    bottom: (ys[1] + 1) / height,
  };
  const coverage = (document.right - document.left) * (document.bottom - document.top);
  if (coverage < MIN_COVERAGE) {
    return empty;
  }
  const edge = 0.02;
  return {
    brightness,
    highlights,
    paperBrightness: brightSum / brightCount,
    document,
    coverage,
    offsetX: (document.left + document.right) / 2 - 0.5,
    offsetY: (document.top + document.bottom) / 2 - 0.5,
    cutOff: {
      left: document.left <= edge,
      top: document.top <= edge,
      right: document.right >= 1 - edge,
      bottom: document.bottom >= 1 - edge,
    },
    luma,
  };
}

/** Mittlere absolute Differenz zweier gleich großer Graustufenbilder (0–255). */
export function frameDifference(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length || a.length === 0) {
    return 255;
  }
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += Math.abs(a[i]! - b[i]!);
  }
  return sum / a.length;
}
