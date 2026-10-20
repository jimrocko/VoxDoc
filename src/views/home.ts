import { h } from '../dom.ts';
import { countLabel } from '../format.ts';
import { isIos, isStandalone } from '../platform.ts';
import { href } from '../router.ts';
import { listDocuments } from '../storage/documents.ts';
import { documentList, scanButtons, section, viewHeader, type View } from './components.ts';

const RECENT_COUNT = 3;

export async function homeView(): Promise<View> {
  const documents = await listDocuments();
  const recent = documents.slice(0, RECENT_COUNT);

  const element = h(
    'div',
    { class: 'view' },
    viewHeader('VoxDoc', 'Dokumente scannen, sammeln und vorlesen lassen.'),
    h('div', { class: 'card card-hero' }, scanButtons('scan-hint')),
    isIos() && !isStandalone()
      ? section(
          'install-heading',
          'Als App installieren',
          h(
            'p',
            null,
            'Tippe in Safari auf „Teilen“ und wähle „Zum Home-Bildschirm“. VoxDoc startet dann wie eine eigene App und funktioniert auch ohne Internet.',
          ),
        )
      : null,
    section(
      'recent-heading',
      'Zuletzt gescannt',
      recent.length > 0
        ? documentList(recent)
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
