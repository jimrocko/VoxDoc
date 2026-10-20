import { isIos, isStandalone } from '../platform.ts';

/**
 * Spracherkennung über die Web Speech API. In iOS Safari heißt sie
 * `webkitSpeechRecognition` (ab iOS 14.5) und nutzt die Diktierfunktion von
 * Apple. Laut WebKit (Bug 225298) ist sie in Web-Apps auf dem Home-Bildschirm
 * nicht verfügbar – das lässt sich per Feature-Erkennung nicht feststellen,
 * deshalb wird der Home-Bildschirm-Modus auf iOS ausdrücklich ausgeschlossen.
 */

interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResultEvent extends Event {
  results: ArrayLike<ArrayLike<RecognitionAlternative> & { isFinal?: boolean }>;
}
interface RecognitionErrorEvent extends Event {
  error: string;
}
export interface RecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionConstructor = new () => RecognitionLike;

export type VoiceAvailability =
  | { available: true }
  | { available: false; reason: 'standalone' | 'unsupported' | 'insecure'; message: string };

function recognitionConstructor(): RecognitionConstructor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function voiceAvailability(): VoiceAvailability {
  if (isIos() && isStandalone()) {
    return {
      available: false,
      reason: 'standalone',
      message:
        'In der installierten App erlaubt iOS keine Spracherkennung für Webseiten. Öffne VoxDoc dafür in Safari – oder nutze das Befehlsfeld mit der Diktiertaste der Tastatur oder die iOS-Sprachsteuerung.',
    };
  }
  if (!window.isSecureContext) {
    return {
      available: false,
      reason: 'insecure',
      message: 'Die Spracherkennung funktioniert nur, wenn VoxDoc über HTTPS geöffnet wird.',
    };
  }
  if (!recognitionConstructor()) {
    return {
      available: false,
      reason: 'unsupported',
      message: 'Dieser Browser bietet keine Spracherkennung für Webseiten. Nutze das Befehlsfeld oder die iOS-Sprachsteuerung.',
    };
  }
  return { available: true };
}

export type ListenErrorCode =
  | 'not-allowed'
  | 'service-not-allowed'
  | 'network'
  | 'no-speech'
  | 'audio-capture'
  | 'language-not-supported'
  | 'aborted'
  | 'timeout'
  | 'unknown';

export class ListenError extends Error {
  constructor(readonly code: ListenErrorCode) {
    super(code);
    this.name = 'ListenError';
  }
}

export const listenErrorMessages: Record<ListenErrorCode, string> = {
  'not-allowed':
    'Der Zugriff auf das Mikrofon oder die Spracherkennung wurde nicht erlaubt. Erlaube ihn in Safari über das Seitenmenü in der Adressleiste unter „Website-Einstellungen“ › Mikrofon.',
  'service-not-allowed':
    'Die Spracherkennung ist auf diesem iPhone nicht verfügbar. Schalte unter Einstellungen › Allgemein › Tastatur die Diktierfunktion ein und öffne VoxDoc in Safari statt als App.',
  network: 'Die Spracherkennung hat keine Verbindung. Sie braucht je nach iPhone eine Internetverbindung.',
  'no-speech': 'Ich habe keinen Befehl gehört. Tippe erneut auf „Sprechen“ und sprich direkt danach.',
  'audio-capture': 'Es ist kein Mikrofon verfügbar.',
  'language-not-supported': 'Die Spracherkennung unterstützt Deutsch auf diesem Gerät nicht.',
  aborted: 'Zuhören abgebrochen.',
  timeout: 'Die Spracherkennung hat nicht geantwortet. Versuche es erneut oder nutze das Befehlsfeld.',
  unknown: 'Die Spracherkennung ist fehlgeschlagen. Versuche es erneut oder nutze das Befehlsfeld.',
};

const KNOWN_ERRORS = new Set<ListenErrorCode>([
  'not-allowed',
  'service-not-allowed',
  'network',
  'no-speech',
  'audio-capture',
  'language-not-supported',
  'aborted',
]);

/** Zeit bis zum Abbruch, wenn die Erkennung weder Ergebnis noch Fehler liefert. */
export const LISTEN_TIMEOUT_MS = 10_000;

export interface Listening {
  /** Alternativen der Erkennung, beste zuerst. */
  result: Promise<string[]>;
  abort(): void;
}

/**
 * Hört auf genau einen Befehl. Muss direkt aus einem Tippen heraus aufgerufen
 * werden – beim ersten Mal fragt iOS nach Mikrofon und Spracherkennung.
 */
export function listenOnce(create: () => RecognitionLike = () => new (recognitionConstructor()!)()): Listening {
  const recognition = create();
  recognition.lang = 'de-DE';
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 5;

  let settle: { resolve: (value: string[]) => void; reject: (error: ListenError) => void } | null = null;
  const result = new Promise<string[]>((resolve, reject) => {
    settle = { resolve, reject };
  });
  const finish = (value: string[] | ListenError): void => {
    if (!settle) {
      return;
    }
    const { resolve, reject } = settle;
    settle = null;
    clearTimeout(timer);
    if (value instanceof ListenError) {
      reject(value);
    } else {
      resolve(value);
    }
  };

  recognition.addEventListener('result', (event) => {
    const results = (event as RecognitionResultEvent).results;
    const first = results[0];
    const alternatives: string[] = [];
    for (let i = 0; first && i < first.length; i++) {
      const transcript = first[i]?.transcript.trim();
      if (transcript) {
        alternatives.push(transcript);
      }
    }
    finish(alternatives.length > 0 ? alternatives : new ListenError('no-speech'));
  });
  recognition.addEventListener('error', (event) => {
    const code = (event as RecognitionErrorEvent).error as ListenErrorCode;
    finish(new ListenError(KNOWN_ERRORS.has(code) ? code : 'unknown'));
  });
  // Ende ohne Ergebnis: nichts verstanden.
  recognition.addEventListener('end', () => finish(new ListenError('no-speech')));

  const timer = setTimeout(() => {
    recognition.abort();
    finish(new ListenError('timeout'));
  }, LISTEN_TIMEOUT_MS);

  try {
    recognition.start();
  } catch {
    finish(new ListenError('unknown'));
  }

  return {
    result,
    abort: () => {
      recognition.abort();
      finish(new ListenError('aborted'));
    },
  };
}
