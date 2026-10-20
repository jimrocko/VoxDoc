import { isIos, isStandalone } from '../platform.ts';
import { openDb } from './db.ts';
import { storageErrorMessage } from './errors.ts';

export interface StorageHealth {
  /** Fehlermeldung, wenn die Datenbank nicht geöffnet werden kann. */
  error: string | null;
  /** Hat der Browser zugesagt, die Daten nicht automatisch zu löschen? `null` = unbekannt. */
  persisted: boolean | null;
  usage: number | null;
  quota: number | null;
  /** Mehr als 90 % des verfügbaren Speichers belegt. */
  nearlyFull: boolean;
  /**
   * Safari löscht Website-Daten nach 7 Tagen ohne Nutzung, wenn die Seite nicht
   * auf dem Home-Bildschirm installiert ist.
   */
  evictionRisk: boolean;
}

export const NEARLY_FULL = 0.9;

export async function checkStorageHealth(): Promise<StorageHealth> {
  let error: string | null = null;
  try {
    await openDb();
  } catch (cause) {
    error = storageErrorMessage(cause);
  }
  let persisted: boolean | null = null;
  let usage: number | null = null;
  let quota: number | null = null;
  try {
    persisted = (await navigator.storage?.persisted?.()) ?? null;
    const estimate = await navigator.storage?.estimate?.();
    usage = estimate?.usage ?? null;
    quota = estimate?.quota ?? null;
  } catch {
    // Storage API nicht verfügbar.
  }
  return {
    error,
    persisted,
    usage,
    quota,
    nearlyFull: usage !== null && !!quota && usage / quota > NEARLY_FULL,
    evictionRisk: isIos() && !isStandalone() && persisted !== true,
  };
}

export const EVICTION_HINT =
  'Safari kann gespeicherte Daten von Websites löschen, die sieben Tage lang nicht geöffnet wurden. Füge VoxDoc zum Home-Bildschirm hinzu und erstelle regelmäßig eine Sicherung.';
