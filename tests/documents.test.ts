import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { textFromOcr } from '../src/ocr/format.ts';
import {
  createDocument,
  movePage,
  deleteAllDocuments,
  deleteDocument,
  getDocument,
  listDocuments,
  updateDocument,
} from '../src/storage/documents.ts';
import { getPosition, hashText, listPositions, savePosition } from '../src/storage/positions.ts';

const blob = (name: string) => new Blob([name], { type: 'image/jpeg' });
const ocrPage = (text: string) => ({ text, confidence: 90, words: text.split(' ').length });

describe('Dokumentspeicher', () => {
  it('legt an, ändert, listet und löscht Dokumente', async () => {
    const first = await createDocument({ title: 'Erstes', pages: [] });
    await new Promise((resolve) => setTimeout(resolve, 2));
    const second = await createDocument({ title: 'Zweites', pages: [] });

    expect((await listDocuments()).map((doc) => doc.id)).toEqual([second.id, first.id]);

    const updated = await updateDocument(first.id, { text: 'Hallo Welt' });
    expect(updated.text).toBe('Hallo Welt');
    expect((await getDocument(first.id))?.text).toBe('Hallo Welt');

    await deleteDocument(first.id);
    expect(await getDocument(first.id)).toBeUndefined();

    await deleteAllDocuments();
    expect(await listDocuments()).toEqual([]);
  });

  it('meldet Änderungen an fehlenden Dokumenten', async () => {
    await expect(updateDocument('fehlt', { title: 'x' })).rejects.toMatchObject({ name: 'StorageError', code: 'notFound' });
  });
});

describe('Leseposition', () => {
  it('speichert und liest die Position, solange der Text gleich ist', async () => {
    const doc = await createDocument({ title: 'Brief', pages: [] });
    await updateDocument(doc.id, { text: 'Eins.\nZwei.' });
    await savePosition({ docId: doc.id, paragraph: 1, offset: 3, finished: false }, 'Eins.\nZwei.');
    expect(await getPosition(doc.id, 'Eins.\nZwei.')).toMatchObject({ paragraph: 1, offset: 3, finished: false });
    // Anderer Text → Position ungültig
    expect(await getPosition(doc.id, 'Anderer Text')).toBeNull();
    expect((await listPositions()).get(doc.id)?.paragraph).toBe(1);
  });

  it('wird beim Ändern des Texts und beim Löschen entfernt', async () => {
    const doc = await createDocument({ title: 'Brief', pages: [] });
    await savePosition({ docId: doc.id, paragraph: 0, offset: 5, finished: false }, '');
    await updateDocument(doc.id, { title: 'Neuer Name' });
    expect(await getPosition(doc.id, '')).not.toBeNull();
    await updateDocument(doc.id, { text: 'Neu' });
    expect((await listPositions()).has(doc.id)).toBe(false);

    await savePosition({ docId: doc.id, paragraph: 0, offset: 1, finished: false }, 'Neu');
    await deleteDocument(doc.id);
    expect((await listPositions()).has(doc.id)).toBe(false);
  });

  it('hashText unterscheidet Texte', () => {
    expect(hashText('Größe')).toBe(hashText('Größe'));
    expect(hashText('Größe')).not.toBe(hashText('Grösse'));
  });
});

describe('Seitenreihenfolge', () => {
  it('verschiebt Fotos, OCR-Ergebnisse und unveränderten Text gemeinsam', async () => {
    const pages = [blob('a'), blob('b'), blob('c')];
    const doc = await createDocument({ title: 'Drei', pages });
    const ocr = { engine: 't', language: 'deu', recognizedAt: 0, pages: [ocrPage('Seite A'), ocrPage('Seite B'), ocrPage('Seite C')] };
    await updateDocument(doc.id, { ocr, text: textFromOcr(ocr) });
    await savePosition({ docId: doc.id, paragraph: 2, offset: 0, finished: false }, textFromOcr(ocr));

    const { doc: moved, textReordered } = await movePage(doc.id, 2, 0);
    expect(textReordered).toBe(true);
    expect(await Promise.all(moved.pages.map((p) => p.text()))).toEqual(['c', 'a', 'b']);
    expect(moved.ocr!.pages.map((p) => p.text)).toEqual(['Seite C', 'Seite A', 'Seite B']);
    expect(moved.text).toBe('Seite C\nSeite A\nSeite B');
    expect((await getDocument(doc.id))!.text).toBe('Seite C\nSeite A\nSeite B');
    expect((await listPositions()).has(doc.id)).toBe(false);
  });

  it('lässt selbst bearbeiteten Text unverändert', async () => {
    const doc = await createDocument({ title: 'Zwei', pages: [blob('a'), blob('b')] });
    const ocr = { engine: 't', language: 'deu', recognizedAt: 0, pages: [ocrPage('A'), ocrPage('B')] };
    await updateDocument(doc.id, { ocr, text: 'Eigener Text' });
    const { doc: moved, textReordered } = await movePage(doc.id, 0, 1);
    expect(textReordered).toBe(false);
    expect(moved.text).toBe('Eigener Text');
    expect(moved.ocr!.pages.map((p) => p.text)).toEqual(['B', 'A']);
  });

  it('ignoriert ungültige Verschiebungen', async () => {
    const doc = await createDocument({ title: 'Eins', pages: [blob('a')] });
    expect((await movePage(doc.id, 0, 1)).doc.pages).toHaveLength(1);
    expect((await movePage(doc.id, 0, -1)).textReordered).toBe(false);
  });
});
