/**
 * Liest aus einer TrueType-Datei, was ein PDF für eine eingebettete Schrift
 * braucht: Glyphen-Breiten passend zur WinAnsi-Kodierung und die Kennzahlen
 * für den Font-Descriptor. Unterstützt die Unicode-cmap (Plattform 3, Kodierung 1, Format 4).
 */
export interface FontMetrics {
  /** PostScript-Name, z. B. „LiberationSans“. */
  postScriptName: string;
  /** Breite je WinAnsi-Code 32–255 in 1/1000 em; `null`, wenn die Schrift das Zeichen nicht hat. */
  widths: (number | null)[];
  bbox: [number, number, number, number];
  ascent: number;
  descent: number;
  capHeight: number;
  italicAngle: number;
}

/** Unicode-Codepunkt je WinAnsi-Code 0x80–0x9F (übrige Codes entsprechen Latin-1). */
export const WIN_ANSI_HIGH: Record<number, number> = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6,
  0x89: 0x2030, 0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c,
  0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a,
  0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178,
};

/** Unicode für einen WinAnsi-Code, `null` für unbelegte Codes. */
export function winAnsiToUnicode(code: number): number | null {
  if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) {
    return code;
  }
  return WIN_ANSI_HIGH[code] ?? null;
}

export function parseTrueType(data: Uint8Array): FontMetrics {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const tables = new Map<string, number>();
  const count = view.getUint16(4);
  for (let i = 0; i < count; i++) {
    const record = 12 + i * 16;
    const tag = String.fromCharCode(...data.subarray(record, record + 4));
    tables.set(tag, view.getUint32(record + 8));
  }
  const table = (tag: string): number => {
    const offset = tables.get(tag);
    if (offset === undefined) {
      throw new Error(`TrueType-Tabelle ${tag} fehlt`);
    }
    return offset;
  };

  const head = table('head');
  const unitsPerEm = view.getUint16(head + 18);
  const scale = (value: number) => Math.round((value * 1000) / unitsPerEm);
  const bbox: FontMetrics['bbox'] = [
    scale(view.getInt16(head + 36)),
    scale(view.getInt16(head + 38)),
    scale(view.getInt16(head + 40)),
    scale(view.getInt16(head + 42)),
  ];

  const hhea = table('hhea');
  const numberOfHMetrics = view.getUint16(hhea + 34);
  const hmtx = table('hmtx');
  const advance = (glyph: number) => view.getUint16(hmtx + 4 * Math.min(glyph, numberOfHMetrics - 1));

  const os2 = table('OS/2');
  const ascent = scale(view.getInt16(os2 + 68));
  const descent = scale(view.getInt16(os2 + 70));
  const capHeight = view.getUint16(os2) >= 2 ? scale(view.getInt16(os2 + 88)) : ascent;

  const post = table('post');
  const italicAngle = view.getInt32(post + 4) / 65536;

  // cmap: Unicode-BMP-Teiltabelle suchen (3,1) im Format 4
  const cmap = table('cmap');
  let subtable = -1;
  for (let i = 0; i < view.getUint16(cmap + 2); i++) {
    const record = cmap + 4 + i * 8;
    if (view.getUint16(record) === 3 && view.getUint16(record + 2) === 1) {
      subtable = cmap + view.getUint32(record + 4);
    }
  }
  if (subtable < 0 || view.getUint16(subtable) !== 4) {
    throw new Error('Schrift ohne Unicode-cmap (3,1, Format 4)');
  }
  const segCount = view.getUint16(subtable + 6) / 2;
  const ends = subtable + 14;
  const starts = ends + 2 * segCount + 2;
  const deltas = starts + 2 * segCount;
  const rangeOffsets = deltas + 2 * segCount;
  const glyphFor = (code: number): number => {
    for (let s = 0; s < segCount; s++) {
      if (view.getUint16(ends + 2 * s) < code) {
        continue;
      }
      const start = view.getUint16(starts + 2 * s);
      if (start > code) {
        return 0;
      }
      const delta = view.getInt16(deltas + 2 * s);
      const rangeOffset = view.getUint16(rangeOffsets + 2 * s);
      if (rangeOffset === 0) {
        return (code + delta) & 0xffff;
      }
      const glyph = view.getUint16(rangeOffsets + 2 * s + rangeOffset + 2 * (code - start));
      return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
    }
    return 0;
  };

  const widths: (number | null)[] = [];
  for (let code = 32; code <= 255; code++) {
    const unicode = winAnsiToUnicode(code);
    const glyph = unicode === null ? 0 : glyphFor(unicode);
    widths.push(glyph === 0 ? null : scale(advance(glyph)));
  }

  // PostScript-Name aus der name-Tabelle (ID 6), Windows-Unicode
  let postScriptName = 'EmbeddedFont';
  const name = table('name');
  const storage = name + view.getUint16(name + 4);
  for (let i = 0; i < view.getUint16(name + 2); i++) {
    const record = name + 6 + i * 12;
    if (view.getUint16(record) === 3 && view.getUint16(record + 6) === 6) {
      const length = view.getUint16(record + 8);
      const offset = storage + view.getUint16(record + 10);
      let text = '';
      for (let j = 0; j < length; j += 2) {
        text += String.fromCharCode(view.getUint16(offset + j));
      }
      postScriptName = text.replace(/[^A-Za-z0-9-]/g, '');
      break;
    }
  }

  return { postScriptName, widths, bbox, ascent, descent, capHeight, italicAngle };
}
