/**
 * Echte Texterkennung mit Tesseract.js und den deutschen Sprachdaten (Node).
 * Prüft, dass Umlaute und ß korrekt erkannt werden und leere Seiten leer bleiben.
 */
import { createWorker, OEM } from 'tesseract.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { formatRecognizedText } from '../src/ocr/format.ts';

const fixture = (name: string) => new URL(`./fixtures/${name}`, import.meta.url).pathname;
let worker: Awaited<ReturnType<typeof createWorker>>;

beforeAll(async () => {
  worker = await createWorker('deu', OEM.LSTM_ONLY, {
    langPath: new URL('../node_modules/@tesseract.js-data/deu/4.0.0_best_int', import.meta.url).pathname,
    cacheMethod: 'none',
  });
}, 60_000);

afterAll(async () => {
  await worker?.terminate();
});

describe('Tesseract (Deutsch)', () => {
  it('erkennt einen deutschen Brief mit Umlauten und ß', async () => {
    const { data } = await worker.recognize(fixture('brief.jpg'), { rotateAuto: true });
    const text = formatRecognizedText(data.text);
    for (const word of ['Müllheim', 'Schäfer', 'für', 'überweisen', 'Größere', 'Änderungen', 'Übrigens', 'Straße', 'Grüßen', '84,20']) {
      expect(text).toContain(word);
    }
    expect(data.confidence).toBeGreaterThan(80);
    expect(text.split('\n')[0]).toBe('Stadtwerke Müllheim');
  }, 60_000);

  it('erkennt Ö am Wortanfang', async () => {
    const { data } = await worker.recognize(fixture('seite2.jpg'));
    expect(data.text).toContain('Öffnungszeiten');
  }, 60_000);

  it('liefert für eine leere Seite keinen Text', async () => {
    const { data } = await worker.recognize(fixture('leer.jpg'));
    expect(data.text.trim()).toBe('');
  }, 60_000);
});
