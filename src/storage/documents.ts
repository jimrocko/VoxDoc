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

const DB_NAME = 'voxdoc';
const DB_VERSION = 2;
const STORE = 'documents';

type StoredDocument = Omit<VoxDocument, 'pages' | 'ocr'> & { pages?: Blob[]; image?: Blob | null; ocr?: OcrResult | null };

/** Bringt auch Datensätze im alten Format in die aktuelle Form. */
function normalize(stored: StoredDocument): VoxDocument {
  const { image, pages, ocr, ...rest } = stored;
  return { ...rest, pages: pages ?? (image ? [image] : []), ocr: ocr ?? null };
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      if (event.oldVersion < 1) {
        request.result.createObjectStore(STORE, { keyPath: 'id' });
        return;
      }
      if (event.oldVersion < 2) {
        // Version 1 kannte nur ein Foto pro Dokument (`image`).
        const store = request.transaction!.objectStore(STORE);
        store.openCursor().onsuccess = (cursorEvent) => {
          const cursor = (cursorEvent.target as IDBRequest<IDBCursorWithValue | null>).result;
          if (cursor) {
            cursor.update(normalize(cursor.value));
            cursor.continue();
          }
        };
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error ?? new Error('Datenbank konnte nicht geöffnet werden'));
    };
  });
  return dbPromise;
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = action(transaction.objectStore(STORE));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error ?? new Error('Speichern fehlgeschlagen'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Speichern abgebrochen'));
  });
}

/** Alle Dokumente, neueste zuerst. */
export async function listDocuments(): Promise<VoxDocument[]> {
  const stored = await run('readonly', (store) => store.getAll() as IDBRequest<StoredDocument[]>);
  return stored.map(normalize).sort((a, b) => b.createdAt - a.createdAt);
}

export async function getDocument(id: string): Promise<VoxDocument | undefined> {
  const stored = await run('readonly', (store) => store.get(id) as IDBRequest<StoredDocument | undefined>);
  return stored && normalize(stored);
}

export async function createDocument(fields: Pick<VoxDocument, 'title' | 'pages'>): Promise<VoxDocument> {
  const now = Date.now();
  const doc: VoxDocument = { id: crypto.randomUUID(), text: '', ocr: null, createdAt: now, updatedAt: now, ...fields };
  await run('readwrite', (store) => store.add(doc));
  return doc;
}

export async function updateDocument(
  id: string,
  changes: Partial<Pick<VoxDocument, 'title' | 'text' | 'ocr'>>,
): Promise<VoxDocument> {
  const current = await getDocument(id);
  if (!current) {
    throw new Error('Dokument nicht gefunden');
  }
  const doc = { ...current, ...changes, updatedAt: Date.now() };
  await run('readwrite', (store) => store.put(doc));
  return doc;
}

export async function deleteDocument(id: string): Promise<void> {
  await run('readwrite', (store) => store.delete(id));
}

export async function deleteAllDocuments(): Promise<void> {
  await run('readwrite', (store) => store.clear());
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
