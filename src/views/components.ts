import { h, type Child } from '../dom.ts';
import { spokenDate } from '../format.ts';
import { href } from '../router.ts';
import type { VoxDocument } from '../storage/documents.ts';

export interface View {
  /** Erscheint im Fenstertitel. */
  title: string;
  element: HTMLElement;
  /** Wird beim Verlassen der Ansicht aufgerufen. */
  destroy?: () => void;
}

/** Jede Ansicht beginnt mit genau einer h1; sie erhält beim Seitenwechsel den Fokus. */
export function viewHeader(title: string, ...intro: Child[]): HTMLElement {
  return h(
    'header',
    { class: 'view-header' },
    h('h1', { class: 'view-title', tabindex: '-1' }, title),
    ...intro.map((child) => (typeof child === 'string' ? h('p', { class: 'view-intro' }, child) : child)),
  );
}

export function section(id: string, title: string, ...children: Child[]): HTMLElement {
  return h(
    'section',
    { class: 'section', 'aria-labelledby': id },
    h('h2', { id }, title),
    ...children,
  );
}

const chevron = (): SVGElement => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'chevron');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M9 5l7 7-7 7');
  svg.append(path);
  return svg;
};

export function documentMeta(doc: VoxDocument): string {
  return `${spokenDate(doc.createdAt)} · ${doc.text.trim() ? 'mit Text' : 'noch ohne Text'}`;
}

export function documentList(
  documents: readonly VoxDocument[],
  extra?: (doc: VoxDocument) => Child,
): HTMLUListElement {
  return h(
    'ul',
    { class: 'doc-list' },
    ...documents.map((doc) =>
      h(
        'li',
        null,
        h(
          'a',
          { class: 'doc-link', href: href({ name: 'document', id: doc.id }) },
          h(
            'span',
            { class: 'doc-link-body' },
            h('span', { class: 'doc-title' }, doc.title),
            h('span', { class: 'doc-meta' }, documentMeta(doc)),
            extra?.(doc),
          ),
          chevron(),
        ),
      ),
    ),
  );
}

export function scanButtons(onScan: (source: 'camera' | 'photos') => void, hintId: string): HTMLElement {
  return h(
    'div',
    { class: 'scan-actions' },
    h(
      'button',
      {
        type: 'button',
        class: 'button button-primary button-hero',
        'aria-describedby': hintId,
        onclick: () => onScan('camera'),
      },
      'Dokument scannen',
    ),
    h(
      'p',
      { id: hintId, class: 'hint' },
      'Öffnet die Kamera. Lege das Dokument auf eine helle, ebene Fläche und halte das iPhone etwa 30 Zentimeter darüber.',
    ),
    h(
      'button',
      { type: 'button', class: 'button button-secondary', onclick: () => onScan('photos') },
      'Foto aus der Mediathek wählen',
    ),
  );
}
