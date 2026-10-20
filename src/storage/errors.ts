export type StorageErrorCode =
  | 'unavailable'
  | 'quota'
  | 'blocked'
  | 'outdated'
  | 'notFound'
  | 'invalidBackup'
  | 'unknown';

export class StorageError extends Error {
  constructor(
    readonly code: StorageErrorCode,
    cause?: unknown,
  ) {
    super(code, { cause });
    this.name = 'StorageError';
  }
}

export const storageErrorMessages: Record<StorageErrorCode, string> = {
  unavailable:
    'Der Speicher auf diesem iPhone ist für VoxDoc nicht verfügbar, zum Beispiel im privaten Surfmodus. Dokumente können so nicht gespeichert werden. Öffne VoxDoc in einem normalen Safari-Fenster.',
  quota:
    'Der Speicher ist voll, die Änderung wurde nicht gespeichert. Bereits gespeicherte Dokumente bleiben erhalten. Lösche nicht mehr benötigte Dokumente oder gib auf dem iPhone Speicher frei und versuche es erneut.',
  blocked:
    'VoxDoc ist noch in einem anderen Tab geöffnet und blockiert ein Update der Datenbank. Schließe die anderen VoxDoc-Tabs und lade die Seite neu.',
  outdated:
    'VoxDoc wurde in einem anderen Tab aktualisiert. Bitte lade diese Seite neu, damit nichts verloren geht.',
  notFound: 'Dieses Dokument gibt es nicht mehr. Vielleicht wurde es gelöscht.',
  invalidBackup: 'Diese Datei ist keine gültige VoxDoc-Sicherung.',
  unknown: 'Beim Speichern ist ein Fehler aufgetreten. Deine Daten wurden nicht verändert. Versuche es erneut.',
};

export function classifyStorageError(error: unknown): StorageErrorCode {
  if (error instanceof StorageError) {
    return error.code;
  }
  const name = (error as { name?: string } | null)?.name ?? '';
  const message = String((error as { message?: string } | null)?.message ?? '');
  if (name === 'QuotaExceededError' || /quota|disk|space/i.test(message)) {
    return 'quota';
  }
  if (name === 'InvalidStateError' || name === 'SecurityError' || name === 'NotAllowedError') {
    return 'unavailable';
  }
  if (name === 'VersionError') {
    return 'outdated';
  }
  return 'unknown';
}

export function storageErrorMessage(error: unknown): string {
  return storageErrorMessages[classifyStorageError(error)];
}
