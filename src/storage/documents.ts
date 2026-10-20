import { textFromOcr } from '../ocr/format.ts';
import { STORES, transact } from './db.ts';
import { StorageError } from './errors.ts';

/** Ergebnis der Texterkennung für eine Seite – unverändert, wie die OCR es geliefert hat. */
export interface OcrPageResult {
  text: string;
  /** Mittlere Wort-Konfidenz der OCR, 0–100. */
  confidence: number;
  words: number;
}

export interface OcrResult {
  engine: string;
  language: string;
  recognizedAt: number;
  pages: OcrPageResult[];
}

/** Dokumente bleiben auf dem Gerät – gespeichert in IndexedDB. */
export interface VoxDocument {
  id: string;
  title: string;
  /**
   * Text zum Lesen, Vorlesen und Suchen. Wird aus der Texterkennung befüllt
   * und kann bearbeitet werden; das Rohergebnis bleibt in `ocr` erhalten.
   */
  text: string;
  /** Originalfotos der Seiten in Lesereihenfolge – werden nie verändert. */
  pages: Blob[];
  ocr: OcrResult | null;
  createdAt: number;
  updatedAt: number;
}

type StoredDocument = Omit<VoxDocument, 'pages' | 'ocr'> & { pages?: Blob[]; image?: Blob | null; ocr?: OcrResult | null };

/** Bringt auch Datensätze im alten Format in die aktuelle Form. */
function normalize(stored: StoredDocument): VoxDocument {
  const { image, pages, ocr, ...rest } = stored;
  return { ...rest, pages: pages ?? (image ? [image] : []), ocr: ocr ?? null };
}

const documents = (transaction: IDBTransaction): IDBObjectStore => transaction.objectStore(STORES.documents);

/** Alle Dokumente, neueste zuerst. */
export async function listDocuments(): Promise<VoxDocument[]> {
  const stored = await transact(STORES.documents, 'readonly', (t) => documents(t).getAll() as IDBRequest<StoredDocument[]>);
  return stored.map(normalize).sort((a, b) => b.createdAt - a.createdAt);
}

export async function getDocument(id: string): Promise<VoxDocument | undefined> {
  const stored = await transact(STORES.documents, 'readonly', (t) => documents(t).get(id) as IDBRequest<StoredDocument | undefined>);
  return stored && normalize(stored);
}

export async function createDocument(fields: Pick<VoxDocument, 'title' | 'pages'>): Promise<VoxDocument> {
  const now = Date.now();
  const doc: VoxDocument = { id: crypto.randomUUID(), text: '', ocr: null, createdAt: now, updatedAt: now, ...fields };
  await transact(STORES.documents, 'readwrite', (t) => documents(t).add(doc));
  return doc;
}

async function requireDocument(id: string): Promise<VoxDocument> {
  const current = await getDocument(id);
  if (!current) {
    throw new StorageError('notFound');
  }
  return current;
}

export async function updateDocument(
  id: string,
  changes: Partial<Pick<VoxDocument, 'title' | 'text' | 'ocr'>>,
): Promise<VoxDocument> {
  const doc = { ...(await requireDocument(id)), ...changes, updatedAt: Date.now() };
  // Ändert sich der Text, passt die gespeicherte Leseposition nicht mehr.
  const textChanged = changes.text !== undefined;
  await transact([STORES.documents, STORES.positions], 'readwrite', (t) => {
    documents(t).put(doc);
    if (textChanged) {
      t.objectStore(STORES.positions).delete(id);
    }
  });
  return doc;
}

/**
 * Verschiebt eine Seite. Fotos und OCR-Ergebnisse wandern gemeinsam; der
 * Lesetext wird nur neu zusammengesetzt, wenn er nicht selbst bearbeitet wurde.
 */
export async function movePage(
  id: string,
  from: number,
  to: number,
): Promise<{ doc: VoxDocument; textReordered: boolean }> {
  const current = await requireDocument(id);
  if (from === to || from < 0 || to < 0 || from >= current.pages.length || to >= current.pages.length) {
    return { doc: current, textReordered: false };
  }
  const move = <T>(items: readonly T[]): T[] => {
    const copy = [...items];
    const [item] = copy.splice(from, 1);
    copy.splice(to, 0, item!);
    return copy;
  };
  const ocrMatches = current.ocr !== null && current.ocr.pages.length === current.pages.length;
  const ocr = ocrMatches ? { ...current.ocr!, pages: move(current.ocr!.pages) } : current.ocr;
  const untouched = ocrMatches && current.text === textFromOcr(current.ocr!);
  const doc: VoxDocument = {
    ...current,
    pages: move(current.pages),
    ocr,
    text: untouched ? textFromOcr(ocr!) : current.text,
    updatedAt: Date.now(),
  };
  const textReordered = untouched && doc.text !== current.text;
  await transact([STORES.documents, STORES.positions], 'readwrite', (t) => {
    documents(t).put(doc);
    if (textReordered) {
      t.objectStore(STORES.positions).delete(id);
    }
  });
  return { doc, textReordered };
}

/** Löscht das Dokument samt Leseposition in einer Transaktion. */
export async function deleteDocument(id: string): Promise<void> {
  await transact([STORES.documents, STORES.positions], 'readwrite', (t) => {
    documents(t).delete(id);
    t.objectStore(STORES.positions).delete(id);
  });
}

export async function deleteAllDocuments(): Promise<void> {
  await transact([STORES.documents, STORES.positions], 'readwrite', (t) => {
    documents(t).clear();
    t.objectStore(STORES.positions).clear();
  });
}

/** Bittet den Browser, die Daten nicht automatisch zu löschen (iOS 17+). */
export async function requestPersistentStorage(): Promise<void> {
  try {
    if (navigator.storage?.persisted && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {
    // Nicht unterstützt – die Daten bleiben trotzdem gespeichert.
  }
}
