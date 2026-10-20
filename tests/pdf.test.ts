/// <reference types="node" />
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildPdf, encodeText, readJpegInfo, wrapText, type PdfBlock } from '../src/export/pdf.ts';
import { parseTrueType } from '../src/export/ttf.ts';

const jpeg = new Uint8Array(readFileSync(new URL('./fixtures/brief.jpg', import.meta.url)));
const program = new Uint8Array(readFileSync(new URL('../src/export/fonts/LiberationSans-Regular.ttf', import.meta.url)));
const font = { program, metrics: parseTrueType(program) };
const deflate = async (data: Uint8Array) => new Uint8Array(deflateSync(data));
const has = (tool: string): boolean => {
  try {
    execFileSync('which', [tool]);
    return true;
  } catch {
    return false;
  }
};
const latin1 = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1');

/** Alle Streams entpacken, damit sich der Inhalt prüfen lässt. */
function inflated(pdf: string): string {
  return pdf.replace(/\/FlateDecode([\s\S]*?)stream\n([\s\S]*?)\nendstream/g, (_, dict: string, data: string) => {
    try {
      return `/FlateDecode${dict}stream\n${inflateSync(Buffer.from(data, 'latin1')).toString('latin1')}\nendstream`;
    } catch {
      return `/FlateDecode${dict}stream\n[binär]\nendstream`;
    }
  });
}

const blocks: PdfBlock[] = [
  { kind: 'heading', level: 1, text: 'Stromrechnung „Oktober“' },
  { kind: 'paragraph', text: 'Gescannt am 20. Oktober 2026 · 2 Seiten', small: true },
  { kind: 'heading', level: 2, text: 'Seite 1' },
  { kind: 'paragraph', text: 'Stadtwerke Müllheim' },
  { kind: 'paragraph', text: 'Größere Änderungen – Übrigens: Die Straße wird gesperrt. 84,20 €' },
  ...Array.from({ length: 70 }, (_, i): PdfBlock => ({ kind: 'paragraph', text: `Absatz ${i + 1}: ein längerer Satz, damit der Text über mehrere Seiten umbrochen werden muss.` })),
  { kind: 'heading', level: 2, text: 'Fotos der Seiten' },
  { kind: 'paragraph', text: 'Foto von Seite 1', small: true },
  { kind: 'figure', jpeg, alt: 'Foto von Seite 1 des Dokuments „Stromrechnung“' },
];

describe('PDF-Bausteine', () => {
  it('liest die JPEG-Größe', () => {
    expect(readJpegInfo(jpeg)).toEqual({ width: 1240, height: 820, components: 3 });
  });

  it('kodiert Umlaute und Sonderzeichen für die eingebettete Schrift', () => {
    expect(encodeText('Größe „Ä“ – €', font.metrics).bytes).toEqual([0x47, 0x72, 0xf6, 0xdf, 0x65, 0x20, 0x84, 0xc4, 0x93, 0x20, 0x96, 0x20, 0x80]);
    expect(encodeText('Emoji 😀 und 中', font.metrics).replaced).toBe(2);
  });

  it('bricht mit den echten Schriftbreiten um', () => {
    expect(wrapText('Sehr geehrte Frau Schäfer, für den Zeitraum Oktober berechnen wir Ihnen insgesamt 84,20 Euro.', 150, 11, font.metrics).length).toBeGreaterThan(2);
  });
});

