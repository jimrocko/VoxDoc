/**
 * Minimaler PDF-Erzeuger ohne Fremdbibliothek: Fotos als JPEG-Seiten (A4) und
 * der Lesetext als echte Textseiten (Helvetica, WinAnsi – mit Umlauten und ß),
 * damit der Text kopiert, durchsucht und von VoiceOver gelesen werden kann.
 */
export interface PdfImage {
  /** JPEG-Daten (Baseline oder Progressive). */
  jpeg: Uint8Array;
}

export interface PdfInput {
  title: string;
  images: PdfImage[];
  /** Absätze des Lesetexts; leer = keine Textseiten. */
  paragraphs: string[];
  /** Hinweis über dem Text, z. B. dass er per Texterkennung entstand. */
  textNote?: string;
  createdAt?: Date;
}

export interface PdfResult {
  bytes: Uint8Array;
  pageCount: number;
  /** Zeichen, die Helvetica/WinAnsi nicht darstellen kann und durch „?“ ersetzt wurden. */
  replacedCharacters: number;
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 56.69; // 2 cm
const FONT_SIZE = 11;
const LEADING = 15.5;
const TITLE_SIZE = 16;

// ---------- JPEG ----------

export interface JpegInfo {
  width: number;
  height: number;
  components: number;
}

/** Liest Breite, Höhe und Farbkanäle aus dem SOF-Segment einer JPEG-Datei. */
export function readJpegInfo(bytes: Uint8Array): JpegInfo {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error('Keine JPEG-Datei');
  }
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = bytes[i + 1]!;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const length = (bytes[i + 2]! << 8) | bytes[i + 3]!;
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      return {
        height: (bytes[i + 5]! << 8) | bytes[i + 6]!,
        width: (bytes[i + 7]! << 8) | bytes[i + 8]!,
        components: bytes[i + 9]!,
      };
    }
    i += 2 + length;
  }
  throw new Error('JPEG ohne Bildgröße');
}

// ---------- Text (WinAnsi, Helvetica) ----------

/** Unicode → WinAnsi für die Zeichen 0x80–0x9F; 0xA0–0xFF entsprechen Latin-1. */
const WIN_ANSI_EXTRA: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
  0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91,
  0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98,
  0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

export function encodeWinAnsi(text: string): { bytes: number[]; replaced: number } {
  const bytes: number[] = [];
  let replaced = 0;
  for (const char of text.normalize('NFC')) {
    const code = char.codePointAt(0)!;
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) {
      bytes.push(code);
    } else if (WIN_ANSI_EXTRA[code] !== undefined) {
      bytes.push(WIN_ANSI_EXTRA[code]!);
    } else if (code === 0x09) {
      bytes.push(0x20);
    } else {
      bytes.push(0x3f); // „?“
      replaced++;
    }
  }
  return { bytes, replaced };
}

/** Breiten der Helvetica (1/1000 em) für ASCII 32–126 laut Adobe-AFM. */
const HELVETICA_ASCII = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667,
  556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556,
  556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722,
  500, 500, 500, 334, 260, 334, 584,
];
const HELVETICA_OTHER: Record<number, number> = {
  0xc4: 667, 0xd6: 778, 0xdc: 722, 0xe4: 556, 0xf6: 556, 0xfc: 556, 0xdf: 611, 0x80: 556, 0x84: 333, 0x93: 333,
  0x94: 333, 0x82: 222, 0x91: 222, 0x92: 222, 0x96: 556, 0x97: 1000, 0x85: 1000, 0xb7: 278, 0xb0: 400, 0xa7: 556,
  0x95: 350, 0xe9: 556, 0xe8: 556, 0xe0: 556, 0xe1: 556, 0xc9: 667, 0xa0: 278,
};
/** Fettschrift ist etwas breiter; für den Umbruch genügt ein Zuschlag. */
const BOLD_FACTOR = 1.08;

