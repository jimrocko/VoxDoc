import { h } from '../dom.ts';
import { status } from '../feedback.ts';
import { countLabel } from '../format.ts';
import { startScan } from '../scan/scan.ts';
import { listDocuments, type VoxDocument } from '../storage/documents.ts';
import { getSettings, updateSettings, type LibrarySort } from '../storage/settings.ts';
import { documentList, scanButtons, viewHeader, type View } from './components.ts';

const sortLabels: Record<LibrarySort, string> = {
  newest: 'Neueste zuerst',
  oldest: 'Älteste zuerst',
  title: 'Name (A–Z)',
};

export function sortDocuments(documents: readonly VoxDocument[], sort: LibrarySort): VoxDocument[] {
  const sorted = [...documents];
  switch (sort) {
    case 'newest':
      return sorted.sort((a, b) => b.createdAt - a.createdAt);
    case 'oldest':
      return sorted.sort((a, b) => a.createdAt - b.createdAt);
    case 'title':
      return sorted.sort((a, b) => a.title.localeCompare(b.title, 'de', { numeric: true }));
  }
}

export async function libraryView(): Promise<View> {
  const documents = await listDocuments();
  const count = countLabel(documents.length, 'Dokument', 'Dokumente');

  if (documents.length === 0) {
    return {
      title: 'Bibliothek',
      element: h(
        'div',
        { class: 'view' },
        viewHeader('Bibliothek', 'Hier findest du alle gescannten Dokumente.'),
        h('p', { class: 'empty' }, 'Deine Bibliothek ist noch leer.'),
        scanButtons(startScan, 'library-scan-hint'),
      ),
    };
  }

  const listHolder = h('div', null);
  const renderList = (sort: LibrarySort): void => {
    listHolder.replaceChildren(documentList(sortDocuments(documents, sort)));
  };

  const select = h(
    'select',
    {
      id: 'library-sort',
      onchange: (event: Event) => {
        const sort = (event.target as HTMLSelectElement).value as LibrarySort;
        updateSettings({ librarySort: sort });
        renderList(sort);
        status(`Sortiert: ${sortLabels[sort]}.`);
      },
    },
    ...(Object.keys(sortLabels) as LibrarySort[]).map((key) =>
      h('option', { value: key, selected: key === getSettings().librarySort }, sortLabels[key]),
    ),
  );

  renderList(getSettings().librarySort);

  return {
    title: 'Bibliothek',
    element: h(
      'div',
      { class: 'view' },
      viewHeader('Bibliothek', `${count} gespeichert.`),
      documents.length > 1
        ? h(
            'div',
            { class: 'field field-inline' },
            h('label', { for: 'library-sort' }, 'Sortieren'),
            select,
          )
        : null,
      listHolder,
    ),
  };
}
