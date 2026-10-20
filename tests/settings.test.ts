import { describe, expect, it } from 'vitest';
import { defaults, sanitize } from '../src/storage/settings.ts';

describe('sanitize', () => {
  it('nutzt Standardwerte für fehlende oder ungültige Eingaben', () => {
    expect(sanitize(null)).toEqual(defaults);
    expect(sanitize({ theme: 'pink', tones: 'ja', librarySort: 42 })).toEqual(defaults);
  });

  it('übernimmt gültige Werte und begrenzt das Sprechtempo', () => {
    expect(sanitize({ theme: 'light', speechRate: 9, tones: false })).toMatchObject({
      theme: 'light',
      speechRate: 2,
      tones: false,
    });
    expect(sanitize({ speechRate: 0.1 }).speechRate).toBe(0.5);
  });
});
