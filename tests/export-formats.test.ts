import { describe, expect, it } from 'vitest';
import { toHtml, toPdfBlocks, toText } from '../src/export/formats.ts';
import { buildExportModel, exportFileName, OCR_NOTE } from '../src/export/model.ts';
import { textFromOcr } from '../src/ocr/format.ts';
import type { VoxDocument } from '../src/storage/documents.ts';

const ocrPage = (text: string) => ({ text, confidence: 90, words: text.split(/\s+/).filter(Boolean).length });
function makeDoc(pages: string[], edited?: string): VoxDocument {
  const ocr = { engine: 't', language: 'deu', recognizedAt: 0, pages: pages.map(ocrPage) };
  return {
    id: 'd',
    title: 'Brief <Müller> & „Söhne“',
    pages: pages.map(() => new Blob(['x'], { type: 'image/jpeg' })),
    ocr,
    text: edited ?? textFromOcr(ocr),
    createdAt: Date.UTC(2026, 9, 20, 12, 30),
    updatedAt: 0,
  };
}

describe('Exportmodell', () => {
  it('gliedert unveränderten OCR-Text nach Seiten', () => {
    const model = buildExportModel(makeDoc(['Sehr geehrte\nFrau Schäfer,\n\nGrüße', '', 'Seite drei']), true);
    expect(model.sections.map((s) => [s.heading, s.paragraphs, s.note])).toEqual([
      ['Seite 1', ['Sehr geehrte Frau Schäfer,', 'Grüße'], undefined],
      ['Seite 2', [], 'Auf dieser Seite wurde kein Text erkannt.'],
      ['Seite 3', ['Seite drei'], undefined],
    ]);
    expect(model.ocrNote).toBe(OCR_NOTE);
    expect(model.details).toMatch(/^Gescannt am 20\. Oktober 2026 um \d\d:30 Uhr · 3 Seiten$/);
    expect(model.photos.map((p) => p.caption)).toEqual(['Foto von Seite 1 von 3', 'Foto von Seite 2 von 3', 'Foto von Seite 3 von 3']);
    expect(model.photos[0]!.alt).toContain('Der Text dieser Seite steht oben im Abschnitt „Seite 1“');
  });

  it('nutzt bei bearbeitetem Text einen Abschnitt „Text“ ohne OCR-Hinweis', () => {
    const model = buildExportModel(makeDoc(['A', 'B'], 'Eigener Text\nZweiter Absatz'), false);
    expect(model.sections).toEqual([{ heading: 'Text', paragraphs: ['Eigener Text', 'Zweiter Absatz'] }]);
    expect(model.ocrNote).toBeNull();
    expect(model.photos).toEqual([]);
  });

  it('meldet ehrlich, wenn es keinen Text gibt', () => {
    const doc = { ...makeDoc(['']), ocr: null, text: '' };
    expect(buildExportModel(doc, false).sections[0]).toEqual({ heading: 'Text', paragraphs: [], note: 'Dieses Dokument enthält noch keinen Text.' });
  });

  it('bildet gültige Dateinamen', () => {
    expect(exportFileName('Brief: a/b', 'pdf')).toBe('Brief- a-b.pdf');
    expect(exportFileName('  ', 'txt')).toBe('Dokument.txt');
  });
});

describe('TXT', () => {
  it('hat Überschriften, Absätze und UTF-8-BOM', () => {
    const text = toText(buildExportModel(makeDoc(['Größe\n\nStraße', 'Ende']), false));
    expect(text.startsWith('﻿Brief <Müller> & „Söhne“\n========================')).toBe(true);
    expect(text).toContain('\n\nSeite 1\n-------\n\nGröße\n\nStraße\n\nSeite 2\n-------\n\nEnde\n');
    expect(text).toContain(`Hinweis: ${OCR_NOTE}`);
  });
});

describe('HTML', () => {
  const model = buildExportModel(makeDoc(['Größe\n\nStraße', 'Ende']), true);
  const html = toHtml(model, model.photos.map((p) => ({ src: 'data:image/jpeg;base64,AAAA', alt: p.alt, caption: p.caption })));

  it('ist ein eigenständiges, semantisches Dokument', () => {
    expect(html).toMatch(/^<!doctype html>\n<html lang="de">/);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('<title>Brief &lt;Müller&gt; &amp; „Söhne“</title>');
    expect(html.match(/<h1>/g)).toHaveLength(1);
    expect(html.match(/<main>/g)).toHaveLength(1);
    expect(html.match(/<section aria-labelledby="[^"]+">\n\s+<h2 id=/g)).toHaveLength(3);
    expect(html).toContain('<p>Größe</p>');
    expect(html.match(/<figure>/g)).toHaveLength(2);
    expect(html).toContain('<figcaption>Foto von Seite 2 von 2</figcaption>');
    expect(html).not.toContain('<Müller>');
  });

  it('hält die Lesereihenfolge: Titel, Angaben, Seiten, Fotos', () => {
    const positions = ['<h1>', 'class="angaben"', '>Seite 1</h2>', '>Seite 2</h2>', '>Fotos der Seiten</h2>'].map((part) => html.indexOf(part));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(positions.every((p) => p >= 0)).toBe(true);
  });
});

describe('PDF-Blöcke', () => {
  it('folgen derselben Reihenfolge wie TXT und HTML', () => {
    const model = buildExportModel(makeDoc(['Eins', 'Zwei']), true);
    const blocks = toPdfBlocks(model, [new Uint8Array([1]), new Uint8Array([2])]);
    expect(blocks.map((b) => (b.kind === 'figure' ? `Figure:${b.alt.slice(0, 15)}` : `${b.kind === 'heading' ? `H${b.level}` : 'P'}:${b.text.slice(0, 12)}`))).toEqual([
      'H1:Brief <Mülle',
      'P:Gescannt am ',
      `P:${OCR_NOTE.slice(0, 12)}`,
      'H2:Seite 1',
      'P:Eins',
      'H2:Seite 2',
      'P:Zwei',
      'H2:Fotos der Se',
      'P:Foto von Sei',
      'Figure:Foto von Seite ',
      'P:Foto von Sei',
      'Figure:Foto von Seite ',
    ]);
  });
});
