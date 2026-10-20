import { describe, expect, it } from 'vitest';
import { href, parseHash, tabFor } from '../src/router.ts';

describe('router', () => {
  it('erkennt alle Tabs', () => {
    expect(parseHash('')).toEqual({ name: 'start' });
    expect(parseHash('#/')).toEqual({ name: 'start' });
    expect(parseHash('#/bibliothek')).toEqual({ name: 'library' });
    expect(parseHash('#/suche')).toEqual({ name: 'search' });
    expect(parseHash('#/einstellungen')).toEqual({ name: 'settings' });
    expect(parseHash('#/hilfe')).toEqual({ name: 'help' });
  });

  it('erkennt Dokumente und kodiert die ID', () => {
    const route = { name: 'document', id: 'a b/c' } as const;
    expect(parseHash(href(route))).toEqual(route);
    expect(tabFor(route)).toBe('library');
  });

  it('meldet unbekannte Pfade', () => {
    expect(parseHash('#/gibtsnicht')).toEqual({ name: 'notFound' });
    expect(parseHash('#/hilfe/extra')).toEqual({ name: 'notFound' });
    expect(parseHash('#/dokument')).toEqual({ name: 'notFound' });
    expect(tabFor({ name: 'notFound' })).toBeNull();
  });
});

describe('router: Scanner', () => {
  it('kennt die Scan-Seite', () => {
    expect(parseHash('#/scannen')).toEqual({ name: 'scan' });
    expect(href({ name: 'scan' })).toBe('#/scannen');
    expect(tabFor({ name: 'scan' })).toBe('start');
  });
});
