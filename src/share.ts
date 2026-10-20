import { h } from './dom.ts';

export type DeliveryResult = 'shared' | 'downloaded' | 'cancelled' | 'needsTap';

/**
 * Safari erlaubt Teilen und Herunterladen nur kurz nach einem Tippen. Nach einem
 * Sprachbefehl oder einer längeren Vorbereitung ist diese Erlaubnis abgelaufen.
 */
function hasUserActivation(): boolean {
  const activation = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
  return activation ? activation.isActive : true;
}

/**
 * Gibt eine Datei über das Teilen-Menü (z. B. „In Dateien sichern“) weiter oder
 * lädt sie herunter. Liefert `needsTap`, wenn dafür erst getippt werden muss –
 * dann ist nichts passiert, und die Oberfläche bietet einen Knopf an.
 */
export async function offerFile(blob: Blob, name: string): Promise<DeliveryResult> {
  if (!hasUserActivation()) {
    return 'needsTap';
  }
  const file = new File([blob], name, { type: blob.type });
  if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return 'shared';
    } catch (error) {
      const errorName = (error as DOMException).name;
      if (errorName === 'AbortError') {
        return 'cancelled';
      }
      if (errorName === 'NotAllowedError') {
        return 'needsTap';
      }
      // Teilen nicht möglich – auf Herunterladen ausweichen.
    }
  }
  const url = URL.createObjectURL(file);
  const link = h('a', { href: url, download: name, hidden: true });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'downloaded';
}
