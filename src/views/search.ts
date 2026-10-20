import { h } from '../dom.ts';
import { status } from '../feedback.ts';
import { countLabel } from '../format.ts';
import { searchDocuments } from '../search.ts';
import { listDocuments } from '../storage/documents.ts';
import { listPositions } from '../storage/positions.ts';
import { documentList, viewHeader, type View } from './components.ts';

const ANNOUNCE_DELAY_MS = 700;

/** Bleibt beim Wechsel zwischen den Tabs erhalten. */
let lastQuery = '';

export async function searchView(): Promise<View> {
  const [documents, positions] = await Promise.all([listDocuments(), listPositions().catch(() => new Map())]);
  let announceTimer: number | undefined;

  const summary = h('p', { class: 'view-intro', id: 'search-summary' });
  const results = h('div', null);

  const input = h('input', {
    id: 'search-input',
    type: 'search',
    name: 'q',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    enterkeyhint: 'search',
    'aria-describedby': 'search-summary',
    value: lastQuery,
  });

  const update = (announceResult: boolean): void => {
    const query = input.value.trim();
    lastQuery = input.value;
    window.clearTimeout(announceTimer);

    if (!query) {
      summary.textContent =
        documents.length > 0
          ? 'Suche in Titeln und Texten deiner Dokumente.'
          : 'Noch keine Dokumente vorhanden, die durchsucht werden können.';
      results.replaceChildren();
      return;
    }

    const hits = searchDocuments(documents, query);
    const message = `${countLabel(hits.length, 'Treffer', 'Treffer')} für „${query}“.`;
    summary.textContent = message;
    results.replaceChildren(
      hits.length > 0
        ? documentList(
            hits.map((hit) => hit.doc),
            (doc) => {
              const snippet = hits.find((hit) => hit.doc === doc)?.snippet;
              return snippet ? h('span', { class: 'doc-snippet' }, snippet) : null;
            },
            positions,
          )
        : h('p', { class: 'empty' }, 'Versuche einen anderen oder kürzeren Suchbegriff.'),
    );
    if (announceResult) {
      announceTimer = window.setTimeout(() => status(message), ANNOUNCE_DELAY_MS);
    }
  };

  input.addEventListener('input', () => update(true));

  const form = h(
    'form',
    {
      role: 'search',
      class: 'search-form',
      onsubmit: (event: Event) => {
        event.preventDefault();
        // Tastatur schließen, damit die Ergebnisse sichtbar werden.
        input.blur();
        update(false);
        status(summary.textContent ?? '');
      },
    },
    h('label', { for: 'search-input' }, 'Suchbegriff'),
    input,
  );

  update(false);

  return {
    title: 'Suche',
    element: h('div', { class: 'view' }, viewHeader('Suche'), form, summary, results),
    destroy: () => window.clearTimeout(announceTimer),
  };
}
