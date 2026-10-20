import fontUrl from './fonts/LiberationSans-Regular.ttf?url';
import type { VoxDocument } from '../storage/documents.ts';
import { toHtml, toPdfBlocks, toText } from './formats.ts';
import { buildExportModel, exportFileName } from './model.ts';
import { buildPdf, type PdfFont } from './pdf.ts';
import { parseTrueType } from './ttf.ts';

export type ExportFormat = 'pdf' | 'html' | 'txt';

export const formatLabels: Record<ExportFormat, string> = {
  pdf: 'PDF',
  html: 'HTML-Webseite',
  txt: 'Text (TXT)',
};

export interface ExportResult {
  blob: Blob;
  name: string;
  format: ExportFormat;
  /** Für die Ansage, z. B. „PDF mit 3 Seiten“. */
  summary: string;
  replacedCharacters: number;
}

export class ExportError extends Error {
  constructor(readonly reason: 'unsupported' | 'font' | 'image') {
    super(reason);
    this.name = 'ExportError';
  }
}

export const exportErrorMessages: Record<ExportError['reason'], string> = {
  unsupported: 'Der PDF-Export braucht iOS 16.4 oder neuer. Text und HTML funktionieren auch hier.',
  font: 'Die Schrift für das PDF konnte nicht geladen werden. Sie wird beim ersten Mal aus dem Netz geladen. Text und HTML funktionieren auch offline.',
  image: 'Ein Foto konnte nicht für den Export gelesen werden.',
};

const JPEG_QUALITY = 0.88;

/** Foto neu zeichnen: richtige Ausrichtung (EXIF) und gewöhnliches RGB-JPEG. */
async function normalizedJpeg(page: Blob): Promise<Blob> {
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
      throw new ExportError('image');
    }
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(img, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    if (!blob) {
      throw new ExportError('image');
    }
    return blob;
  } catch (error) {
    throw error instanceof ExportError ? error : new ExportError('image');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new ExportError('image'));
    reader.readAsDataURL(blob);
  });
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

let fontPromise: Promise<PdfFont> | null = null;

/** Liberation Sans (SIL OFL 1.1) – wird vom Service Worker für die Offline-Nutzung vorgehalten. */
function loadFont(): Promise<PdfFont> {
  fontPromise ??= fetch(fontUrl)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.arrayBuffer();
    })
    .then((buffer) => {
      const program = new Uint8Array(buffer);
      return { program, metrics: parseTrueType(program) };
    })
    .catch(() => {
      fontPromise = null;
      throw new ExportError('font');
    });
  return fontPromise;
}

export function pdfSupported(): boolean {
  return typeof CompressionStream === 'function';
}

export async function exportDocument(doc: VoxDocument, format: ExportFormat, includePhotos: boolean): Promise<ExportResult> {
  const model = buildExportModel(doc, includePhotos && format !== 'txt');
  if (format === 'txt') {
    return {
      blob: new Blob([toText(model)], { type: 'text/plain;charset=utf-8' }),
      name: exportFileName(doc.title, 'txt'),
      format,
      summary: 'Textdatei',
      replacedCharacters: 0,
    };
  }
  const photos = [];
  for (const photo of model.photos) {
    photos.push(await normalizedJpeg(photo.blob));
  }
  if (format === 'html') {
    const sources = await Promise.all(photos.map(dataUrl));
    const html = toHtml(model, model.photos.map((photo, index) => ({ src: sources[index]!, alt: photo.alt, caption: photo.caption })));
    return {
      blob: new Blob([html], { type: 'text/html;charset=utf-8' }),
      name: exportFileName(doc.title, 'html'),
      format,
      summary: photos.length > 0 ? `HTML-Datei mit ${photos.length === 1 ? '1 Foto' : `${photos.length} Fotos`}` : 'HTML-Datei',
      replacedCharacters: 0,
    };
  }
  if (!pdfSupported()) {
    throw new ExportError('unsupported');
  }
  const font = await loadFont();
  const jpegs = await Promise.all(photos.map(async (photo) => new Uint8Array(await photo.arrayBuffer())));
  const pdf = await buildPdf({
    title: model.title,
    lang: 'de-DE',
    blocks: toPdfBlocks(model, jpegs),
    font,
    deflate,
    createdAt: model.createdAt,
  });
  return {
    blob: new Blob([pdf.bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }),
    name: exportFileName(doc.title, 'pdf'),
    format,
    summary: `PDF mit ${pdf.pageCount === 1 ? '1 Seite' : `${pdf.pageCount} Seiten`}`,
    replacedCharacters: pdf.replacedCharacters,
  };
}
