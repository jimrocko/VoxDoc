import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OcrEngine, RecognizedPage } from '../src/ocr/engine.ts';
import { OcrError } from '../src/ocr/errors.ts';
import { OcrService, PROGRESS_ANNOUNCE_MS, resultMessage, type OcrDeps, type OcrEvent } from '../src/ocr/service.ts';
import type { VoxDocument } from '../src/storage/documents.ts';

const page = (text: string, confidence = 92): RecognizedPage => ({ text, confidence, words: text.split(/\s+/).filter(Boolean).length });

class FakeEngine implements OcrEngine {
  name = 'Fake';
  calls: Blob[] = [];
  terminated = false;
  /** Pro Aufruf: Ergebnis oder Fehler; `hang` = antwortet nie. */
  constructor(private readonly results: (RecognizedPage | Error | 'hang')[]) {}
  async recognize(image: Blob, onProgress: (p: number) => void): Promise<RecognizedPage> {
    this.calls.push(image);
    const result = this.results[this.calls.length - 1] ?? page('');
    onProgress(0.5);
    if (result === 'hang') return new Promise(() => {});
    if (result instanceof Error) throw result;
    onProgress(1);
    return result;
  }
  async terminate(): Promise<void> {
    this.terminated = true;
  }
}

let docs: Map<string, VoxDocument>;
let announced: [string, string | undefined][];
let events: OcrEvent[];
let now: number;

function makeDoc(id: string, pages: number, text = ''): VoxDocument {
  const doc: VoxDocument = { id, title: `Dok ${id}`, text, pages: Array.from({ length: pages }, (_, i) => new Blob([`${id}-${i}`])), ocr: null, createdAt: 0, updatedAt: 0 };
  docs.set(id, doc);
  return doc;
}

function service(engine: OcrEngine | (() => Promise<OcrEngine>), deps: Partial<OcrDeps> = {}): OcrService {
  const s = new OcrService({
    createEngine: typeof engine === 'function' ? engine : async (onProgress) => (onProgress(1), engine),
    needsDownload: async () => false,
    getDocument: async (id) => docs.get(id),
    updateDocument: async (id, changes) => {
      const updated = { ...docs.get(id)!, ...changes };
      docs.set(id, updated);
      return updated;
    },
    announce: (message, kind) => announced.push([message, kind]),
    isShowing: () => true,
    now: () => now,
    ...deps,
  });
  s.subscribe((event) => events.push(event));
  return s;
}

const settle = () => vi.advanceTimersByTimeAsync(0);
const done = (id: string) => events.find((e) => e.type === 'done' && e.docId === id);

beforeEach(() => {
  vi.useFakeTimers();
  docs = new Map();
  announced = [];
  events = [];
  now = 1000;
});
afterEach(() => vi.useRealTimers());

