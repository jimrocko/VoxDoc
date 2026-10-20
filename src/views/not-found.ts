import { h } from '../dom.ts';
import { href } from '../router.ts';
import { viewHeader, type View } from './components.ts';

export function notFoundView(message = 'Diese Seite gibt es nicht.'): View {
  return {
    title: 'Nicht gefunden',
    element: h(
      'div',
      { class: 'view' },
      viewHeader('Nicht gefunden', message),
      h('a', { class: 'button button-primary', href: href({ name: 'start' }) }, 'Zur Startseite'),
    ),
  };
}
