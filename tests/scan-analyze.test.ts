import { describe, expect, it } from 'vitest';
import { analyzeFrame, frameDifference, otsuThreshold } from '../src/scan/analyze.ts';
import { hintFor } from '../src/scan/guidance.ts';
import { makeFrame } from './helpers/frames.ts';

const centered = { left: 0.15, top: 0.12, right: 0.85, bottom: 0.88 };

describe('analyzeFrame', () => {
  it('erkennt ein zentriertes Blatt', () => {
    const analysis = analyzeFrame(makeFrame(centered));
    expect(analysis.document).not.toBeNull();
    expect(analysis.document!.left).toBeCloseTo(0.15, 1);
    expect(analysis.document!.bottom).toBeCloseTo(0.88, 1);
    expect(analysis.coverage).toBeGreaterThan(0.45);
    expect(Math.abs(analysis.offsetX)).toBeLessThan(0.05);
    expect(Object.values(analysis.cutOff).some(Boolean)).toBe(false);
  });

  it('findet kein Blatt in einem gleichmäßigen Bild', () => {
    expect(analyzeFrame(makeFrame(null, { background: 128 })).document).toBeNull();
  });

  it('meldet bei hellem Blatt auf hellem Untergrund nie „bereit“', () => {
    // Grenze des Verfahrens: Das Blatt ist nicht vom Untergrund zu trennen.
    expect(hintFor(analyzeFrame(makeFrame(centered, { background: 215, paper: 225 })), 0)).not.toBe('ready');
  });

  it('erkennt auch kleine Blätter', () => {
    const analysis = analyzeFrame(makeFrame({ left: 0.4, top: 0.4, right: 0.6, bottom: 0.6 }));
    expect(analysis.document).not.toBeNull();
    expect(analysis.coverage).toBeCloseTo(0.04, 1);
  });

  it('ist robust gegen Bildrauschen', () => {
    const analysis = analyzeFrame(makeFrame(centered, { noise: 25 }));
    expect(analysis.document!.left).toBeCloseTo(0.15, 1);
    expect(analysis.document!.right).toBeCloseTo(0.85, 1);
  });

  it('meldet abgeschnittene Kanten und Lage', () => {
    const analysis = analyzeFrame(makeFrame({ left: 0, top: 0.2, right: 0.5, bottom: 0.8 }));
    expect(analysis.cutOff).toEqual({ left: true, top: false, right: false, bottom: false });
    expect(analysis.offsetX).toBeLessThan(-0.2);
  });

  it('misst die Helligkeit', () => {
    const analysis = analyzeFrame(makeFrame(centered));
    expect(analysis.paperBrightness).toBeGreaterThan(200);
    expect(analysis.highlights).toBe(225);
    expect(analyzeFrame(makeFrame(null, { background: 20 })).highlights).toBe(20);
  });
});

describe('Hilfsfunktionen', () => {
  it('Otsu trennt zwei Helligkeiten', () => {
    const luma = new Uint8Array([...new Array(50).fill(50), ...new Array(50).fill(200)]);
    const threshold = otsuThreshold(luma);
    expect(threshold).toBeGreaterThanOrEqual(50);
    expect(threshold).toBeLessThan(200);
  });

  it('frameDifference', () => {
    expect(frameDifference(new Uint8Array([10, 20]), new Uint8Array([10, 20]))).toBe(0);
    expect(frameDifference(new Uint8Array([0, 0]), new Uint8Array([10, 30]))).toBe(20);
    expect(frameDifference(new Uint8Array([1]), new Uint8Array([1, 2]))).toBe(255);
  });
});
