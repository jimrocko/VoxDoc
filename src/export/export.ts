import { textFromOcr } from '../ocr/format.ts';
import { splitParagraphs } from '../reader/text.ts';
import type { VoxDocument } from '../storage/documents.ts';
import { buildPdf, type PdfResult } from './pdf.ts';

const JPEG_QUALITY = 0.88;

/**
 * Zeichnet jedes Foto neu als JPEG. So stimmt die Ausrichtung (Safari wendet
 * EXIF beim Zeichnen an, PDF-Leser nicht) und jedes Bild ist ein gewöhnliches RGB-JPEG.
 */
async function normalizedJpeg(page: Blob): Promise<Uint8Array> {
  const url = URL.createObjectURL(page);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Keine Zeichenfläche');
    }
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(img, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    if (!blob) {
      throw new Error('JPEG konnte nicht erzeugt werden');
    }
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function pdfFileName(doc: VoxDocument): string {
  return `${doc.title.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Dokument'}.pdf`;
}

export interface DocumentPdf extends PdfResult {
  blob: Blob;
  name: string;
  hasText: boolean;
}

/** PDF mit allen Fotos (in Seitenreihenfolge) und dem Lesetext als durchsuchbarem Text. */
export async function documentToPdf(doc: VoxDocument): Promise<DocumentPdf> {
  const images = [];
  for (const page of doc.pages) {
    images.push({ jpeg: await normalizedJpeg(page) });
  }
  const paragraphs = splitParagraphs(doc.text);
  const fromOcr = doc.ocr !== null && doc.text === textFromOcr(doc.ocr);
  const result = buildPdf({
    title: doc.title,
    images,
    paragraphs,
    ...(fromOcr ? { textNote: 'Text per automatischer Texterkennung aus den Fotos erstellt; er kann Fehler enthalten.' } : {}),
    createdAt: new Date(doc.createdAt),
  });
  return {
    ...result,
    blob: new Blob([result.bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }),
    name: pdfFileName(doc),
    hasText: paragraphs.length > 0,
  };
}
