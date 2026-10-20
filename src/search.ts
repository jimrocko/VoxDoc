import type { VoxDocument } from './storage/documents.ts';

export interface SearchHit {
  doc: VoxDocument;
  /** Textausschnitt um den ersten Treffer im Dokumenttext, falls vorhanden. */
  snippet: string;
}

const SNIPPET_RADIUS = 60;

function normalize(value: string): string {
  return value.normalize('NFC').toLocaleLowerCase('de-DE');
}

function terms(query: string): string[] {
  return normalize(query).split(/\s+/).filter(Boolean);
}

/** Alle Suchbegriffe müssen in Titel oder Text vorkommen. */
export function searchDocuments(documents: readonly VoxDocument[], query: string): SearchHit[] {
  const words = terms(query);
  if (words.length === 0) {
    return [];
  }
  return documents
    .filter((doc) => {
      const haystack = normalize(`${doc.title}\n${doc.text}`);
      return words.every((word) => haystack.includes(word));
    })
    .map((doc) => ({ doc, snippet: snippet(doc.text, words) }));
}

export function snippet(text: string, words: readonly string[]): string {
  const normalized = normalize(text);
  const positions = words.map((word) => normalized.indexOf(word)).filter((index) => index >= 0);
  if (positions.length === 0) {
    return '';
  }
  const index = Math.min(...positions);
  const start = Math.max(0, index - SNIPPET_RADIUS);
  const end = Math.min(text.length, index + SNIPPET_RADIUS);
  const excerpt = text.slice(start, end).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '…' : ''}${excerpt}${end < text.length ? '…' : ''}`;
}
