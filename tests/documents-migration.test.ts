import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { getDocument, listDocuments } from '../src/storage/documents.ts';

/** Legt eine Datenbank im Format von Version 1 an (ein Foto pro Dokument). */
function createVersion1(records: object[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('voxdoc', 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('documents', { keyPath: 'id' });
      for (const record of records) {
        store.add(record);
      }
    };
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

describe('Migration von Version 1', () => {
  it('übernimmt das einzelne Foto als erste Seite', async () => {
    const photo = new Blob(['jpeg'], { type: 'image/jpeg' });
    await createVersion1([
      { id: 'a', title: 'Mit Foto', text: '', image: photo, createdAt: 2, updatedAt: 2 },
      { id: 'b', title: 'Ohne Foto', text: 'Text', image: null, createdAt: 1, updatedAt: 1 },
    ]);

    const documents = await listDocuments();
    expect(documents.map((doc) => [doc.id, doc.pages.length])).toEqual([
      ['a', 1],
      ['b', 0],
    ]);
    const migrated = await getDocument('a');
    expect(migrated).not.toHaveProperty('image');
    expect(await migrated!.pages[0]!.text()).toBe('jpeg');
  });
});