describe('OcrService', () => {
  it('erkennt alle Seiten, speichert Rohergebnis und Lesetext getrennt', async () => {
    const original = makeDoc('a', 2);
    const engine = new FakeEngine([page('Sehr geehrte\nFrau Schäfer,'), page('Größe\n\nStraße')]);
    const s = service(engine);
    s.enqueue('a');
    await settle();
    const doc = docs.get('a')!;
    expect(engine.calls).toEqual(original.pages);
    expect(doc.pages).toBe(original.pages); // Originalfotos unverändert
    expect(doc.ocr!.pages.map((p) => p.text)).toEqual(['Sehr geehrte\nFrau Schäfer,', 'Größe\n\nStraße']);
    expect(doc.text).toBe('Sehr geehrte Frau Schäfer,\nGröße\nStraße');
    expect(doc.ocr!.engine).toBe('Fake');
    expect(s.state('a')).toBeNull();
    expect(done('a')).toMatchObject({ textReplaced: true });
    expect(announced.map((a) => a[0])).toEqual([
      'Texterkennung für 2 Seiten gestartet.',
      'Seite 1 von 2 erkannt.',
      'Text erkannt: 6 Wörter auf 2 Seiten. Genauigkeit gut.',
    ]);
  });

  it('meldet Fortschritt über alle Seiten', async () => {
    makeDoc('a', 2);
    const s = service(new FakeEngine([page('eins'), page('zwei')]));
    s.enqueue('a');
    await settle();
    const progress = events.flatMap((e) => (e.type === 'progress' && e.state.phase === 'recognizing' ? [[e.state.page, e.state.progress]] : []));
    expect(progress).toEqual([[1, 0], [1, 0.25], [1, 0.5], [2, 0.5], [2, 0.75], [2, 1]]);
  });

  it('erfindet nichts: leere Seiten bleiben leer und werden so gemeldet', async () => {
    makeDoc('a', 1);
    const s = service(new FakeEngine([page('')]));
    s.enqueue('a');
    await settle();
    expect(docs.get('a')!.text).toBe('');
    expect(docs.get('a')!.ocr!.pages[0]).toEqual({ text: '', confidence: 92, words: 0 });
    expect(announced.at(-1)).toEqual([expect.stringContaining('Auf der Seite wurde kein Text erkannt.'), 'error']);
  });

  it('nennt leere Einzelseiten und warnt bei niedriger Genauigkeit', () => {
    const ocr = { engine: 'x', language: 'deu', recognizedAt: 0, pages: [page('Text hier', 40), page('', 0)] };
    const [message, kind] = resultMessage('', ocr, true);
    expect(message).toBe('Text erkannt: 2 Wörter auf 2 Seiten. Genauigkeit niedrig. Auf Seite 2 wurde kein Text gefunden. Der Text enthält wahrscheinlich Fehler.');
    expect(kind).toBe('error');
  });

  it('überschreibt selbst bearbeiteten Text nicht', async () => {
    makeDoc('a', 1, 'Mein eigener Text');
    const s = service(new FakeEngine([page('Erkannter Text')]));
    s.enqueue('a');
    await settle();
    expect(docs.get('a')!.text).toBe('Mein eigener Text');
    expect(docs.get('a')!.ocr!.pages[0]!.text).toBe('Erkannter Text');
    expect(done('a')).toMatchObject({ textReplaced: false });
    expect(announced.at(-1)![0]).toContain('Dein bearbeiteter Text wurde nicht ersetzt.');
  });

  it('ersetzt unveränderten OCR-Text bei erneuter Erkennung', async () => {
    makeDoc('a', 1);
    const s = service(new FakeEngine([page('Alt'), page('Neu')]));
    s.enqueue('a');
    await settle();
    s.enqueue('a');
    await settle();
    expect(docs.get('a')!.text).toBe('Neu');
  });

  it('arbeitet Dokumente nacheinander ab und nutzt die Engine weiter', async () => {
    makeDoc('a', 1);
    makeDoc('b', 1);
    const create = vi.fn(async () => new FakeEngine([page('A'), page('B')]));
    const s = service(create);
    s.enqueue('a');
    s.enqueue('b');
    s.enqueue('a'); // doppelt: ignoriert
    expect(s.state('b')).toEqual({ phase: 'queued' });
    await settle();
    expect(docs.get('a')!.text).toBe('A');
    expect(docs.get('b')!.text).toBe('B');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('beendet die Engine nach einer Ruhephase', async () => {
    makeDoc('a', 1);
    const engine = new FakeEngine([page('A')]);
    service(engine).enqueue('a');
    await settle();
    expect(engine.terminated).toBe(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(engine.terminated).toBe(true);
  });

  it('bricht eine laufende Erkennung sofort ab, auch wenn die Engine hängt', async () => {
    makeDoc('a', 2);
    makeDoc('b', 1);
    const engine = new FakeEngine(['hang']);
    let created = 0;
    const s = service(async () => (created++ === 0 ? engine : new FakeEngine([page('B')])));
    s.enqueue('a');
    s.enqueue('b');
    await settle();
    expect(s.state('a')).toMatchObject({ phase: 'recognizing', page: 1 });
    await s.cancel('a');
    await settle();
    expect(engine.terminated).toBe(true);
    expect(s.state('a')).toBeNull();
    expect(docs.get('a')!.ocr).toBeNull();
    expect(events.some((e) => e.type === 'cancelled' && e.docId === 'a')).toBe(true);
    expect(announced.some(([m]) => m === 'Texterkennung abgebrochen.')).toBe(true);
    expect(docs.get('b')!.text).toBe('B'); // Warteschlange läuft weiter
  });

  it('entfernt wartende Dokumente beim Abbrechen aus der Warteschlange', async () => {
    makeDoc('a', 1);
    makeDoc('b', 1);
    const s = service(new FakeEngine(['hang']));
    s.enqueue('a');
    s.enqueue('b');
    await s.cancel('b');
    expect(s.state('b')).toBeNull();
  });

  it('meldet verständliche Fehler und behält kein Teilergebnis', async () => {
    makeDoc('a', 2);
    const s = service(new FakeEngine([page('eins'), new Error('RuntimeError: memory access out of bounds')]));
    s.enqueue('a');
    await settle();
    expect(docs.get('a')!.ocr).toBeNull();
    expect(docs.get('a')!.text).toBe('');
    expect(s.error('a')).toContain('Arbeitsspeicher');
    expect(announced.at(-1)).toEqual([expect.stringContaining('Arbeitsspeicher'), 'error']);
  });

  it('meldet fehlende Sprachdaten ohne Internet', async () => {
    makeDoc('a', 1);
    const s = service(async () => {
      throw new OcrError('offline');
    }, { needsDownload: async () => true });
    s.enqueue('a');
    await settle();
    expect(announced.map(([m]) => m)).toEqual([
      'Texterkennung für 1 Seite gestartet.',
      'Sprachdaten für die Texterkennung werden geladen, etwa 5 Megabyte. Das ist nur beim ersten Mal nötig.',
      expect.stringContaining('braucht beim ersten Mal eine Internetverbindung'),
    ]);
    // Neuer Versuch ist möglich.
    s.enqueue('a');
    expect(s.state('a')).toEqual({ phase: 'queued' });
  });

  it('meldet Dokumente ohne Fotos', async () => {
    makeDoc('a', 0);
    const s = service(new FakeEngine([]));
    s.enqueue('a');
    await settle();
    expect(s.error('a')).toContain('keine Fotos');
  });

  it('sagt bei langen Erkennungen regelmäßig den Fortschritt an', async () => {
    makeDoc('a', 1);
    let progress: (p: number) => void = () => {};
    let finish: (p: RecognizedPage) => void = () => {};
    const engine: OcrEngine = {
      name: 'slow',
      recognize: (_image, onProgress) => ((progress = onProgress), new Promise((resolve) => (finish = resolve))),
      terminate: async () => {},
    };
    const s = service(engine);
    s.enqueue('a');
    await settle();
    now += PROGRESS_ANNOUNCE_MS - 1;
    progress(0.3);
    now += 1;
    progress(0.4);
    now += 1000;
    progress(0.5);
    finish(page('fertig'));
    await settle();
    expect(announced.filter(([m]) => m.startsWith('Texterkennung läuft')).map(([m]) => m)).toEqual(['Texterkennung läuft: 40 Prozent.']);
  });

  it('nennt den Titel, wenn das Dokument gerade nicht angezeigt wird', async () => {
    makeDoc('a', 1);
    const s = service(new FakeEngine([page('Hallo')]), { isShowing: () => false });
    s.enqueue('a');
    await settle();
    expect(announced.at(-1)![0]).toBe('„Dok a“: Text erkannt: 1 Wort. Genauigkeit gut.');
  });
});
