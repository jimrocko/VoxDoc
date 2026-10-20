import { h } from '../dom.ts';
import { countLabel } from '../format.ts';
import { isIos, isStandalone } from '../platform.ts';
import { href } from '../router.ts';
import { listDocuments } from '../storage/documents.ts';
import { listPositions, type ReadingPosition } from '../storage/positions.ts';
import { documentList, readingProgress, scanButtons, section, viewHeader, type View } from './components.ts';

const RECENT_COUNT = 3;

export async function homeView(): Promise<View> {
  const [documents, positions] = await Promise.all([listDocuments(), listPositions().catch(() => new Map<string, ReadingPosition>())]);
  const recent = documents.slice(0, RECENT_COUNT);
  // Zuletzt angefangenes, noch nicht fertig gelesenes Dokument.
  const continueDoc = [...positions.values()]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((position) => documents.find((doc) => doc.id === position.docId && readingProgress(doc, position)?.startsWith('weiterlesen')))
    .find(Boolean);

  const element = h(
    'div',
    { class: 'view' },
    viewHeader('VoxDoc', 'Dokumente scannen, sammeln und vorlesen lassen.'),
    h('div', { class: 'card card-hero' }, scanButtons('scan-hint')),
    continueDoc ? section('continue-heading', 'Weiterlesen', documentList([continueDoc], null, positions)) : null,
    isIos() && !isStandalone()
      ? section(
          'install-heading',
          'Als App installieren',
          h(
            'p',
            null,
            'Tippe in Safari auf „Teilen“ und wähle „Zum Home-Bildschirm“. VoxDoc startet dann wie eine eigene App und funktioniert auch ohne Internet. Außerdem schützt es deine Dokumente: Safari kann Daten von Websites löschen, die sieben Tage nicht geöffnet wurden.',
          ),
        )
      : null,
    section(
      'recent-heading',
      'Zuletzt gescannt',
      recent.length > 0
        ? documentList(recent, null, positions)
        : h('p', { class: 'empty' }, 'Noch keine Dokumente. Gescannte Dokumente erscheinen hier.'),
      documents.length > RECENT_COUNT
        ? h(
            'a',
            { class: 'text-link', href: href({ name: 'library' }) },
            `Alle anzeigen (${countLabel(documents.length, 'Dokument', 'Dokumente')})`,
          )
        : null,
    ),
  );

  return { title: 'Start', element };
}
