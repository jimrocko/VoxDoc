import { registerSW } from 'virtual:pwa-register';
import { announce, initAnnouncer } from './a11y/announcer.ts';
import { isIos, isStandalone } from './platform.ts';

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Element #${id} fehlt in index.html`);
  }
  return element as T;
}

function setupConnectionState(): void {
  const label = byId('connection-state');
  const update = (notify: boolean): void => {
    const text = navigator.onLine ? 'Online' : 'Offline';
    label.textContent = text;
    if (notify) {
      announce(navigator.onLine ? 'Verbindung wiederhergestellt.' : 'Keine Internetverbindung.');
    }
  };
  window.addEventListener('online', () => update(true));
  window.addEventListener('offline', () => update(true));
  update(false);
}

function setupScanButton(): void {
  byId<HTMLButtonElement>('scan-button').addEventListener('click', () => {
    // Platzhalter: Kamera und Texterkennung folgen in einem späteren Schritt.
    announce('Die Dokumentenerkennung ist noch nicht verfügbar.');
  });
}

function setupInstallHint(): void {
  byId('install-card').hidden = !(isIos() && !isStandalone());
}

function main(): void {
  initAnnouncer(byId('announcer'));
  byId('app-version').textContent = __APP_VERSION__;
  setupScanButton();
  setupInstallHint();
  setupConnectionState();

  registerSW({
    immediate: true,
    onOfflineReady: () => announce('VoxDoc ist jetzt auch offline verfügbar.'),
  });
}

main();
