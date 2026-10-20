import { formatRecognizedText, textFromOcr } from '../ocr/format.ts';
import { spokenDate } from '../format.ts';
import { splitParagraphs } from '../reader/text.ts';
import type { VoxDocument } from '../storage/documents.ts';

/**
 * Gemeinsamer Inhalt aller Exportformate – damit TXT, HTML und PDF dieselben
 * Überschriften, Absätze und dieselbe Lesereihenfolge haben:
 * Titel › Angaben › je Seite (oder „Text“) Überschrift und Absätze › Fotos.
 */
export interface ExportSection {
  heading: string;
  paragraphs: string[];
  /** Hinweis statt Text, z. B. wenn auf einer Seite nichts erkannt wurde. */
  note?: string;
}

export interface ExportPhoto {
  blob: Blob;
  caption: string;
  alt: string;
}

export interface ExportModel {
  title: string;
  /** Erstellungsdatum und Seitenzahl. */
  details: string;
  /** Hinweis auf die Herkunft des Texts, falls er aus der Texterkennung stammt. */
  ocrNote: string | null;
  sections: ExportSection[];
  photos: ExportPhoto[];
  createdAt: Date;
}

export const OCR_NOTE = 'Der Text wurde per automatischer Texterkennung aus den Fotos erstellt und kann Fehler enthalten.';

export function buildExportModel(doc: VoxDocument, includePhotos: boolean): ExportModel {
  const pageCount = doc.pages.length;
  const details = `Gescannt am ${spokenDate(doc.createdAt)}${pageCount > 0 ? ` · ${pageCount === 1 ? '1 Seite' : `${pageCount} Seiten`}` : ''}`;
  const fromOcr = doc.ocr !== null && doc.ocr.pages.length === pageCount && doc.text === textFromOcr(doc.ocr);

  let sections: ExportSection[];
  if (fromOcr && pageCount > 1) {
    // Unveränderter OCR-Text: Seiten als eigene Abschnitte erhalten.
    sections = doc.ocr!.pages.map((page, index) => {
      const paragraphs = splitParagraphs(formatRecognizedText(page.text));
      return {
        heading: `Seite ${index + 1}`,
        paragraphs,
        ...(paragraphs.length === 0 ? { note: 'Auf dieser Seite wurde kein Text erkannt.' } : {}),
      };
    });
  } else {
    const paragraphs = splitParagraphs(doc.text);
    sections = [
      {
        heading: 'Text',
        paragraphs,
        ...(paragraphs.length === 0 ? { note: 'Dieses Dokument enthält noch keinen Text.' } : {}),
      },
    ];
  }

  const photos = includePhotos
    ? doc.pages.map((blob, index) => ({
        blob,
        caption: pageCount === 1 ? 'Foto des Dokuments' : `Foto von Seite ${index + 1} von ${pageCount}`,
        alt:
          pageCount === 1
            ? `Foto des Dokuments „${doc.title}“. Der Text steht oben im Abschnitt „Text“.`
            : `Foto von Seite ${index + 1} des Dokuments „${doc.title}“. Der Text dieser Seite steht oben${fromOcr ? ` im Abschnitt „Seite ${index + 1}“` : ''}.`,
      }))
    : [];

  return {
    title: doc.title,
    details,
    ocrNote: doc.ocr !== null && doc.text.trim() !== '' && doc.text === textFromOcr(doc.ocr) ? OCR_NOTE : null,
    sections,
    photos,
    createdAt: new Date(doc.createdAt),
  };
}

export function exportFileName(title: string, extension: string): string {
  return `${title.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Dokument'}.${extension}`;
}
