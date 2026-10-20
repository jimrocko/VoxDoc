/**
 * Ansagen für Screenreader über eine Live-Region.
 *
 * VoiceOver auf iOS liest eine Live-Region nur vor, wenn sich ihr Inhalt
 * ändert. Deshalb wird die Region zuerst geleert und der Text kurz danach
 * gesetzt – so werden auch identische Meldungen erneut angesagt. Meldungen,
 * die innerhalb dieser kurzen Zeit eintreffen, werden zusammengefasst statt
 * sich gegenseitig zu überschreiben.
 */
const CLEAR_DELAY_MS = 100;

let region: HTMLElement | null = null;
let timer: number | undefined;
let pending: string[] = [];

export function initAnnouncer(element: HTMLElement): void {
  region = element;
}

export function announce(message: string): void {
  if (!region) {
    return;
  }
  const target = region;
  pending.push(message);
  window.clearTimeout(timer);
  target.textContent = '';
  timer = window.setTimeout(() => {
    target.textContent = pending.join(' ');
    pending = [];
  }, CLEAR_DELAY_MS);
}
