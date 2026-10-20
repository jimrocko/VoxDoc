export type Route =
  | { name: 'start' }
  | { name: 'library' }
  | { name: 'search' }
  | { name: 'settings' }
  | { name: 'help' }
  | { name: 'document'; id: string }
  | { name: 'notFound' };

/** Tabs der Hauptnavigation; ein Dokument gehört zur Bibliothek. */
export type Tab = 'start' | 'library' | 'search' | 'settings' | 'help';

const paths: Record<Tab, string> = {
  start: '',
  library: 'bibliothek',
  search: 'suche',
  settings: 'einstellungen',
  help: 'hilfe',
};

export function parseHash(hash: string): Route {
  const [first = '', second, ...rest] = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (first === 'dokument' && second && rest.length === 0) {
    return { name: 'document', id: decodeURIComponent(second) };
  }
  if (second !== undefined) {
    return { name: 'notFound' };
  }
  const tab = (Object.keys(paths) as Tab[]).find((key) => paths[key] === first);
  return tab ? { name: tab } : { name: 'notFound' };
}

export function href(route: Route): string {
  switch (route.name) {
    case 'document':
      return `#/dokument/${encodeURIComponent(route.id)}`;
    case 'notFound':
      return '#/';
    default:
      return `#/${paths[route.name]}`;
  }
}

export function tabFor(route: Route): Tab | null {
  if (route.name === 'document') {
    return 'library';
  }
  return route.name === 'notFound' ? null : route.name;
}

export function navigate(route: Route): void {
  window.location.hash = href(route);
}
