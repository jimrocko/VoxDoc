import { describe, expect, it } from 'vitest';
import { analyzeFrame } from '../src/scan/analyze.ts';
import { AUTO_CAPTURE_MS, COOLDOWN_MS, Guide, hintFor, hintMessages, MIN_GAP_MS, REPEAT_MS, SETTLE_MS } from '../src/scan/guidance.ts';
import { makeFrame } from './helpers/frames.ts';

const centered = analyzeFrame(makeFrame({ left: 0.15, top: 0.12, right: 0.85, bottom: 0.88 }));
const otherPage = analyzeFrame(makeFrame({ left: 0.18, top: 0.1, right: 0.82, bottom: 0.9 }, { paper: 245, background: 35 }));
const empty = analyzeFrame(makeFrame(null, { background: 70 }));

describe('hintFor', () => {
  const at = (page: Parameters<typeof makeFrame>[0], options = {}) => hintFor(analyzeFrame(makeFrame(page, options)), 0);

  it('gibt die passende Richtung und den Abstand an', () => {
    expect(at({ left: 0, top: 0.2, right: 0.5, bottom: 0.8 })).toBe('left');
    expect(at({ left: 0.5, top: 0.2, right: 1, bottom: 0.8 })).toBe('right');
    expect(at({ left: 0.2, top: 0, right: 0.8, bottom: 0.5 })).toBe('up');
    expect(at({ left: 0.2, top: 0.5, right: 0.8, bottom: 1 })).toBe('down');
    expect(at({ left: 0.05, top: 0.3, right: 0.55, bottom: 0.7 })).toBe('left');
    expect(at({ left: 0, top: 0, right: 1, bottom: 0.8 })).toBe('tooClose');
    expect(at({ left: 0.35, top: 0.35, right: 0.65, bottom: 0.65 })).toBe('tooFar');
    // A4 mit 65 % der Bildbreite: für die Texterkennung noch zu klein.
    expect(at({ left: 0.175, top: 0.24, right: 0.825, bottom: 0.76 })).toBe('tooFar');
    expect(at(null, { background: 128 })).toBe('noDocument');
    expect(at({ left: 0.15, top: 0.12, right: 0.85, bottom: 0.88 }, { background: 5, paper: 30 })).toBe('dark');
    expect(at({ left: 0.15, top: 0.12, right: 0.85, bottom: 0.88 }, { background: 10, paper: 80 })).toBe('dark');
    expect(at(null, { background: 15 })).toBe('dark');
    // Dunkler Tisch ohne Blatt ist nicht „zu dunkel“, sondern leer.
    expect(at(null, { background: 40 })).toBe('noDocument');
    expect(at({ left: 0.15, top: 0.12, right: 0.85, bottom: 0.88 })).toBe('ready');
  });

  it('erkennt Bewegung', () => {
    expect(hintFor(centered, 20)).toBe('moving');
  });
});

describe('Guide', () => {
  it('sagt Hinweise erst an, wenn sie stabil sind, und wiederholt sie selten', () => {
    const guide = new Guide(false);
    expect(guide.update(empty, 0).announce).toBeNull();
    expect(guide.update(empty, SETTLE_MS).announce).toBe(hintMessages.noDocument);
    expect(guide.update(empty, SETTLE_MS + 1000).announce).toBeNull();
    expect(guide.update(empty, SETTLE_MS + REPEAT_MS).announce).toBe(hintMessages.noDocument);
  });

  it('flackernde Hinweise werden nicht angesagt', () => {
    const guide = new Guide(false);
    const announced = [];
    for (let t = 0; t < 3000; t += 250) {
      const update = guide.update(t % 500 === 0 ? empty : centered, t);
      if (update.announce) announced.push(update.announce);
    }
    expect(announced).toEqual([]);
  });

  it('hält Mindestabstand zwischen Ansagen', () => {
    const guide = new Guide(false);
    guide.update(empty, 0);
    expect(guide.update(empty, SETTLE_MS).announce).not.toBeNull();
    guide.update(centered, SETTLE_MS + 10);
    expect(guide.update(centered, SETTLE_MS + 10 + SETTLE_MS).announce).toBeNull();
    expect(guide.update(centered, SETTLE_MS + MIN_GAP_MS).announce).toBe('Dokument erkannt. Jetzt aufnehmen.');
  });

  it('löst automatisch aus, wenn das Blatt ruhig liegt, mit Takt-Tönen', () => {
    const guide = new Guide(true);
    let ticks = 0;
    let capturedAt = -1;
    for (let t = 0; t <= AUTO_CAPTURE_MS + 250 && capturedAt < 0; t += 250) {
      const update = guide.update(centered, t);
      if (update.tick) ticks++;
      if (update.capture) capturedAt = t;
    }
    expect(capturedAt).toBe(AUTO_CAPTURE_MS);
    expect(ticks).toBeGreaterThanOrEqual(3);
  });

  it('nimmt dieselbe Seite nicht zweimal auf, aber die nächste', () => {
    const guide = new Guide(true);
    let t = 0;
    const run = (analysis: typeof centered, ms: number): number => {
      let captures = 0;
      for (const end = t + ms; t < end; t += 250) {
        const update = guide.update(analysis, t);
        if (update.capture) {
          captures++;
          guide.markCaptured(analysis.luma, t);
        }
      }
      return captures;
    };
    expect(run(centered, 2000)).toBe(1);
    expect(run(centered, 10_000)).toBe(0);
    expect(guide.update(centered, t).hint).toBe('next');
    // „Nächste Seite“ wird nur einmal angesagt.
    const repeats = [];
    for (let end = t + 20_000; t < end; t += 250) {
      const update = guide.update(centered, t);
      if (update.announce) repeats.push(update.announce);
    }
    expect(repeats.length).toBeLessThanOrEqual(1);
    // Neue Seite liegt da: nach der Pause wieder automatisch.
    expect(run(otherPage, COOLDOWN_MS + 3000)).toBe(1);
    // Blatt entfernt und dasselbe wieder hingelegt: ebenfalls neu.
    run(empty, 1000);
    expect(run(otherPage, 3000)).toBe(1);
  });

  it('ohne automatische Auslösung kein Auslösen', () => {
    const guide = new Guide(false);
    for (let t = 0; t < 5000; t += 250) {
      expect(guide.update(centered, t).capture).toBe(false);
    }
  });
});
