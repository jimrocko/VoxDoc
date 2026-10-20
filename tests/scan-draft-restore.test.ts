import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { restorePages, scanPages } from '../src/scan/session.ts';
import { saveDraft } from '../src/storage/drafts.ts';

describe('Scan-Entwurf nach Neustart', () => {
  it('stellt die gesicherten Seiten einmalig wieder her', async () => {
    // Stand vor dem Neustart: zwei Seiten in der Datenbank, Liste im Speicher leer.
    await saveDraft([
      { id: 'a', blob: new Blob(['eins']) },
      { id: 'b', blob: new Blob(['zwei']) },
    ]);
    expect(scanPages()).toEqual([]);
    expect(await restorePages()).toBe(2);
    expect(scanPages().map((page) => page.id)).toEqual(['a', 'b']);
    expect(await restorePages()).toBe(0);
  });
});
