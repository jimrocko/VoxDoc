import type { PdfBlock } from './pdf.ts';
import type { ExportModel } from './model.ts';

/**
 * Reiner Text (UTF-8 mit BOM, damit auch ältere Programme Umlaute erkennen).
 * Überschriften sind unterstrichen, Absätze durch Leerzeilen getrennt.
 */
export function toText(model: ExportModel): string {
  const underline = (text: string, char: string) => `${text}\n${char.repeat(Math.max(3, [...text].length))}`;
  const parts: string[] = [underline(model.title, '='), model.details];
  if (model.ocrNote) {
    parts.push(`Hinweis: ${model.ocrNote}`);
  }
  for (const section of model.sections) {
    parts.push(underline(section.heading, '-'));
    parts.push(...section.paragraphs);
    if (section.note) {
      parts.push(`[${section.note}]`);
    }
  }
  return `﻿${parts.join('\n\n')}\n`;
}

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface HtmlPhoto {
  /** Data-URL des Fotos. */
  src: string;
  alt: string;
  caption: string;
}

/**
 * Eigenständige, semantische HTML-Seite: eine h1, je Abschnitt section/h2 und
 * Absätze; Fotos als figure mit Alternativtext und Bildunterschrift.
 */
export function toHtml(model: ExportModel, photos: readonly HtmlPhoto[]): string {
  const id = (index: number) => `abschnitt-${index + 1}`;
  const sections = model.sections
    .map(
      (section, index) => `    <section aria-labelledby="${id(index)}">
      <h2 id="${id(index)}">${escapeHtml(section.heading)}</h2>
${section.paragraphs.map((paragraph) => `      <p>${escapeHtml(paragraph)}</p>`).join('\n')}${section.note ? `\n      <p class="hinweis">${escapeHtml(section.note)}</p>` : ''}
    </section>`,
    )
    .join('\n');
  const figures =
    photos.length > 0
      ? `
    <section aria-labelledby="fotos">
      <h2 id="fotos">Fotos der Seiten</h2>
${photos
  .map(
    (photo) => `      <figure>
        <img src="${photo.src}" alt="${escapeHtml(photo.alt)}">
        <figcaption>${escapeHtml(photo.caption)}</figcaption>
      </figure>`,
  )
  .join('\n')}
    </section>`
      : '';
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="generator" content="VoxDoc">
  <title>${escapeHtml(model.title)}</title>
  <style>
    :root { color-scheme: light dark; --text: #111; --muted: #4a4f59; --bg: #fff; }
    @media (prefers-color-scheme: dark) { :root { --text: #f4f6fa; --muted: #c4cad6; --bg: #0b0d12; } }
    body { font: 1.125rem/1.6 -apple-system, system-ui, sans-serif; max-width: 42rem; margin: 0 auto; padding: 1.5rem 1rem; color: var(--text); background: var(--bg); }
    .angaben, .hinweis { color: var(--muted); }
    figure { margin: 1.5rem 0; }
    img { max-width: 100%; height: auto; border: 1px solid var(--muted); }
  </style>
</head>
<body>
  <main>
    <article>
    <header>
      <h1>${escapeHtml(model.title)}</h1>
      <p class="angaben">${escapeHtml(model.details)}</p>${model.ocrNote ? `\n      <p class="hinweis">${escapeHtml(model.ocrNote)}</p>` : ''}
    </header>
${sections}${figures}
    </article>
  </main>
</body>
</html>
`;
}

/** Gleiche Reihenfolge wie TXT und HTML: Titel, Angaben, Abschnitte, Fotos. */
export function toPdfBlocks(model: ExportModel, jpegs: readonly Uint8Array[]): PdfBlock[] {
  const blocks: PdfBlock[] = [
    { kind: 'heading', level: 1, text: model.title },
    { kind: 'paragraph', text: model.details, small: true },
  ];
  if (model.ocrNote) {
    blocks.push({ kind: 'paragraph', text: model.ocrNote, small: true });
  }
  for (const section of model.sections) {
    blocks.push({ kind: 'heading', level: 2, text: section.heading });
    section.paragraphs.forEach((text) => blocks.push({ kind: 'paragraph', text }));
    if (section.note) {
      blocks.push({ kind: 'paragraph', text: section.note, small: true });
    }
  }
  if (jpegs.length > 0) {
    blocks.push({ kind: 'heading', level: 2, text: 'Fotos der Seiten' });
    model.photos.forEach((photo, index) => {
      blocks.push({ kind: 'paragraph', text: photo.caption, small: true });
      blocks.push({ kind: 'figure', jpeg: jpegs[index]!, alt: photo.alt });
    });
  }
  return blocks;
}
