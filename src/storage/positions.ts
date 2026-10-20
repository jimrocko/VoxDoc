import { STORES, transact } from './db.ts';

/** Wo im Text zuletzt vorgelesen wurde – getrennt gespeichert, damit nicht jedes Mal die Fotos neu geschrieben werden. */
export interface ReadingPosition {
  docId: string;
  /** Absatz, ab 0. */
  paragraph: number;
  /** Zeichenposition im Absatz. */
  offset: number;
  /** Bis zum Ende vorgelesen. */
  finished: boolean;
  /** Prüfsumme des Texts – passt sie nicht mehr, ist die Position ungültig. */
  textHash: string;
  updatedAt: number;
}

/** FNV-1a (32 Bit): schnell und ausreichend, um Textänderungen zu erkennen. */
export function hashText(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

const positions = (transaction: IDBTransaction): IDBObjectStore => transaction.objectStore(STORES.positions);

export async function getPosition(docId: string, text: string): Promise<ReadingPosition | null> {
  const stored = await transact(STORES.positions, 'readonly', (t) => positions(t).get(docId) as IDBRequest<ReadingPosition | undefined>);
  return stored && stored.textHash === hashText(text) ? stored : null;
}

export async function listPositions(): Promise<Map<string, ReadingPosition>> {
  const all = await transact(STORES.positions, 'readonly', (t) => positions(t).getAll() as IDBRequest<ReadingPosition[]>);
  return new Map(all.map((position) => [position.docId, position]));
}

export async function savePosition(position: Omit<ReadingPosition, 'textHash' | 'updatedAt'>, text: string): Promise<void> {
  const record: ReadingPosition = { ...position, textHash: hashText(text), updatedAt: Date.now() };
  await transact(STORES.positions, 'readwrite', (t) => positions(t).put(record));
}

export async function clearPosition(docId: string): Promise<void> {
  await transact(STORES.positions, 'readwrite', (t) => positions(t).delete(docId));
}
