import { STORES, transact } from './db.ts';
import type { OcrResult, VoxDocument } from './documents.ts';
import { StorageError } from './errors.ts';
import type { ReadingPosition } from './positions.ts';

/**
 * Sicherung aller Dokumente als eine JSON-Datei. Die Datei entsteht auf dem
 * Gerät; wohin sie gespeichert wird, entscheidet der Nutzer (z. B. „In Dateien
 * sichern“). VoxDoc überträgt nichts automatisch.
 */
export const BACKUP_FORMAT = 'voxdoc-backup';
export const BACKUP_VERSION = 1;

interface BackupPage {
  type: string;
  /** Base64 */
  data: string;
}

interface BackupDocument {
  id: string;
  title: string;
  text: string;
  createdAt: number;
  updatedAt: number;
  pages: BackupPage[];
  ocr: OcrResult | null;
  position: Omit<ReadingPosition, 'docId'> | null;
}

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function fromBase64(data: string, type: string): Blob {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type });
}

export function backupFileName(date = new Date()): string {
  const day = date.toISOString().slice(0, 10);
  return `VoxDoc-Sicherung-${day}.json`;
}

/** Erstellt die Sicherung. Die Dokumente werden einzeln eingefügt, damit kein riesiger Text im Speicher entsteht. */
export async function createBackup(): Promise<{ blob: Blob; count: number }> {
  const [documents, positions] = await transact([STORES.documents, STORES.positions], 'readonly', (t) => {
    const docs = t.objectStore(STORES.documents).getAll() as IDBRequest<VoxDocument[]>;
    const pos = t.objectStore(STORES.positions).getAll() as IDBRequest<ReadingPosition[]>;
    return { get value(): [VoxDocument[], ReadingPosition[]] { return [docs.result, pos.result]; } };
  }).then((holder) => holder.value);
  const byDoc = new Map(positions.map((position) => [position.docId, position]));

  const parts: BlobPart[] = [`{"format":"${BACKUP_FORMAT}","version":${BACKUP_VERSION},"exportedAt":${Date.now()},"documents":[`];
  for (const [index, doc] of documents.entries()) {
    const position = byDoc.get(doc.id);
    const entry: BackupDocument = {
      id: doc.id,
      title: doc.title,
      text: doc.text ?? '',
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      pages: await Promise.all((doc.pages ?? []).map(async (page) => ({ type: page.type || 'image/jpeg', data: await toBase64(page) }))),
      ocr: doc.ocr ?? null,
      position: position ? { paragraph: position.paragraph, offset: position.offset, finished: position.finished, textHash: position.textHash, updatedAt: position.updatedAt } : null,
    };
    parts.push(`${index > 0 ? ',' : ''}${JSON.stringify(entry)}`);
  }
  parts.push(']}');
  return { blob: new Blob(parts, { type: 'application/json' }), count: documents.length };
}

const isString = (value: unknown): value is string => typeof value === 'string';
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function validDocument(value: unknown): value is BackupDocument {
  const doc = value as BackupDocument;
  return (
    typeof doc === 'object' &&
    doc !== null &&
    isString(doc.id) &&
    doc.id.length > 0 &&
    isString(doc.title) &&
    isString(doc.text) &&
    isNumber(doc.createdAt) &&
    isNumber(doc.updatedAt) &&
    Array.isArray(doc.pages) &&
    doc.pages.every((page) => isString(page?.type) && isString(page?.data)) &&
    (doc.ocr === null || (typeof doc.ocr === 'object' && Array.isArray(doc.ocr.pages))) &&
    (doc.position === null ||
      (typeof doc.position === 'object' && isNumber(doc.position.paragraph) && isNumber(doc.position.offset)))
  );
}

/**
 * Stellt eine Sicherung wieder her. Vorhandene Dokumente (gleiche ID) bleiben
 * unverändert. Alles wird in einer Transaktion geschrieben – entweder alle
 * neuen Dokumente oder keines.
 */
export async function restoreBackup(file: Blob): Promise<{ added: number; skipped: number }> {
  let data: { format?: unknown; version?: unknown; documents?: unknown };
  try {
    data = JSON.parse(await file.text());
  } catch (error) {
    throw new StorageError('invalidBackup', error);
  }
  if (data?.format !== BACKUP_FORMAT || data.version !== BACKUP_VERSION || !Array.isArray(data.documents) || !data.documents.every(validDocument)) {
    throw new StorageError('invalidBackup');
  }
  const entries = data.documents as BackupDocument[];
  let pages: Blob[][];
  try {
    pages = entries.map((entry) => entry.pages.map((page) => fromBase64(page.data, page.type)));
  } catch (error) {
    throw new StorageError('invalidBackup', error);
  }

  const existing = new Set(
    await transact(STORES.documents, 'readonly', (t) => t.objectStore(STORES.documents).getAllKeys() as IDBRequest<IDBValidKey[]>),
  );
  let added = 0;
  await transact([STORES.documents, STORES.positions], 'readwrite', (t) => {
    entries.forEach((entry, index) => {
      if (existing.has(entry.id)) {
        return;
      }
      const doc: VoxDocument = {
        id: entry.id,
        title: entry.title,
        text: entry.text,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        pages: pages[index]!,
        ocr: entry.ocr,
      };
      t.objectStore(STORES.documents).add(doc);
      if (entry.position) {
        t.objectStore(STORES.positions).put({ ...entry.position, docId: entry.id });
      }
      added++;
    });
  });
  return { added, skipped: entries.length - added };
}
