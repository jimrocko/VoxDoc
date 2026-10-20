export type OcrErrorCode =
  | 'offline'
  | 'download'
  | 'storage'
  | 'unsupported'
  | 'memory'
  | 'timeout'
  | 'noPages'
  | 'failed';

export class OcrError extends Error {
  constructor(
    readonly code: OcrErrorCode,
    cause?: unknown,
  ) {
    super(code, { cause });
    this.name = 'OcrError';
  }
}

/** Ungefähre Downloadgröße beim ersten Mal (Worker, Engine, deutsche Sprachdaten). */
export const DOWNLOAD_MB = 5;

export const ocrErrorMessages: Record<OcrErrorCode, string> = {
  offline: `Die Texterkennung braucht beim ersten Mal eine Internetverbindung, um die deutschen Sprachdaten zu laden (etwa ${DOWNLOAD_MB} MB). Danach funktioniert sie auch offline.`,
  download: 'Die Sprachdaten für die Texterkennung konnten nicht geladen werden. Prüfe die Internetverbindung und versuche es erneut.',
  storage: 'Auf dem iPhone ist nicht genug Speicherplatz für die Sprachdaten der Texterkennung. Gib Speicher frei und versuche es erneut.',
  unsupported: 'Dieser Browser unterstützt die Texterkennung nicht. Nötig ist Safari ab iOS 16 oder ein aktueller Browser.',
  memory: 'Die Texterkennung wurde abgebrochen, vermutlich weil der Arbeitsspeicher nicht reichte. Schließe andere Apps und versuche es erneut.',
  timeout: 'Die Texterkennung hat zu lange gedauert und wurde abgebrochen. Versuche es erneut.',
  noPages: 'Dieses Dokument hat keine Fotos, aus denen Text erkannt werden könnte.',
  failed: 'Bei der Texterkennung ist ein Fehler aufgetreten. Versuche es erneut.',
};

export function classifyOcrError(error: unknown): OcrErrorCode {
  if (error instanceof OcrError) {
    return error.code;
  }
  const name = (error as { name?: string } | null)?.name ?? '';
  const message = String((error as { message?: string } | null)?.message ?? error);
  if (name === 'QuotaExceededError') {
    return 'storage';
  }
  if (/out of memory|memory access out of bounds|cannot enlarge memory|Aborted\(|RangeError/i.test(`${name} ${message}`)) {
    return 'memory';
  }
  return 'failed';
}
