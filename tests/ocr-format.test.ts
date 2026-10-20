import { describe, expect, it } from 'vitest';
import { classifyOcrError, OcrError } from '../src/ocr/errors.ts';
import { confidenceLevel, countWords, formatRecognizedText, overallConfidence, textFromOcr } from '../src/ocr/format.ts';

describe('formatRecognizedText', () => {
  it('fügt Zeilen zu Absätzen zusammen und trennt Absätze an Leerzeilen', () => {
    const raw = 'Sehr geehrte Frau Schäfer,\n\nfür den Zeitraum Oktober\nberechnen wir 84,20 Euro.\n\n\nMit freundlichen Grüßen\n';
    expect(formatRecognizedText(raw)).toBe('Sehr geehrte Frau Schäfer,\nfür den Zeitraum Oktober berechnen wir 84,20 Euro.\nMit freundlichen Grüßen');
  });

  it('behält Bindestriche und verändert keine Zeichen', () => {
    expect(formatRecognizedText('Strom-\nrechnung und Ein-\nUnd Ausgang')).toBe('Strom-rechnung und Ein- Und Ausgang');
    const raw = 'Größe Ärger Öl Übung Straße ½ € 3,50\n';
    const letters = (text: string) => text.replace(/\s+/g, '');
    expect(letters(formatRecognizedText(raw))).toBe(letters(raw));
  });

  it('liefert für leere Ergebnisse einen leeren Text', () => {
    expect(formatRecognizedText('')).toBe('');
    expect(formatRecognizedText(' \n \n')).toBe('');
  });
});

describe('Auswertung', () => {
  const ocr = (pages: { text: string; confidence: number; words: number }[]) => ({ engine: 'test', language: 'deu', recognizedAt: 0, pages });

  it('zählt nur Wörter mit Buchstaben oder Ziffern', () => {
    expect(countWords('Größe – 84,20 € ...')).toBe(2);
  });

  it('gewichtet die Genauigkeit nach Wortzahl und ignoriert leere Seiten', () => {
    expect(overallConfidence(ocr([{ text: 'a b c', confidence: 90, words: 3 }, { text: 'd', confidence: 50, words: 1 }, { text: '', confidence: 0, words: 0 }]))).toBe(80);
    expect(overallConfidence(ocr([{ text: '', confidence: 0, words: 0 }]))).toBeNull();
    expect(confidenceLevel(80)).toBe('good');
    expect(confidenceLevel(60)).toBe('medium');
    expect(confidenceLevel(59)).toBe('low');
  });

  it('setzt den Lesetext aus allen Seiten zusammen', () => {
    expect(textFromOcr(ocr([{ text: 'Seite eins\n', confidence: 90, words: 2 }, { text: '', confidence: 0, words: 0 }, { text: 'Seite\ndrei', confidence: 90, words: 2 }]))).toBe('Seite eins\nSeite drei');
  });
});

describe('classifyOcrError', () => {
  it('ordnet typische Fehler zu', () => {
    expect(classifyOcrError(new OcrError('offline'))).toBe('offline');
    expect(classifyOcrError(new DOMException('voll', 'QuotaExceededError'))).toBe('storage');
    expect(classifyOcrError(new Error('RuntimeError: memory access out of bounds'))).toBe('memory');
    expect(classifyOcrError(new Error('Aborted(OOM)'))).toBe('memory');
    expect(classifyOcrError('irgendwas')).toBe('failed');
  });
});
