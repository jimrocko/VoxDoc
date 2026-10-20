import { winAnsiToUnicode, type FontMetrics } from './ttf.ts';

/**
 * Eigener PDF-Erzeuger (keine Fremdbibliothek) für getaggte PDFs:
 * Strukturbaum (Document, H1, H2, P, Figure mit Alternativtext), markierter
 * Inhalt mit MCIDs, Seitenzahlen als Artefakte, eingebettete TrueType-Schrift
 * mit ToUnicode-Tabelle, XMP-Metadaten, Sprache und Lesezeichen.
 *
 * Bewusst ohne PDF/UA-Kennung (pdfuaid): Ob ein Dokument PDF/UA erfüllt,
 * verlangt auch Prüfungen durch Menschen (z. B. Qualität der Alternativtexte).
 */
export type PdfBlock =
  | { kind: 'heading'; level: 1 | 2; text: string }
  | { kind: 'paragraph'; text: string; small?: boolean }
  | { kind: 'figure'; jpeg: Uint8Array; alt: string };

export interface PdfFont {
  /** TrueType-Datei (wird vollständig eingebettet). */
  program: Uint8Array;
  metrics: FontMetrics;
}

export interface PdfInput {
  title: string;
  /** BCP-47, z. B. „de-DE“. */
  lang: string;
  blocks: PdfBlock[];
  font: PdfFont;
  /** zlib-Kompression (FlateDecode); im Browser über CompressionStream. */
  deflate: (data: Uint8Array) => Promise<Uint8Array>;
  createdAt?: Date;
}

