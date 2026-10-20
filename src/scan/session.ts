import { loadDraft, saveDraft } from '../storage/drafts.ts';

/**
 * Seiten des laufenden Scans. Sie werden nach jeder Änderung als Entwurf in
 * IndexedDB gesichert und überstehen so Tab-Wechsel, das Schließen der App und
 * einen Neustart des iPhones – bis das Dokument gespeichert oder verworfen wird.
 */
export interface ScanPage {
  id: string;
  blob: Blob;
}

let pages: ScanPage[] = [];
let restored = false;
let writes: Promise<void> = Promise.resolve();
let onPersistError: ((error: unknown) => void) | null = null;

/** Wird aufgerufen, wenn der Entwurf nicht gesichert werden konnte (z. B. Speicher voll). */
export function setPersistErrorHandler(handler: ((error: unknown) => void) | null): void {
  onPersistError = handler;
}

function persist(): void {
  const snapshot = pages;
  // Nacheinander schreiben, damit ein älterer Stand nie einen neueren überschreibt.
  writes = writes.then(() => saveDraft(snapshot)).catch((error: unknown) => onPersistError?.(error));
}

/** Einmalig den gesicherten Entwurf laden. Liefert die Zahl wiederhergestellter Seiten. */
export async function restorePages(): Promise<number> {
  if (restored) {
    return 0;
  }
  restored = true;
  const draft = await loadDraft();
  if (!draft || pages.length > 0) {
    return 0;
  }
  pages = draft.pages;
  return pages.length;
}

/** Bis alle Änderungen gesichert sind (für Tests und vor dem Speichern). */
export function flushPages(): Promise<void> {
  return writes;
}

export function scanPages(): readonly ScanPage[] {
  return pages;
}

export function addPage(blob: Blob): number {
  pages = [...pages, { id: crypto.randomUUID(), blob }];
  persist();
  return pages.length - 1;
}

export function replacePage(index: number, blob: Blob): void {
  pages = pages.map((page, i) => (i === index ? { id: crypto.randomUUID(), blob } : page));
  persist();
}

export function movePageInScan(from: number, to: number): void {
  if (to < 0 || to >= pages.length || from === to) {
    return;
  }
  const copy = [...pages];
  const [page] = copy.splice(from, 1);
  copy.splice(to, 0, page!);
  pages = copy;
  persist();
}

export function removePage(index: number): void {
  pages = pages.filter((_, i) => i !== index);
  persist();
}

export function clearPages(): void {
  pages = [];
  persist();
}
