import { formatRecognizedText, textFromOcr } from '../ocr/format.ts';
import type { VoxDocument } from '../storage/documents.ts';
import { splitParagraphs } from './text.ts';

/** Wo im Lesetext die Seiten beginnen – nur bekannt, solange der Text unverändert aus der OCR stammt. */
export interface PageMap {
  /** Erster Absatz jeder Seite mit Text. */
  starts: { page: number; paragraph: number }[];
  totalPages: number;
  /** Warum seitenweises Springen nicht geht, falls `starts` leer ist. */
  unavailable?: string;
}

/** Seitenanfänge im Lesetext – nur, solange er unverändert aus der Texterkennung stammt. */
export function pageMapFor(doc: VoxDocument): PageMap {
  const totalPages = doc.pages.length;
  if (!doc.ocr || doc.ocr.pages.length !== totalPages || doc.text !== textFromOcr(doc.ocr)) {
    return {
      starts: [],
      totalPages,
      unavailable:
        totalPages > 1
          ? 'Seitenweise springen geht nur, solange der erkannte Text unverändert ist. Nutze „Nächster Absatz“.'
          : 'Dieses Dokument hat nur eine Seite. Nutze „Nächster Absatz“.',
    };
  }
  const starts: PageMap['starts'] = [];
  let paragraph = 0;
  doc.ocr.pages.forEach((page, index) => {
    const count = splitParagraphs(formatRecognizedText(page.text)).length;
    if (count > 0) {
      starts.push({ page: index + 1, paragraph });
      paragraph += count;
    }
  });
  return { starts, totalPages };
}

