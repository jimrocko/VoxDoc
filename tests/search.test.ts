import { describe, expect, it } from 'vitest';
import { searchDocuments, snippet } from '../src/search.ts';
import type { VoxDocument } from '../src/storage/documents.ts';
import { sortDocuments } from '../src/views/library.ts';

const doc = (id: string, title: string, text = '', createdAt = 0): VoxDocument => ({
  id,
  title,
  text,
  image: null,
  createdAt,
  updatedAt: createdAt,
});

const docs = [
  doc('1', 'Stromrechnung Oktober', 'Bitte überweisen Sie 84,20 Euro bis zum 15. November.', 3),
  doc('2', 'Arztbrief', 'Termin bei Dr. Müller am Montag.', 1),
  doc('3', 'Dokument 10', '', 2),
];

describe('searchDocuments', () => {
  it('findet Titel und Text ohne Beachtung der Groß-/Kleinschreibung', () => {
    expect(searchDocuments(docs, 'strom').map((hit) => hit.doc.id)).toEqual(['1']);
    expect(searchDocuments(docs, 'MÜLLER').map((hit) => hit.doc.id)).toEqual(['2']);
  });

  it('verlangt alle Suchbegriffe', () => {
    expect(searchDocuments(docs, 'rechnung november')).toHaveLength(1);
    expect(searchDocuments(docs, 'rechnung montag')).toHaveLength(0);
  });

  it('liefert für leere Suche nichts', () => {
    expect(searchDocuments(docs, '   ')).toEqual([]);
  });

  it('erzeugt einen Ausschnitt um den Treffer', () => {
    const long = `${'a '.repeat(80)}Treffer ${'b '.repeat(80)}`;
    const result = snippet(long, ['treffer']);
    expect(result).toContain('Treffer');
    expect(result.startsWith('…')).toBe(true);
    expect(result.endsWith('…')).toBe(true);
    expect(snippet('ohne', ['x'])).toBe('');
  });
});

describe('sortDocuments', () => {
  it('sortiert nach Datum und Name', () => {
    expect(sortDocuments(docs, 'newest').map((d) => d.id)).toEqual(['1', '3', '2']);
    expect(sortDocuments(docs, 'oldest').map((d) => d.id)).toEqual(['2', '3', '1']);
    expect(sortDocuments(docs, 'title').map((d) => d.id)).toEqual(['2', '3', '1']);
  });
});
