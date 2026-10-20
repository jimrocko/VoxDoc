export type Theme = 'dark' | 'light' | 'system';
export type LibrarySort = 'newest' | 'oldest' | 'title';

export interface Settings {
  theme: Theme;
  /** Sprechtempo für das Vorlesen, 1 = normal. */
  speechRate: number;
  /** `voiceURI` der gewählten Stimme, leer = Standardstimme. */
  voiceURI: string;
  /** Kurze Töne bei Erfolg und Fehler. */
  tones: boolean;
  /** Statusmeldungen zusätzlich selbst vorlesen (für Nutzung ohne VoiceOver). */
  speakStatus: boolean;
  /** Beim Springen zwischen Absätzen „Absatz 3 von 5“ ansagen. */
  announceParagraphs: boolean;
  /** Scanner löst aus, sobald das Blatt ruhig und vollständig im Bild ist. */
  autoCapture: boolean;
  /** Nach dem Scannen automatisch Text erkennen. */
  autoOcr: boolean;
  /** Spracherkennung von Safari für Sprachbefehle nutzen (Zustimmung nötig, siehe Befehlsfenster). */
  voiceRecognition: boolean;
  librarySort: LibrarySort;
}

export const SPEECH_RATE_MIN = 0.5;
export const SPEECH_RATE_MAX = 2;

export const defaults: Settings = {
  theme: 'dark',
  speechRate: 1,
  voiceURI: '',
  tones: true,
  speakStatus: false,
  announceParagraphs: true,
  autoCapture: true,
  autoOcr: true,
  voiceRecognition: false,
  librarySort: 'newest',
};

const KEY = 'voxdoc.settings';

function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

/** Übernimmt nur gültige Werte; alles andere fällt auf den Standard zurück. */
export function sanitize(raw: unknown): Settings {
  const input = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const rate = Number(input.speechRate);
  return {
    theme: oneOf(input.theme, ['dark', 'light', 'system'], defaults.theme),
    speechRate: Number.isFinite(rate)
      ? Math.min(SPEECH_RATE_MAX, Math.max(SPEECH_RATE_MIN, rate))
      : defaults.speechRate,
    voiceURI: typeof input.voiceURI === 'string' ? input.voiceURI : defaults.voiceURI,
    tones: typeof input.tones === 'boolean' ? input.tones : defaults.tones,
    speakStatus: typeof input.speakStatus === 'boolean' ? input.speakStatus : defaults.speakStatus,
    announceParagraphs:
      typeof input.announceParagraphs === 'boolean' ? input.announceParagraphs : defaults.announceParagraphs,
    autoCapture: typeof input.autoCapture === 'boolean' ? input.autoCapture : defaults.autoCapture,
    autoOcr: typeof input.autoOcr === 'boolean' ? input.autoOcr : defaults.autoOcr,
    voiceRecognition: typeof input.voiceRecognition === 'boolean' ? input.voiceRecognition : defaults.voiceRecognition,
    librarySort: oneOf(input.librarySort, ['newest', 'oldest', 'title'], defaults.librarySort),
  };
}

let current: Settings | null = null;
const listeners = new Set<(settings: Settings) => void>();

export function getSettings(): Settings {
  if (!current) {
    try {
      current = sanitize(JSON.parse(localStorage.getItem(KEY) ?? '{}'));
    } catch {
      current = { ...defaults };
    }
  }
  return current;
}

export function updateSettings(changes: Partial<Settings>): Settings {
  current = sanitize({ ...getSettings(), ...changes });
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Privater Modus o. Ä.: Einstellungen gelten nur für diese Sitzung.
  }
  for (const listener of listeners) {
    listener(current);
  }
  return current;
}

export function onSettingsChange(listener: (settings: Settings) => void): void {
  listeners.add(listener);
}
