const dateTime = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const longDate = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
const time = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });

/** Standardname für neue Scans, z. B. „Dokument vom 20.10.2026, 14:30“. */
export function defaultTitle(date: Date): string {
  return `Dokument vom ${dateTime.format(date)}`;
}

/** Gut vorlesbares Datum, z. B. „20. Oktober 2026 um 14:30 Uhr“. */
export function spokenDate(timestamp: number): string {
  const date = new Date(timestamp);
  return `${longDate.format(date)} um ${time.format(date)} Uhr`;
}

export function countLabel(count: number, singular: string, plural: string): string {
  return `${count === 0 ? 'Keine' : count} ${count === 1 ? singular : plural}`;
}

export function megabytes(bytes: number): string {
  return `${(bytes / 1_000_000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`;
}
