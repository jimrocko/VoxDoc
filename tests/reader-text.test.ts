import { describe, expect, it } from 'vitest';
import { splitChunks, splitParagraphs } from '../src/reader/text.ts';

describe('splitParagraphs', () => {
  it('trennt an Zeilenumbrüchen und entfernt Leerzeilen', () => {
    expect(splitParagraphs('Erste Zeile.\n\n  Zweite   Zeile. \nDritte')).toEqual([
      'Erste Zeile.',
      'Zweite Zeile.',
      'Dritte',
    ]);
    expect(splitParagraphs(' \n ')).toEqual([]);
  });
});

describe('splitChunks', () => {
  const sentence = 'Dies ist ein ziemlich langer Satz, der viele Wörter enthält und nicht enden will';

  it('fasst kurze Sätze zusammen', () => {
    expect(splitChunks('Hallo. Wie geht es? Gut!')).toEqual([{ text: 'Hallo. Wie geht es? Gut!', start: 0 }]);
  });

  it('hält die Höchstlänge ein und bewahrt die Positionen', () => {
    const paragraph = `${sentence}. ${sentence}, ${sentence}; ${sentence} ${sentence}.`;
    const chunks = splitChunks(paragraph, 100);
    expect(chunks.length).toBeGreaterThan(3);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(100);
      expect(paragraph.startsWith(chunk.text, chunk.start)).toBe(true);
    }
    expect(chunks.map((chunk) => chunk.text).join(' ').replace(/\s+/g, ' ')).toBe(paragraph);
  });

  it('teilt auch Text ohne Leerzeichen', () => {
    const chunks = splitChunks('x'.repeat(500), 200);
    expect(chunks.map((chunk) => chunk.text.length)).toEqual([200, 200, 100]);
  });
});
