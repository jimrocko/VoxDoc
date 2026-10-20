import { STORES, transact } from './db.ts';

/** Laufender Scan, damit aufgenommene Seiten einen Neustart der App überstehen. */
export interface ScanDraft {
  id: 'current';
  pages: { id: string; blob: Blob }[];
  updatedAt: number;
}

const drafts = (transaction: IDBTransaction): IDBObjectStore => transaction.objectStore(STORES.drafts);

export async function loadDraft(): Promise<ScanDraft | null> {
  return (await transact(STORES.drafts, 'readonly', (t) => drafts(t).get('current') as IDBRequest<ScanDraft | undefined>)) ?? null;
}

export async function saveDraft(pages: ScanDraft['pages']): Promise<void> {
  await transact(STORES.drafts, 'readwrite', (t) => {
    if (pages.length === 0) {
      drafts(t).delete('current');
    } else {
      drafts(t).put({ id: 'current', pages, updatedAt: Date.now() } satisfies ScanDraft);
    }
  });
}
