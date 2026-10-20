import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  createDocument,
  deleteAllDocuments,
  deleteDocument,
  getDocument,
  listDocuments,
  updateDocument,
} from '../src/storage/documents.ts';

describe('Dokumentspeicher', () => {
  it('legt an, ändert, listet und löscht Dokumente', async () => {
    const first = await createDocument({ title: 'Erstes', image: null });
    await new Promise((resolve) => setTimeout(resolve, 2));
    const second = await createDocument({ title: 'Zweites', image: null });

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
    await expect(updateDocument('fehlt', { title: 'x' })).rejects.toThrow('Dokument nicht gefunden');
  });
});