export interface PdfResult {
  bytes: Uint8Array;
  pageCount: number;
  /** Zeichen, die Schrift oder Kodierung nicht darstellen können; durch „?“ ersetzt. */
  replacedCharacters: number;
  structure: { headings: number; paragraphs: number; figures: number };
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 56.69; // 2 cm
const FOOTER_Y = 28;
const CONTENT_BOTTOM = MARGIN;

const STYLES = {
  h1: { size: 18, leading: 24, before: 0 },
  h2: { size: 14, leading: 19, before: 16 },
  p: { size: 11, leading: 15.5, before: 7 },
  small: { size: 9, leading: 12.5, before: 5 },
} as const;

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
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
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

// ---------- Text ----------

const UNICODE_TO_WIN_ANSI = new Map<number, number>();
for (let code = 0x20; code <= 0xff; code++) {
  const unicode = winAnsiToUnicode(code);
  if (unicode !== null) {
    UNICODE_TO_WIN_ANSI.set(unicode, code);
  }
}

/** Kodiert Text für die eingebettete Schrift; nicht darstellbare Zeichen werden „?“. */
export function encodeText(text: string, metrics: FontMetrics): { bytes: number[]; replaced: number } {
  const bytes: number[] = [];
  let replaced = 0;
  for (const char of text.normalize('NFC')) {
    const unicode = char.codePointAt(0)!;
    const code = unicode === 0x09 ? 0x20 : UNICODE_TO_WIN_ANSI.get(unicode);
    if (code !== undefined && metrics.widths[code - 32] != null) {
      bytes.push(code);
    } else {
      bytes.push(0x3f);
      replaced++;
    }
  }
  return { bytes, replaced };
}

function widthOf(bytes: readonly number[], size: number, metrics: FontMetrics): number {
  return (bytes.reduce((sum, code) => sum + (metrics.widths[code - 32] ?? 0), 0) / 1000) * size;
}

/** Bricht Text in Zeilen der Breite `maxWidth` um; überlange Wörter werden hart getrennt. */
export function wrapText(text: string, maxWidth: number, size: number, metrics: FontMetrics): number[][] {
  const lines: number[][] = [];
  let line: number[] = [];
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let bytes = encodeText(word, metrics).bytes;
    while (widthOf(bytes, size, metrics) > maxWidth) {
      if (line.length > 0) {
        lines.push(line);
        line = [];
      }
      let cut = bytes.length - 1;
      while (cut > 1 && widthOf(bytes.slice(0, cut), size, metrics) > maxWidth) {
        cut--;
      }
      lines.push(bytes.slice(0, cut));
      bytes = bytes.slice(cut);
    }
    const candidate = line.length > 0 ? [...line, 0x20, ...bytes] : bytes;
    if (line.length > 0 && widthOf(candidate, size, metrics) > maxWidth) {
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

const hex = (bytes: Iterable<number>): string =>
  `<${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}>`;

/** Text für Metadaten und Alternativtexte als UTF-16BE mit BOM. */
function utf16Hex(text: string): string {
  const bytes = [0xfe, 0xff];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    bytes.push(code >> 8, code & 0xff);
  }
  return hex(bytes);
}

const xmlEscape = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function pdfDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `D:${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

// ---------- Layout ----------

type StructType = 'H1' | 'H2' | 'P' | 'Figure';

interface StructElement {
  type: StructType;
  kids: { page: number; mcid: number }[];
  alt?: string;
  bbox?: [number, number, number, number];
}

interface ImageRef {
  name: string;
  jpeg: Uint8Array;
  info: JpegInfo;
}

interface Page {
  ops: string[];
  /** Struktur-Element je MCID (für den ParentTree). */
  mcids: number[];
  images: ImageRef[];
}

interface Bookmark {
  title: string;
  page: number;
  y: number;
}

function layout(input: PdfInput) {
  const { metrics } = input.font;
  const pages: Page[] = [];
  const elements: StructElement[] = [];
  const bookmarks: Bookmark[] = [];
  let replaced = 0;
  let imageCount = 0;
  let page: Page;
  let y = 0;
  const maxWidth = PAGE_WIDTH - 2 * MARGIN;

  const newPage = (): void => {
    page = { ops: [], mcids: [], images: [] };
    pages.push(page);
    y = PAGE_HEIGHT - MARGIN;
  };
  newPage();

  const mark = (element: number): number => {
    const mcid = page.mcids.length;
    page.mcids.push(element);
    elements[element]!.kids.push({ page: pages.length - 1, mcid });
    return mcid;
  };

  const addText = (type: StructType, text: string, style: (typeof STYLES)[keyof typeof STYLES], bookmark: boolean): void => {
    replaced += encodeText(text, metrics).replaced;
    const lines = wrapText(text, maxWidth, style.size, metrics);
    if (lines.length === 0) {
      return;
    }
    const element = elements.push({ type, kids: [] }) - 1;
    const atTop = y === PAGE_HEIGHT - MARGIN;
    let before = atTop ? 0 : style.before;
    lines.forEach((bytes, index) => {
      // Überschrift nicht allein am Seitenende stehen lassen.
      const needed = before + style.leading * (index === 0 && type.startsWith('H') ? 3 : 1);
      if (y - needed < CONTENT_BOTTOM) {
        newPage();
        before = 0;
      }
      y -= before + style.leading;
      before = 0;
      if (index === 0 && bookmark) {
        bookmarks.push({ title: text, page: pages.length - 1, y: y + style.leading });
      }
      const mcid = mark(element);
      page.ops.push(
        `/${type} <</MCID ${mcid}>> BDC BT /F1 ${style.size} Tf 1 0 0 1 ${MARGIN.toFixed(2)} ${(y + style.size * 0.25).toFixed(2)} Tm ${hex(bytes)} Tj ET EMC`,
      );
    });
  };

  const addFigure = (block: Extract<PdfBlock, { kind: 'figure' }>): void => {
    const info = readJpegInfo(block.jpeg);
    const available = y - CONTENT_BOTTOM - 7;
    // Zu wenig Platz: Foto auf einer neuen Seite möglichst groß zeigen.
    if (available < 260) {
      newPage();
    }
    const room = Math.min(y - CONTENT_BOTTOM - 7, PAGE_HEIGHT - 2 * MARGIN);
    const scale = Math.min(maxWidth / info.width, room / info.height);
    const w = info.width * scale;
    const h = info.height * scale;
    const x = MARGIN + (maxWidth - w) / 2;
    y -= 7 + h;
    const name = `Im${++imageCount}`;
    page.images.push({ name, jpeg: block.jpeg, info });
    const element = elements.push({ type: 'Figure', kids: [], alt: block.alt, bbox: [x, y, x + w, y + h] }) - 1;
    const mcid = mark(element);
    page.ops.push(`/Figure <</MCID ${mcid}>> BDC q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /${name} Do Q EMC`);
  };

  for (const block of input.blocks) {
    if (block.kind === 'heading') {
      addText(block.level === 1 ? 'H1' : 'H2', block.text, block.level === 1 ? STYLES.h1 : STYLES.h2, true);
    } else if (block.kind === 'paragraph') {
      addText('P', block.text, block.small ? STYLES.small : STYLES.p, false);
    } else {
      addFigure(block);
    }
  }
  return { pages, elements, bookmarks, replaced };
}

// ---------- Ausgabe ----------

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

function toUnicodeCMap(metrics: FontMetrics): string {
  const entries: string[] = [];
  for (let code = 32; code <= 255; code++) {
    const unicode = winAnsiToUnicode(code);
    if (unicode !== null && metrics.widths[code - 32] != null) {
      entries.push(`<${code.toString(16).padStart(2, '0')}> <${unicode.toString(16).padStart(4, '0')}>`);
    }
  }
  const blocks: string[] = [];
  for (let i = 0; i < entries.length; i += 100) {
    const part = entries.slice(i, i + 100);
    blocks.push(`${part.length} beginbfchar\n${part.join('\n')}\nendbfchar`);
  }
  return [
    '/CIDInit /ProcSet findresource begin',
    '12 dict begin',
    'begincmap',
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
    '/CMapName /Adobe-Identity-UCS def',
    '/CMapType 2 def',
    '1 begincodespacerange',
    '<00> <FF>',
    'endcodespacerange',
    ...blocks,
    'endcmap',
    'CMapName currentdict /CMap defineresource pop',
    'end',
    'end',
  ].join('\n');
}

function xmp(title: string, lang: string, date: Date): string {
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
<dc:format>application/pdf</dc:format>
<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xmlEscape(title)}</rdf:li></rdf:Alt></dc:title>
<dc:language><rdf:Bag><rdf:li>${xmlEscape(lang)}</rdf:li></rdf:Bag></dc:language>
<xmp:CreateDate>${date.toISOString().replace(/\.\d{3}Z$/, 'Z')}</xmp:CreateDate>
<xmp:CreatorTool>VoxDoc</xmp:CreatorTool>
<pdf:Producer>VoxDoc</pdf:Producer>
</rdf:Description>
</rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

export async function buildPdf(input: PdfInput): Promise<PdfResult> {
  if (input.blocks.length === 0) {
    throw new Error('Kein Inhalt für das PDF');
  }
  const { metrics, program } = input.font;
  const date = input.createdAt ?? new Date();
  const { pages, elements, bookmarks, replaced } = layout(input);
  const encoder = new TextEncoder();

  // Feste Objekte
  const CATALOG = 1, PAGES = 2, INFO = 3, FONT = 4, DESCRIPTOR = 5, FONT_FILE = 6, TO_UNICODE = 7;
  const STRUCT_ROOT = 8, DOCUMENT = 9, PARENT_TREE = 10, METADATA = 11, OUTLINES = 12;
  let next = 13;
  const elementIds = elements.map(() => next++);
  const pageIds = pages.map(() => next++);
  const contentIds = pages.map(() => next++);
  const imageIds = pages.map((page) => page.images.map(() => next++));
  const bookmarkIds = bookmarks.map(() => next++);

  const writer = new PdfWriter();
  writer.write('%PDF-1.7\n');
  // Ein Kommentar mit Bytes über 127 kennzeichnet die Datei als binär.
  writer.write(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  writer.object(
    CATALOG,
    `<< /Type /Catalog /Pages ${PAGES} 0 R /Lang (${input.lang.replace(/[^A-Za-z0-9-]/g, "")}) /MarkInfo << /Marked true >> /StructTreeRoot ${STRUCT_ROOT} 0 R /Metadata ${METADATA} 0 R /Outlines ${OUTLINES} 0 R /PageMode /UseOutlines /ViewerPreferences << /DisplayDocTitle true >> >>`,
  );
  writer.object(PAGES, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  writer.object(INFO, `<< /Title ${utf16Hex(input.title)} /Producer (VoxDoc) /Creator (VoxDoc) /CreationDate (${pdfDate(date)}) >>`);

  const widths = metrics.widths.map((w) => w ?? 0).join(' ');
  writer.object(
    FONT,
    `<< /Type /Font /Subtype /TrueType /BaseFont /${metrics.postScriptName} /FirstChar 32 /LastChar 255 /Widths [${widths}] /Encoding /WinAnsiEncoding /FontDescriptor ${DESCRIPTOR} 0 R /ToUnicode ${TO_UNICODE} 0 R >>`,
  );
  writer.object(
    DESCRIPTOR,
    `<< /Type /FontDescriptor /FontName /${metrics.postScriptName} /Flags 32 /FontBBox [${metrics.bbox.join(' ')}] /ItalicAngle ${metrics.italicAngle} /Ascent ${metrics.ascent} /Descent ${metrics.descent} /CapHeight ${metrics.capHeight} /StemV 80 /FontFile2 ${FONT_FILE} 0 R >>`,
  );
  const fontStream = await input.deflate(program);
  writer.object(FONT_FILE, `<< /Length ${fontStream.length} /Length1 ${program.length} /Filter /FlateDecode >>`, fontStream);
  const cmap = await input.deflate(encoder.encode(toUnicodeCMap(metrics)));
  writer.object(TO_UNICODE, `<< /Length ${cmap.length} /Filter /FlateDecode >>`, cmap);

  // Strukturbaum
  writer.object(STRUCT_ROOT, `<< /Type /StructTreeRoot /K ${DOCUMENT} 0 R /ParentTree ${PARENT_TREE} 0 R /ParentTreeNextKey ${pages.length} >>`);
  writer.object(DOCUMENT, `<< /Type /StructElem /S /Document /P ${STRUCT_ROOT} 0 R /K [${elementIds.map((id) => `${id} 0 R`).join(' ')}] >>`);
  elements.forEach((element, index) => {
    const kids = element.kids.map((kid) => `<< /Type /MCR /Pg ${pageIds[kid.page]} 0 R /MCID ${kid.mcid} >>`).join(' ');
    const extra =
      element.type === 'Figure'
        ? ` /Alt ${utf16Hex(element.alt ?? '')} /A << /O /Layout /Placement /Block /BBox [${element.bbox!.map((v) => v.toFixed(2)).join(' ')}] >>`
        : '';
    writer.object(
      elementIds[index]!,
      `<< /Type /StructElem /S /${element.type} /P ${DOCUMENT} 0 R /Pg ${pageIds[element.kids[0]!.page]} 0 R /K [${kids}]${extra} >>`,
    );
  });
  const nums = pages.map((page, index) => `${index} [${page.mcids.map((element) => `${elementIds[element]} 0 R`).join(' ')}]`).join(' ');
  writer.object(PARENT_TREE, `<< /Nums [${nums}] >>`);

  const metadata = encoder.encode(xmp(input.title, input.lang, date));
  writer.object(METADATA, `<< /Type /Metadata /Subtype /XML /Length ${metadata.length} >>`, metadata);

  // Lesezeichen (flach, in Lesereihenfolge)
  if (bookmarkIds.length > 0) {
    writer.object(OUTLINES, `<< /Type /Outlines /First ${bookmarkIds[0]} 0 R /Last ${bookmarkIds.at(-1)} 0 R /Count ${bookmarkIds.length} >>`);
  } else {
    writer.object(OUTLINES, '<< /Type /Outlines /Count 0 >>');
  }
  bookmarks.forEach((bookmark, index) => {
    const links = [
      index > 0 ? `/Prev ${bookmarkIds[index - 1]} 0 R` : '',
      index < bookmarks.length - 1 ? `/Next ${bookmarkIds[index + 1]} 0 R` : '',
    ].join(' ');
    writer.object(
      bookmarkIds[index]!,
      `<< /Title ${utf16Hex(bookmark.title)} /Parent ${OUTLINES} 0 R ${links} /Dest [${pageIds[bookmark.page]} 0 R /XYZ 0 ${bookmark.y.toFixed(2)} null] >>`,
    );
  });

  // Seiten
  for (const [index, page] of pages.entries()) {
    const footer = encodeText(`Seite ${index + 1} von ${pages.length}`, metrics).bytes;
    const footerX = (PAGE_WIDTH - widthOf(footer, 9, metrics)) / 2;
    const ops = [
      ...page.ops,
      // Seitenzahl ist Artefakt: Sie gehört nicht zum Inhalt und wird von Screenreadern übersprungen.
      `/Artifact <</Type /Pagination /Subtype /Footer>> BDC BT /F1 9 Tf 1 0 0 1 ${footerX.toFixed(2)} ${FOOTER_Y} Tm ${hex(footer)} Tj ET EMC`,
    ];
    const content = await input.deflate(encoder.encode(ops.join('\n')));
    writer.object(contentIds[index]!, `<< /Length ${content.length} /Filter /FlateDecode >>`, content);
    const xobjects = page.images.map((image, i) => `/${image.name} ${imageIds[index]![i]} 0 R`).join(' ');
    writer.object(
      pageIds[index]!,
      `<< /Type /Page /Parent ${PAGES} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${FONT} 0 R >>${xobjects ? ` /XObject << ${xobjects} >>` : ''} >> /Contents ${contentIds[index]} 0 R /StructParents ${index} /Tabs /S >>`,
    );
    page.images.forEach((image, i) => {
      const { info } = image;
      const colorSpace = info.components === 1 ? '/DeviceGray' : info.components === 4 ? '/DeviceCMYK /Decode [1 0 1 0 1 0 1 0]' : '/DeviceRGB';
      writer.object(
        imageIds[index]![i]!,
        `<< /Type /XObject /Subtype /Image /Width ${info.width} /Height ${info.height} /ColorSpace ${colorSpace} /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.jpeg.length} >>`,
        image.jpeg,
      );
    });
  }

  const id = hex(crypto.getRandomValues(new Uint8Array(16)));
  const xref = writer.position;
  const lines = ['xref', `0 ${next}`, '0000000000 65535 f '];
  for (let objectId = 1; objectId < next; objectId++) {
    lines.push(`${String(writer.offsets[objectId]).padStart(10, '0')} 00000 n `);
  }
  writer.write(`${lines.join('\n')}\ntrailer\n<< /Size ${next} /Root ${CATALOG} 0 R /Info ${INFO} 0 R /ID [${id} ${id}] >>\nstartxref\n${xref}\n%%EOF\n`);

  const count = (type: StructType) => elements.filter((element) => element.type === type).length;
  return {
    bytes: writer.bytes(),
    pageCount: pages.length,
    replacedCharacters: replaced,
    structure: { headings: count('H1') + count('H2'), paragraphs: count('P'), figures: count('Figure') },
  };
}