describe('getaggtes PDF', async () => {
  const result = await buildPdf({ title: 'Stromrechnung „Oktober“', lang: 'de-DE', blocks, font, deflate, createdAt: new Date('2026-10-20T10:00:00Z') });
  const raw = latin1(result.bytes);
  const pdf = inflated(raw);

  it('hat gültige Querverweise', () => {
    const xref = Number(/startxref\n(\d+)/.exec(raw)![1]);
    expect(raw.slice(xref, xref + 4)).toBe('xref');
    [...raw.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].forEach((m, index) =>
      expect(raw.slice(Number(m[1]), Number(m[1]) + 12)).toMatch(new RegExp(`^${index + 1} 0 obj`)),
    );
  });

  it('enthält Strukturbaum, Tags, Sprache, Metadaten und Lesezeichen', () => {
    expect(pdf).toContain('/MarkInfo << /Marked true >>');
    expect(pdf).toContain('/Type /StructTreeRoot');
    expect(pdf).toContain('/Lang (de-DE)');
    expect(pdf).toContain('/DisplayDocTitle true');
    expect(pdf).toMatch(/\/Type \/Metadata \/Subtype \/XML/);
    expect(Buffer.from(result.bytes).toString('utf8')).toContain('<dc:title><rdf:Alt><rdf:li xml:lang="x-default">Stromrechnung „Oktober“</rdf:li>');
    expect(pdf).not.toContain('pdfuaid'); // keine PDF/UA-Kennung ohne vollständige Prüfung
    expect(pdf.match(/\/S \/H1 /g)).toHaveLength(1);
    expect(pdf.match(/\/S \/H2 /g)).toHaveLength(2);
    expect(pdf.match(/\/S \/Figure /g)).toHaveLength(1);
    expect(pdf).toMatch(/\/S \/Figure [^]*?\/Alt <feff/);
    expect(pdf).toContain('/Type /Outlines');
    expect(result.structure).toEqual({ headings: 3, paragraphs: 74, figures: 1 });
  });

  it('markiert jeden Inhalt oder kennzeichnet ihn als Artefakt', () => {
    const contents = [...pdf.matchAll(/stream\n([^]*?)\nendstream/g)].map((m) => m[1]!).filter((s) => s.includes(' Tf ') || s.includes(' Do '));
    expect(contents.length).toBe(result.pageCount);
    for (const content of contents) {
      for (const line of content.split('\n')) {
        expect(line).toMatch(/^\/(H1|H2|P|Figure) <<\/MCID \d+>> BDC .* EMC$|^\/Artifact <<\/Type \/Pagination \/Subtype \/Footer>> BDC .* EMC$/);
      }
    }
  });

  it('bettet die Schrift mit ToUnicode-Tabelle ein', () => {
    expect(pdf).toContain('/Subtype /TrueType /BaseFont /LiberationSans');
    expect(pdf).toMatch(/\/FontFile2 \d+ 0 R/);
    expect(pdf).toMatch(/\/Length1 410820/);
    expect(pdf).toContain('/ToUnicode');
    expect(pdf).toContain('<e4> <00e4>');
  });

  it('wird von pdfinfo als getaggt erkannt und liefert den Text in Lesereihenfolge', { skip: !has('pdftotext') }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'voxdoc-pdf-'));
    const file = join(dir, 'test.pdf');
    writeFileSync(file, result.bytes);
    const info = execFileSync('pdfinfo', [file]).toString();
    expect(info).toMatch(/Tagged:\s+yes/);
    expect(Number(/Pages:\s+(\d+)/.exec(info)![1])).toBe(result.pageCount);
    expect(info).toContain('Stromrechnung „Oktober“');
    const fonts = execFileSync('pdffonts', [file]).toString();
    expect(fonts).toMatch(/LiberationSans\s+TrueType\s+WinAnsi\s+yes\s+no\s+yes/);
    const text = execFileSync('pdftotext', ['-enc', 'UTF-8', file, '-']).toString();
    const order = ['Stromrechnung „Oktober“', 'Seite 1', 'Stadtwerke Müllheim', 'Größere Änderungen – Übrigens: Die Straße wird gesperrt. 84,20 €', 'Absatz 70', 'Fotos der Seiten'];
    let last = -1;
    for (const part of order) {
      const index = text.indexOf(part);
      expect(index, part).toBeGreaterThan(last);
      last = index;
    }
    expect(text).not.toMatch(/Seite \d+ von \d+[^]*Stadtwerke/); // Seitenzahl ist kein Inhalt vor dem Text
  });

  it('erzeugt auch ein PDF nur mit Text', async () => {
    const small = await buildPdf({ title: 'Nur Text', lang: 'de-DE', blocks: [{ kind: 'heading', level: 1, text: 'Nur Text' }], font, deflate });
    expect(small.pageCount).toBe(1);
    await expect(buildPdf({ title: 'Leer', lang: 'de-DE', blocks: [], font, deflate })).rejects.toThrow();
  });
});

/**
 * veraPDF prüft die maschinell prüfbaren PDF/UA-1-Regeln. Ausführen mit
 * VERAPDF=/pfad/zu/verapdf npm test. Erwartet: alles bestanden außer der
 * absichtlich fehlenden PDF/UA-Kennung (Regel 5-1).
 */
describe('veraPDF (PDF/UA-1)', { skip: !process.env.VERAPDF }, () => {
  it('besteht alle maschinellen Prüfungen außer der fehlenden PDF/UA-Kennung', async () => {
    const result = await buildPdf({ title: 'Prüfdokument', lang: 'de-DE', blocks, font, deflate });
    const dir = mkdtempSync(join(tmpdir(), 'voxdoc-verapdf-'));
    const file = join(dir, 'test.pdf');
    writeFileSync(file, result.bytes);
    let report = '';
    try {
      report = execFileSync(process.env.VERAPDF!, ['--flavour', 'ua1', '--format', 'mrr', file], { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    } catch (error) {
      // veraPDF beendet sich bei Befunden mit Code ≠ 0; der Bericht steht trotzdem in stdout.
      report = (error as { stdout: Buffer }).stdout.toString();
    }
    const failed = [...report.matchAll(/<rule [^>]*clause="([^"]+)"[^>]*testNumber="(\d+)"[^>]*status="failed"/g)].map((m) => `${m[1]}-${m[2]}`);
    expect(failed).toEqual(['5-1']);
  }, 120_000);
});
