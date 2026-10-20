import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeCommand, parseAlternatives, parseCommand } from '../src/voice/commands.ts';
import { LISTEN_TIMEOUT_MS, listenOnce, type RecognitionLike } from '../src/voice/recognition.ts';
import { pageMapFor } from '../src/reader/pages.ts';
import { textFromOcr } from '../src/ocr/format.ts';
import type { VoxDocument } from '../src/storage/documents.ts';

describe('parseCommand', () => {
  const cases: [string, unknown][] = [
    ['Dokument scannen', { type: 'scan' }],
    ['Scannen.', { type: 'scan' }],
    ['neues Dokument', { type: 'scan' }],
    ['Vorlesen', { type: 'read' }],
    ['Lies vor!', { type: 'read' }],
    ['Bitte vorlesen', { type: 'read' }],
    ['Pause', { type: 'pause' }],
    ['Anhalten', { type: 'pause' }],
    ['Weiterlesen', { type: 'resume' }],
    ['weiter', { type: 'resume' }],
    ['Fortsetzen', { type: 'resume' }],
    ['Nächste Seite', { type: 'nextPage' }],
    ['Vorherige Seite', { type: 'previousPage' }],
    ['Nächster Absatz', { type: 'nextParagraph' }],
    ['Absatz zurück', { type: 'previousParagraph' }],
    ['Noch einmal', { type: 'repeat' }],
    ['Von vorn', { type: 'restart' }],
    ['Stopp', { type: 'stop' }],
    ['Schneller', { type: 'faster' }],
    ['Etwas langsamer', { type: 'slower' }],
    ['Suche', { type: 'search', query: '' }],
    ['Suche nach Stromrechnung', { type: 'search', query: 'stromrechnung' }],
    ['Finde Müller', { type: 'search', query: 'müller' }],
    ['Suche nach PDF', { type: 'search', query: 'pdf' }],
    ['Speichern', { type: 'save' }],
    ['Als PDF exportieren', { type: 'exportPdf' }],
    ['PDF', { type: 'exportPdf' }],
    ['Aufnehmen', { type: 'capture' }],
    ['Hilfe', { type: 'help' }],
    ['Was kann ich sagen?', { type: 'commands' }],
    ['Bibliothek', { type: 'library' }],
    ['Startseite', { type: 'home' }],
    ['Einstellungen', { type: 'settings' }],
  ];
  it.each(cases)('„%s“', (text, expected) => {
    expect(parseCommand(text)).toEqual(expected);
  });

  it('erkennt Unsinn und leere Eingaben nicht als Befehl', () => {
    expect(parseCommand('')).toBeNull();
    expect(parseCommand('Wie wird das Wetter?')).toBeNull();
    expect(parseCommand('Vorlesen von irgendwas Langem')).toBeNull();
    expect(parseCommand('Sucherei')).toBeNull();
  });

  it('normalisiert Satzzeichen, Groß-/Kleinschreibung und Füllwörter', () => {
    expect(normalizeCommand('  Hey VoxDoc, bitte VORLESEN!  ')).toBe('vorlesen');
  });

  it('nimmt die erste passende Alternative der Spracherkennung', () => {
    expect(parseAlternatives(['Vor lesen Sie', 'vorlesen'])).toEqual({ command: { type: 'read' }, heard: 'vorlesen' });
    expect(parseAlternatives(['blabla'])).toBeNull();
  });
});

class FakeRecognition extends EventTarget implements RecognitionLike {
  lang = '';
  continuous = true;
  interimResults = true;
  maxAlternatives = 1;
  started = false;
  aborted = false;
  start() { this.started = true; }
  stop() {}
  abort() { this.aborted = true; }
  say(...alternatives: string[]) {
    const result = Object.assign(alternatives.map((transcript) => ({ transcript })), { isFinal: true });
    this.dispatchEvent(Object.assign(new Event('result'), { results: [result] }));
    this.dispatchEvent(new Event('end'));
  }
  fail(error: string) {
    this.dispatchEvent(Object.assign(new Event('error'), { error }));
    this.dispatchEvent(new Event('end'));
  }
}

describe('listenOnce', () => {
  let fake: FakeRecognition;
  beforeEach(() => {
    vi.useFakeTimers();
    fake = new FakeRecognition();
  });
  afterEach(() => vi.useRealTimers());

  it('stellt Deutsch und Einzelbefehl ein und liefert die Alternativen', async () => {
    const listening = listenOnce(() => fake);
    expect(fake).toMatchObject({ lang: 'de-DE', continuous: false, interimResults: false, maxAlternatives: 5, started: true });
    fake.say('Vorlesen', 'vor lesen');
    await expect(listening.result).resolves.toEqual(['Vorlesen', 'vor lesen']);
  });

  it.each([
    ['not-allowed', 'not-allowed'],
    ['service-not-allowed', 'service-not-allowed'],
    ['network', 'network'],
    ['no-speech', 'no-speech'],
    ['audio-capture', 'audio-capture'],
    ['etwas-neues', 'unknown'],
  ])('übersetzt den Fehler %s', async (error, code) => {
    const listening = listenOnce(() => fake);
    fake.fail(error);
    await expect(listening.result).rejects.toMatchObject({ code });
  });

  it('meldet „nichts gehört“, wenn die Erkennung ohne Ergebnis endet', async () => {
    const listening = listenOnce(() => fake);
    fake.dispatchEvent(new Event('end'));
    await expect(listening.result).rejects.toMatchObject({ code: 'no-speech' });
  });

  it('bricht nach einer Zeitüberschreitung ab', async () => {
    const listening = listenOnce(() => fake);
    const result = expect(listening.result).rejects.toMatchObject({ code: 'timeout' });
    vi.advanceTimersByTime(LISTEN_TIMEOUT_MS);
    await result;
    expect(fake.aborted).toBe(true);
  });

  it('lässt sich abbrechen', async () => {
    const listening = listenOnce(() => fake);
    listening.abort();
    await expect(listening.result).rejects.toMatchObject({ code: 'aborted' });
  });
});

describe('pageMapFor', () => {
  const ocrPage = (text: string) => ({ text, confidence: 90, words: text.split(/\s+/).filter(Boolean).length });
  const doc = (pages: string[], edited?: string): VoxDocument => {
    const ocr = { engine: 't', language: 'deu', recognizedAt: 0, pages: pages.map(ocrPage) };
    return { id: 'd', title: 'D', pages: pages.map(() => new Blob()), ocr, text: edited ?? textFromOcr(ocr), createdAt: 0, updatedAt: 0 };
  };

  it('findet die Seitenanfänge und überspringt leere Seiten', () => {
    expect(pageMapFor(doc(['A\n\nB', '', 'C\nD\nE'])).starts).toEqual([
      { page: 1, paragraph: 0 },
      { page: 3, paragraph: 2 },
    ]);
  });

  it('ist bei bearbeitetem Text nicht verfügbar und sagt warum', () => {
    const map = pageMapFor(doc(['A', 'B'], 'Eigener Text'));
    expect(map.starts).toEqual([]);
    expect(map.unavailable).toContain('unverändert');
  });
});
