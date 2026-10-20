/// <reference types="node" />
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildPdf, encodeWinAnsi, readJpegInfo, wrapText } from '../src/export/pdf.ts';

const jpeg = new Uint8Array(readFileSync(new URL('./fixtures/brief.jpg', import.meta.url)));
const has = (tool: string): boolean => {
  try {
    execFileSync('which', [tool]);
    return true;
  } catch {
    return false;
  }
};
const latin1 = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1');

describe('PDF-Bausteine', () => {
  it('liest die JPEG-Größe', () => {
    expect(readJpegInfo(jpeg)).toEqual({ width: 1240, height: 820, components: 3 });
    expect(() => readJpegInfo(new Uint8Array([1, 2, 3]))).toThrow();
  });

  it('kodiert Umlaute, ß und typografische Zeichen in WinAnsi', () => {
    expect(encodeWinAnsi('Größe „Äpfel“ – 5 €').bytes).toEqual([
      0x47, 0x72, 0xf6, 0xdf, 0x65, 0x20, 0x84, 0xc4, 0x70, 0x66, 0x65, 0x6c, 0x93, 0x20, 0x96, 0x20, 0x35, 0x20, 0x80,
    ]);
    expect(encodeWinAnsi('Emoji 😀').replaced).toBe(1);
  });

  it('bricht Text innerhalb der Breite um', () => {
    const lines = wrapText('Sehr geehrte Frau Schäfer, für den Zeitraum Oktober berechnen wir Ihnen insgesamt 84,20 Euro.', 150);
    expect(lines.length).toBeGreaterThan(2);
    expect(wrapText('x'.repeat(200), 100).length).toBeGreaterThan(1);
  });
});

describe('buildPdf', () => {
  const paragraphs = ['Stadtwerke Müllheim', 'Sehr geehrte Frau Schäfer,', 'Größere Änderungen – Übrigens: Die Straße wird gesperrt.', ...Array.from({ length: 60 }, (_, i) => `Absatz ${i + 1}: ein längerer Satz, damit der Text auf mehrere Seiten verteilt werden muss.`)];
  const result = buildPdf({ title: 'Stromrechnung „Oktober“', images: [{ jpeg }, { jpeg }], paragraphs, textNote: 'Per Texterkennung erstellt.', createdAt: new Date('2026-10-20T10:00:00Z') });
  const text = latin1(result.bytes);

  it('hat gültige Querverweise auf alle Objekte', () => {
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    const xref = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(xref, xref + 4)).toBe('xref');
    const entries = [...text.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    entries.forEach((offset, index) => expect(text.slice(offset, offset + 12)).toMatch(new RegExp(`^${index + 1} 0 obj`)));
    expect(result.pageCount).toBeGreaterThanOrEqual(4); // 2 Fotos + mindestens 2 Textseiten
    expect(text).toContain(`/Count ${result.pageCount}`);
    expect(text).toContain('/Lang (de-DE)');
    expect(result.replacedCharacters).toBe(0);
  });

  it('lässt sich mit einem echten PDF-Leser lesen (Text mit Umlauten)', { skip: !has('pdftotext') }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'voxdoc-pdf-'));
    const file = join(dir, 'test.pdf');
    writeFileSync(file, result.bytes);
    const info = execFileSync('pdfinfo', [file]).toString();
    expect(info).toMatch(/Pages:\s+(\d+)/);
    expect(Number(/Pages:\s+(\d+)/.exec(info)![1])).toBe(result.pageCount);
    expect(info).toContain('Stromrechnung „Oktober“');
    const extracted = execFileSync('pdftotext', ['-enc', 'UTF-8', file, '-']).toString();
    for (const word of ['Stadtwerke Müllheim', 'Schäfer', 'Größere Änderungen', 'Übrigens', 'Straße', 'Absatz 60']) {
      expect(extracted).toContain(word);
    }
  });

  it('erzeugt ein PDF nur mit Fotos oder nur mit Text', () => {
    expect(buildPdf({ title: 'Nur Foto', images: [{ jpeg }], paragraphs: [] }).pageCount).toBe(1);
    expect(buildPdf({ title: 'Nur Text', images: [], paragraphs: ['Hallo'] }).pageCount).toBe(1);
    expect(() => buildPdf({ title: 'Leer', images: [], paragraphs: [] })).toThrow();
  });
});
