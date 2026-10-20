import { announce } from './a11y/announcer.ts';
import { byId } from './dom.ts';
import { parseHash, tabFor, type Route } from './router.ts';
import { getSettings, onSettingsChange, type Theme } from './storage/settings.ts';
import type { View } from './views/components.ts';
import { documentView } from './views/document.ts';
import { helpView } from './views/help.ts';
import { homeView } from './views/home.ts';
import { libraryView } from './views/library.ts';
import { notFoundView } from './views/not-found.ts';
import { scannerView } from './views/scanner.ts';
import { searchView } from './views/search.ts';
import { settingsView } from './views/settings.ts';

function loadView(route: Route): View | Promise<View> {
  switch (route.name) {
    case 'start':
      return homeView();
    case 'library':
      return libraryView();
    case 'search':
      return searchView();
    case 'settings':
      return settingsView();
    case 'help':
      return helpView();
    case 'scan':
      return scannerView();
    case 'document':
      return documentView(route.id);
    case 'notFound':
      return notFoundView();
  }
}

let currentView: View | null = null;
let renderId = 0;

async function render(moveFocus: boolean): Promise<void> {
  const id = ++renderId;
  const route = parseHash(window.location.hash);
  const main = byId('main');
  main.setAttribute('aria-busy', 'true');

  let view: View;
  try {
    view = await loadView(route);
  } catch (error) {
    console.error(error);
    view = notFoundView('Beim Laden ist ein Fehler aufgetreten. Bitte versuche es erneut.');
  }
  // Inzwischen wurde schon weiternavigiert.
  if (id !== renderId) {
    view.destroy?.();
    return;
  }

  currentView?.destroy?.();
  currentView = view;
  main.replaceChildren(view.element);
  main.removeAttribute('aria-busy');
  document.title = view.title === 'Start' ? 'VoxDoc' : `${view.title} – VoxDoc`;
  updateTabs(route);

  if (moveFocus) {
    window.scrollTo(0, 0);
    // VoiceOver liest die neue Überschrift vor und setzt dort fort.
    main.querySelector<HTMLElement>('h1')?.focus();
  }
}

function updateTabs(route: Route): void {
  const tab = tabFor(route);
  for (const link of document.querySelectorAll<HTMLAnchorElement>('[data-tab]')) {
    if (link.dataset.tab === tab) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  }
}

const themeColors = { dark: '#0b0d12', light: '#f6f7f9' } as const;

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const resolved =
    theme === 'system' ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : theme;
  root.dataset.theme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColors[resolved]);
}

function setupTheme(): void {
  applyTheme(getSettings().theme);
  onSettingsChange((settings) => applyTheme(settings.theme));
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (getSettings().theme === 'system') {
      applyTheme('system');
    }
  });
}

function setupConnectionState(): void {
  const banner = byId('offline-banner');
  const update = (notify: boolean): void => {
    banner.hidden = navigator.onLine;
    for (const element of document.querySelectorAll('[data-connection-state]')) {
      element.textContent = navigator.onLine ? 'Online' : 'Offline';
    }
    if (notify) {
      announce(navigator.onLine ? 'Verbindung wiederhergestellt.' : 'Keine Internetverbindung. VoxDoc funktioniert weiter.');
    }
  };
  window.addEventListener('online', () => update(true));
  window.addEventListener('offline', () => update(true));
  update(false);
}

export function startApp(): void {
  setupTheme();
  setupConnectionState();
  window.addEventListener('hashchange', () => void render(true));
  void render(false);
}
