/** Dokumente bleiben auf dem Gerät – gespeichert in IndexedDB. */
export interface VoxDocument {
  id: string;
  title: string;
  /** Erkannter oder selbst eingegebener Text. */
  text: string;
  image: Blob | null;
  createdAt: number;
  updatedAt: number;
}

const DB_NAME = 'voxdoc';
const DB_VERSION = 1;
const STORE = 'documents';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: 'id' });
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
  const documents = await run('readonly', (store) => store.getAll() as IDBRequest<VoxDocument[]>);
  return documents.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getDocument(id: string): Promise<VoxDocument | undefined> {
  return run('readonly', (store) => store.get(id) as IDBRequest<VoxDocument | undefined>);
}

export async function createDocument(fields: Pick<VoxDocument, 'title' | 'image'>): Promise<VoxDocument> {
  const now = Date.now();
  const doc: VoxDocument = { id: crypto.randomUUID(), text: '', createdAt: now, updatedAt: now, ...fields };
  await run('readwrite', (store) => store.add(doc));
  return doc;
}

export async function updateDocument(
  id: string,
  changes: Partial<Pick<VoxDocument, 'title' | 'text'>>,
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
