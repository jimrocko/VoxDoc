import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { addPage, clearPages, flushPages, movePageInScan, removePage, scanPages } from '../src/scan/session.ts';
import { BACKUP_FORMAT, backupFileName, createBackup, restoreBackup } from '../src/storage/backup.ts';
import { createDocument, deleteAllDocuments, getDocument, listDocuments, updateDocument } from '../src/storage/documents.ts';
import { loadDraft } from '../src/storage/drafts.ts';
import { classifyStorageError, StorageError, storageErrorMessage } from '../src/storage/errors.ts';
import { getPosition, savePosition } from '../src/storage/positions.ts';

const jpeg = (content: string) => new Blob([content], { type: 'image/jpeg' });

describe('Sicherung', () => {
  it('stellt Dokumente mit Fotos, Text, OCR und Leseposition vollständig wieder her', async () => {
    await deleteAllDocuments();
    const doc = await createDocument({ title: 'Größe & Maß', pages: [jpeg('seite-1'), jpeg('seite-2 äöü')] });
    const ocr = { engine: 't', language: 'deu', recognizedAt: 5, pages: [{ text: 'Eins', confidence: 90, words: 1 }, { text: 'Zwei', confidence: 80, words: 1 }] };
    await updateDocument(doc.id, { text: 'Eins\nZwei', ocr });
    await savePosition({ docId: doc.id, paragraph: 1, offset: 2, finished: false }, 'Eins\nZwei');

    const { blob, count } = await createBackup();
    expect(count).toBe(1);
    expect(JSON.parse(await blob.text()).format).toBe(BACKUP_FORMAT);

    await deleteAllDocuments();
    expect(await listDocuments()).toEqual([]);
    expect(await restoreBackup(blob)).toEqual({ added: 1, skipped: 0 });

    const restored = (await getDocument(doc.id))!;
    expect(restored).toMatchObject({ title: 'Größe & Maß', text: 'Eins\nZwei', createdAt: doc.createdAt, ocr });
    expect(await Promise.all(restored.pages.map((p) => p.text()))).toEqual(['seite-1', 'seite-2 äöü']);
    expect(restored.pages[0]!.type).toBe('image/jpeg');
    expect(await getPosition(doc.id, 'Eins\nZwei')).toMatchObject({ paragraph: 1, offset: 2 });
  });

  it('überschreibt vorhandene Dokumente nicht', async () => {
    await deleteAllDocuments();
    const doc = await createDocument({ title: 'Original', pages: [] });
    const { blob } = await createBackup();
    await updateDocument(doc.id, { title: 'Geändert' });
    expect(await restoreBackup(blob)).toEqual({ added: 0, skipped: 1 });
    expect((await getDocument(doc.id))!.title).toBe('Geändert');
  });

  it('lehnt ungültige Dateien ab, ohne etwas zu schreiben', async () => {
    await deleteAllDocuments();
    const reject = (content: string) => restoreBackup(new Blob([content]));
    await expect(reject('kein json')).rejects.toMatchObject({ code: 'invalidBackup' });
    await expect(reject(JSON.stringify({ format: 'anders', version: 1, documents: [] }))).rejects.toMatchObject({ code: 'invalidBackup' });
    const broken = { format: BACKUP_FORMAT, version: 1, documents: [{ id: 'ok', title: 'A', text: '', createdAt: 1, updatedAt: 1, pages: [], ocr: null, position: null }, { id: 'kaputt', title: 5 }] };
    await expect(reject(JSON.stringify(broken))).rejects.toMatchObject({ code: 'invalidBackup' });
    expect(await listDocuments()).toEqual([]);
  });

  it('benennt die Datei mit Datum', () => {
    expect(backupFileName(new Date('2026-10-20T12:00:00Z'))).toBe('VoxDoc-Sicherung-2026-10-20.json');
  });
});

describe('Scan-Entwurf', () => {
  it('sichert jede Änderung und stellt sie wieder her', async () => {
    addPage(jpeg('a'));
    addPage(jpeg('b'));
    addPage(jpeg('c'));
    movePageInScan(2, 0);
    removePage(1);
    await flushPages();
    const draft = await loadDraft();
    expect(await Promise.all(draft!.pages.map((p) => p.blob.text()))).toEqual(['c', 'b']);
    expect(scanPages().map((p) => p.id)).toEqual(draft!.pages.map((p) => p.id));

    clearPages();
    await flushPages();
    expect(await loadDraft()).toBeNull();
  });

});

describe('Speicherfehler', () => {
  it('ordnet Fehler verständlichen Meldungen zu', () => {
    expect(classifyStorageError(new DOMException('voll', 'QuotaExceededError'))).toBe('quota');
    expect(classifyStorageError(new DOMException('x', 'InvalidStateError'))).toBe('unavailable');
    expect(classifyStorageError(new DOMException('x', 'VersionError'))).toBe('outdated');
    expect(classifyStorageError(new StorageError('blocked'))).toBe('blocked');
    expect(classifyStorageError(new Error('???'))).toBe('unknown');
    expect(storageErrorMessage(new DOMException('voll', 'QuotaExceededError'))).toContain('Speicher ist voll');
    expect(storageErrorMessage(new DOMException('voll', 'QuotaExceededError'))).toContain('Bereits gespeicherte Dokumente bleiben erhalten');
  });
});
