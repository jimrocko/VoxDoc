/**
 * Seiten des laufenden Scans. Bleiben erhalten, wenn man zwischendurch einen
 * anderen Tab öffnet, bis das Dokument gespeichert oder verworfen wird.
 */
export interface ScanPage {
  id: string;
  blob: Blob;
}

let pages: ScanPage[] = [];

export function scanPages(): readonly ScanPage[] {
  return pages;
}

export function addPage(blob: Blob): number {
  pages = [...pages, { id: crypto.randomUUID(), blob }];
  return pages.length - 1;
}

export function replacePage(index: number, blob: Blob): void {
  pages = pages.map((page, i) => (i === index ? { id: crypto.randomUUID(), blob } : page));
}

export function removePage(index: number): void {
  pages = pages.filter((_, i) => i !== index);
}

export function clearPages(): void {
  pages = [];
}
