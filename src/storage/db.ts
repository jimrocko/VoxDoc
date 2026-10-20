import { StorageError } from './errors.ts';

/**
 * Gemeinsame IndexedDB-Datenbank. Alles bleibt auf dem Gerät; es gibt weder
 * Anmeldung noch Synchronisation.
 *
 * Versionen:
 * 1 – `documents` mit einem Foto (`image`)
 * 2 – `documents` mit Seitenliste (`pages`)
 * 3 – zusätzlich `positions` (Leseposition) und `drafts` (laufender Scan)
 */
const DB_NAME = 'voxdoc';
const DB_VERSION = 3;

export const STORES = {
  documents: 'documents',
  positions: 'positions',
  drafts: 'drafts',
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];

type Listener = (reason: 'outdated') => void;
const listeners = new Set<Listener>();

/** Meldet, wenn die Datenbank von einem anderen Tab ersetzt wurde. */
export function onDatabaseLost(listener: Listener): void {
  listeners.add(listener);
}

/** Version 1 → 2: das einzelne Foto `image` wird zur ersten Seite. */
function migrateToPages(transaction: IDBTransaction): void {
  transaction.objectStore(STORES.documents).openCursor().onsuccess = (event) => {
    const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
    if (cursor) {
      const { image, ...rest } = cursor.value as { image?: Blob | null };
      cursor.update({ ...rest, pages: image ? [image] : [] });
      cursor.continue();
    }
  };
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      if (typeof indexedDB === 'undefined') {
        throw new Error('IndexedDB fehlt');
      }
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      reject(new StorageError('unavailable', error));
      return;
    }
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (event.oldVersion < 1) {
        db.createObjectStore(STORES.documents, { keyPath: 'id' });
      } else if (event.oldVersion < 2) {
        migrateToPages(request.transaction!);
      }
      if (event.oldVersion < 3) {
        db.createObjectStore(STORES.positions, { keyPath: 'docId' });
        db.createObjectStore(STORES.drafts, { keyPath: 'id' });
      }
    };
    // Ein anderer Tab hält noch die alte Version offen.
    request.onblocked = () => reject(new StorageError('blocked'));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        // Ein anderer Tab will aktualisieren: Verbindung freigeben und Bescheid sagen.
        db.close();
        dbPromise = null;
        listeners.forEach((listener) => listener('outdated'));
      };
      resolve(db);
    };
    request.onerror = () => {
      const error = request.error;
      reject(error?.name === 'VersionError' ? new StorageError('outdated', error) : new StorageError('unavailable', error));
    };
  }).catch((error: unknown) => {
    dbPromise = null;
    throw error;
  });
  return dbPromise;
}

/**
 * Führt eine Transaktion aus und wartet, bis sie abgeschlossen ist. Schreiben
 * erfolgt mit `durability: 'strict'`, damit gespeicherte Daten auch bei einem
 * Absturz direkt danach erhalten bleiben.
 */
export async function transact<T>(
  stores: StoreName | StoreName[],
  mode: IDBTransactionMode,
  action: (transaction: IDBTransaction) => T | IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    let transaction: IDBTransaction;
    try {
      transaction = db.transaction(stores, mode, mode === 'readwrite' ? { durability: 'strict' } : undefined);
    } catch (error) {
      reject(error);
      return;
    }
    let result: T | IDBRequest<T>;
    try {
      result = action(transaction);
    } catch (error) {
      transaction.abort();
      reject(error);
      return;
    }
    transaction.oncomplete = () => resolve(result instanceof IDBRequest ? (result.result as T) : result);
    transaction.onerror = () => reject(transaction.error ?? new StorageError('unknown'));
    transaction.onabort = () => reject(transaction.error ?? new StorageError('unknown'));
  });
}

/** Nur für Tests: Verbindung schließen, damit eine neue Datenbank geöffnet werden kann. */
export async function closeDb(): Promise<void> {
  const db = await dbPromise?.catch(() => null);
  db?.close();
  dbPromise = null;
}