function widthOf(bytes: readonly number[], size: number, bold = false): number {
  let units = 0;
  for (const byte of bytes) {
    units += byte >= 32 && byte <= 126 ? HELVETICA_ASCII[byte - 32]! : (HELVETICA_OTHER[byte] ?? 556);
  }
  return (units / 1000) * size * (bold ? BOLD_FACTOR : 1);
}

/** Bricht einen Absatz in Zeilen um; überlange Wörter werden hart getrennt. */
export function wrapText(text: string, maxWidth: number, size = FONT_SIZE, bold = false): number[][] {
  const lines: number[][] = [];
  let line: number[] = [];
  const space = encodeWinAnsi(' ').bytes;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let bytes = encodeWinAnsi(word).bytes;
    while (widthOf(bytes, size, bold) > maxWidth) {
      if (line.length > 0) {
        lines.push(line);
        line = [];
      }
      let cut = bytes.length - 1;
      while (cut > 1 && widthOf(bytes.slice(0, cut), size, bold) > maxWidth) {
        cut--;
      }
      lines.push(bytes.slice(0, cut));
      bytes = bytes.slice(cut);
    }
    const candidate = line.length > 0 ? [...line, ...space, ...bytes] : bytes;
    if (widthOf(candidate, size, bold) > maxWidth && line.length > 0) {
      lines.push(line);
      line = bytes;
    } else {
      line = candidate;
    }
  }
  if (line.length > 0) {
    lines.push(line);
  }
  return lines;
}

const hex = (bytes: readonly number[]): string => `<${bytes.map((b) => b.toString(16).padStart(2, '0')).join('')}>`;

/** Text für Metadaten (Titel) als UTF-16BE mit BOM – dort ist jedes Zeichen erlaubt. */
function utf16Hex(text: string): string {
  const bytes = [0xfe, 0xff];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    bytes.push(code >> 8, code & 0xff);
  }
  return hex(bytes);
}

function pdfDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `D:${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

// ---------- Aufbau ----------

class PdfWriter {
  private chunks: Uint8Array[] = [];
  private length = 0;
  readonly offsets: number[] = [];
  private encoder = new TextEncoder();

  write(data: string | Uint8Array): void {
    const bytes = typeof data === 'string' ? this.encoder.encode(data) : data;
    this.chunks.push(bytes);
    this.length += bytes.length;
  }

  object(id: number, body: string, stream?: Uint8Array): void {
    this.offsets[id] = this.length;
    this.write(`${id} 0 obj\n${body}\n`);
    if (stream) {
      this.write('stream\n');
      this.write(stream);
      this.write('\nendstream\n');
    }
    this.write('endobj\n');
  }

  get position(): number {
    return this.length;
  }

  bytes(): Uint8Array {
    const result = new Uint8Array(this.length);
    let offset = 0;
    for (const chunk of this.chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }
}

interface TextLine {
  bytes: number[];
  size: number;
  bold: boolean;
  /** Abstand vor der Zeile. */
  gap: number;
}

/** Verteilt Textzeilen auf Seiten. */
function layoutText(input: PdfInput): { pages: TextLine[][]; replaced: number } {
  const maxWidth = PAGE_WIDTH - 2 * MARGIN;
  const lines: TextLine[] = [];
  let replaced = 0;
  const add = (text: string, size: number, bold: boolean, gapBefore: number) => {
    replaced += encodeWinAnsi(text).replaced;
    wrapText(text, maxWidth, size, bold).forEach((bytes, index) =>
      lines.push({ bytes, size, bold, gap: index === 0 ? gapBefore : 0 }),
    );
  };
  add(input.title, TITLE_SIZE, true, 0);
  if (input.textNote) {
    add(input.textNote, 9, false, 6);
  }
  input.paragraphs.forEach((paragraph, index) => add(paragraph, FONT_SIZE, false, index === 0 ? 14 : 7));

  const pages: TextLine[][] = [];
  let page: TextLine[] = [];
  let y = PAGE_HEIGHT - MARGIN;
  for (const line of lines) {
    const height = line.gap + (line.size === FONT_SIZE ? LEADING : line.size * 1.35);
    if (y - height < MARGIN && page.length > 0) {
      pages.push(page);
      page = [];
      y = PAGE_HEIGHT - MARGIN;
      line.gap = 0;
    }
    page.push(line);
    y -= line.gap + (line.size === FONT_SIZE ? LEADING : line.size * 1.35);
  }
  if (page.length > 0) {
    pages.push(page);
  }
  return { pages, replaced };
}

function textContent(lines: TextLine[]): string {
  let y = PAGE_HEIGHT - MARGIN;
  const ops: string[] = ['BT'];
  for (const line of lines) {
    const height = line.size === FONT_SIZE ? LEADING : line.size * 1.35;
    y -= line.gap + height;
    ops.push(`/${line.bold ? 'F2' : 'F1'} ${line.size} Tf`, `1 0 0 1 ${MARGIN.toFixed(2)} ${y.toFixed(2)} Tm`, `${hex(line.bytes)} Tj`);
  }
  ops.push('ET');
  return ops.join('\n');
}

export function buildPdf(input: PdfInput): PdfResult {
  const writer = new PdfWriter();
  if (input.images.length === 0 && input.paragraphs.length === 0) {
    throw new Error('Weder Fotos noch Text für das PDF');
  }
  writer.write('%PDF-1.4\n');
  // Ein Kommentar mit Bytes über 127 kennzeichnet die Datei als binär.
  writer.write(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  const text = input.paragraphs.length > 0 ? layoutText(input) : { pages: [], replaced: 0 };
  let next = 6; // 1 Katalog, 2 Seitenbaum, 3 Info, 4 Schrift, 5 Fettschrift
  const pageIds: number[] = [];
  const objects: (() => void)[] = [];

  for (const image of input.images) {
    const info = readJpegInfo(image.jpeg);
    const [imageId, contentId, pageId] = [next++, next++, next++];
    pageIds.push(pageId);
    const scale = Math.min((PAGE_WIDTH - 2 * MARGIN) / info.width, (PAGE_HEIGHT - 2 * MARGIN) / info.height);
    const w = info.width * scale;
    const h = info.height * scale;
    const x = (PAGE_WIDTH - w) / 2;
    const y = (PAGE_HEIGHT - h) / 2;
    const colorSpace = info.components === 1 ? '/DeviceGray' : info.components === 4 ? '/DeviceCMYK /Decode [1 0 1 0 1 0 1 0]' : '/DeviceRGB';
    const content = new TextEncoder().encode(`q\n${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm\n/Im1 Do\nQ`);
    objects.push(() => {
      writer.object(imageId, `<< /Type /XObject /Subtype /Image /Width ${info.width} /Height ${info.height} /ColorSpace ${colorSpace} /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.jpeg.length} >>`, image.jpeg);
      writer.object(contentId, `<< /Length ${content.length} >>`, content);
      writer.object(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /XObject << /Im1 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    });
  }

  for (const lines of text.pages) {
    const [contentId, pageId] = [next++, next++];
    pageIds.push(pageId);
    const content = new TextEncoder().encode(textContent(lines));
    objects.push(() => {
      writer.object(contentId, `<< /Length ${content.length} >>`, content);
      writer.object(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents ${contentId} 0 R >>`);
    });
  }

  writer.object(1, '<< /Type /Catalog /Pages 2 0 R /Lang (de-DE) /ViewerPreferences << /DisplayDocTitle true >> >>');
  writer.object(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);
  writer.object(3, `<< /Title ${utf16Hex(input.title)} /Producer (VoxDoc) /CreationDate (${pdfDate(input.createdAt ?? new Date())}) >>`);
  writer.object(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  writer.object(5, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  objects.forEach((write) => write());

  const xref = writer.position;
  const lines = ['xref', `0 ${next}`, '0000000000 65535 f '];
  for (let id = 1; id < next; id++) {
    lines.push(`${String(writer.offsets[id]).padStart(10, '0')} 00000 n `);
  }
  writer.write(`${lines.join('\n')}\ntrailer\n<< /Size ${next} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return { bytes: writer.bytes(), pageCount: pageIds.length, replacedCharacters: text.replaced };
}
