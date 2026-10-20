import type { OcrResult } from '../storage/documents.ts';

/**
 * Bringt die Zeilen der OCR in Absätze, damit Vorlesen und Absatz-Navigation
 * sinnvoll funktionieren. Es werden nur Zeilenumbrüche und Leerraum
 * verändert – kein Zeichen wird hinzugefügt, entfernt oder „korrigiert“.
 */
export function formatRecognizedText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n/)
    .map((block) =>
      block
        .split('\n')
        .map((line) => line.replace(/[ \t]+/g, ' ').trim())
        .filter(Boolean)
        .reduce((paragraph, line) => {
          if (!paragraph) {
            return line;
          }
          // Silbentrennung am Zeilenende: „Rech-“ + „nung“ → „Rech-nung“ (Bindestrich bleibt erhalten).
          return /-$/.test(paragraph) && /^\p{Ll}/u.test(line) ? paragraph + line : `${paragraph} ${line}`;
        }, ''),
    )
    .filter(Boolean)
    .join('\n');
}

/** Lesetext aus einem OCR-Ergebnis: alle Seiten nacheinander. */
export function textFromOcr(ocr: OcrResult): string {
  return ocr.pages
    .map((page) => formatRecognizedText(page.text))
    .filter(Boolean)
    .join('\n');
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

export type ConfidenceLevel = 'good' | 'medium' | 'low';

export function confidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 80) {
    return 'good';
  }
  return confidence >= 60 ? 'medium' : 'low';
}

export const confidenceLabels: Record<ConfidenceLevel, string> = {
  good: 'gut',
  medium: 'mittel',
  low: 'niedrig',
};

/** Durchschnitt über Seiten mit Text, gewichtet nach Wortzahl. */
export function overallConfidence(ocr: OcrResult): number | null {
  const words = ocr.pages.reduce((sum, page) => sum + page.words, 0);
  if (words === 0) {
    return null;
  }
  return Math.round(ocr.pages.reduce((sum, page) => sum + page.confidence * page.words, 0) / words);
}
