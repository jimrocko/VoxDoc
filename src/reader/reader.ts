import { SPEECH_RATE_MAX, SPEECH_RATE_MIN } from '../storage/settings.ts';
import { splitChunks, type Chunk } from './text.ts';

/** Das, was der Leser von `window.speechSynthesis` braucht – im Test ersetzbar. */
export interface SynthLike {
  speak(utterance: SpeechSynthesisUtterance): void;
  cancel(): void;
  resume(): void;
  readonly speaking: boolean;
  readonly paused: boolean;
}

export type ReaderState = 'idle' | 'playing' | 'paused' | 'finished';

export interface ReaderSnapshot {
  state: ReaderState;
  /** Aktueller Absatz, ab 0. */
  paragraph: number;
  total: number;
  rate: number;
  /** Ruht, steht aber nicht am Anfang – „Weiterlesen“ ist möglich. */
  resumable: boolean;
}

/** Leseposition zum Speichern: Absatz und Zeichenposition darin. */
export interface ReaderPosition {
  paragraph: number;
  offset: number;
  finished: boolean;
}

export interface ReaderOptions {
  synth: SynthLike;
  createUtterance: (text: string) => SpeechSynthesisUtterance;
  voice?: () => SpeechSynthesisVoice | undefined;
  rate: number;
  /** Bei Absatzsprüngen „Absatz 3 von 5“ voranstellen. */
  announceParagraphs: boolean;
  onChange: (snapshot: ReaderSnapshot) => void;
  onFinish?: () => void;
  onError?: (message: string) => void;
  /** Vor dem ersten bzw. nach dem letzten Absatz gibt es nichts mehr. */
  onEdge?: (edge: 'first' | 'last') => void;
  /** Gespeicherte Position, an der „Weiterlesen“ beginnt. */
  start?: { paragraph: number; offset: number } | null;
  /** Meldet die Position bei Pause, Absatzwechsel, Ende und Verlassen – zum Speichern. */
  onPosition?: (position: ReaderPosition) => void;
}

/** Bis dahin muss `start` kommen, sonst wird es erneut versucht. */
export const START_TIMEOUT_MS = 3000;
/** Safari verschluckt `speak()` direkt nach `cancel()` gelegentlich. */
export const RESTART_DELAY_MS = 80;
/** Grobe Sprechgeschwindigkeit bei Tempo 1 für den Watchdog. */
const CHARS_PER_SECOND = 14;
const WATCHDOG_SLACK_MS = 5000;

const IGNORED_ERRORS = new Set(['interrupted', 'canceled']);

export function rateLabel(rate: number): string {
  return rate === 1 ? 'normal' : `${rate.toLocaleString('de-DE', { minimumFractionDigits: 1 })}-fach`;
}

/**
 * Vorlesen mit Absatz-Navigation.
 *
 * Bewusst ohne `speechSynthesis.pause()`/`resume()`: Beides ist in iOS Safari
 * unzuverlässig (Fortsetzen bleibt stumm oder beginnt von vorn). Stattdessen
 * merkt sich der Leser über `boundary`-Ereignisse das zuletzt gesprochene Wort,
 * bricht ab und spricht beim Fortsetzen ab dieser Stelle neu.
 *
 * Jede Äußerung bekommt eine Generation. Ereignisse abgebrochener Äußerungen
 * (Safari meldet `end` teils noch nach dem nächsten `speak()`) werden ignoriert.
 */
export class Reader {
  private readonly chunks: Chunk[][];
  private state: ReaderState = 'idle';
  private paragraph = 0;
  private chunk = 0;
  /** Zeichenposition innerhalb des aktuellen Abschnitts. */
  private offset = 0;
  private rate: number;
  private generation = 0;
  private retried = false;
  /** Referenz halten – sonst kann die Äußerung samt Ereignissen verloren gehen. */
  private utterance: SpeechSynthesisUtterance | null = null;
  private startTimer: ReturnType<typeof setTimeout> | undefined;
  private watchdog: ReturnType<typeof setTimeout> | undefined;
  private restartTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    paragraphs: readonly string[],
    private readonly options: ReaderOptions,
  ) {
    this.chunks = paragraphs.map((text) => splitChunks(text)).filter((chunks) => chunks.length > 0);
    const start = options.start;
    if (start && start.paragraph >= 0 && start.paragraph < this.chunks.length) {
      // Am Anfang des Satzes weiterlesen, in dem zuletzt gelesen wurde – das ist nach einer Pause verständlicher.
      const chunks = this.chunks[start.paragraph]!;
      this.paragraph = start.paragraph;
      this.chunk = Math.max(0, chunks.findLastIndex((chunk) => chunk.start <= start.offset));
    }
    this.rate = clampRate(options.rate);
  }

  /** Text der laufenden Äußerung, sonst `null`. */
  get currentText(): string | null {
    return this.utterance?.text ?? null;
  }

  get snapshot(): ReaderSnapshot {
    return {
      state: this.state,
      paragraph: this.paragraph,
      total: this.chunks.length,
      rate: this.rate,
      resumable: this.state === 'idle' && (this.paragraph > 0 || this.chunk > 0 || this.offset > 0),
    };
  }

  get position(): ReaderPosition {
    const chunk = this.chunks[this.paragraph]?.[this.chunk];
    return {
      paragraph: this.paragraph,
      offset: (chunk?.start ?? 0) + this.offset,
      finished: this.state === 'finished',
    };
  }

  /** Von vorn beginnen, egal wo gerade gelesen wird. */
  restart(): void {
    this.jumpTo(0);
  }

  private reportPosition(): void {
    this.options.onPosition?.(this.position);
  }

  /** Startet, setzt nach einer Pause fort oder beginnt nach dem Ende von vorn. */
  play(): void {
    if (this.chunks.length === 0 || this.state === 'playing') {
      return;
    }
    if (this.state === 'finished') {
      this.moveTo(0);
    }
    this.speakCurrent();
  }

  pause(): void {
    if (this.state !== 'playing') {
      return;
    }
    this.halt();
    this.setState('paused');
    this.reportPosition();
  }

  toggle(): void {
    if (this.state === 'playing') {
      this.pause();
    } else {
      this.play();
    }
  }

  /** Beendet das Vorlesen; der nächste Start beginnt am Anfang. */
  stop(): void {
    this.halt();
    this.moveTo(0);
    this.setState('idle');
    this.reportPosition();
  }

  next(): void {
    if (this.paragraph >= this.chunks.length - 1) {
      this.options.onEdge?.('last');
      return;
    }
    this.jumpTo(this.paragraph + 1);
  }

  previous(): void {
    if (this.paragraph === 0) {
      this.options.onEdge?.('first');
    }
    this.jumpTo(Math.max(0, this.paragraph - 1));
  }

  repeat(): void {
    this.jumpTo(this.paragraph);
  }

  /** Neues Tempo; beim Vorlesen wird ab dem aktuellen Wort mit dem neuen Tempo fortgesetzt. */
  setRate(rate: number): number {
    this.rate = clampRate(rate);
    if (this.state === 'playing') {
      this.speakCurrent(`Tempo ${rateLabel(this.rate)}.`);
    } else {
      this.emit();
    }
    return this.rate;
  }

  destroy(): void {
    if (this.state === 'playing' || this.state === 'paused') {
      this.reportPosition();
    }
    this.halt();
    this.state = 'idle';
  }

  // ---------- intern ----------

  /** Springt zu einem Absatz und sagt dabei `announcement` an (z. B. „Seite 2 von 3.“). */
  goToParagraph(paragraph: number, announcement: string): void {
    if (paragraph < 0 || paragraph >= this.chunks.length) {
      return;
    }
    this.moveTo(paragraph);
    this.reportPosition();
    this.retried = false;
    this.speakCurrent(announcement);
  }

  private jumpTo(paragraph: number): void {
    if (this.chunks.length === 0) {
      return;
    }
    this.moveTo(paragraph);
    this.reportPosition();
    this.retried = false;
    this.speakCurrent(this.options.announceParagraphs ? `Absatz ${paragraph + 1} von ${this.chunks.length}.` : '');
  }

  private moveTo(paragraph: number): void {
    this.paragraph = paragraph;
    this.chunk = 0;
    this.offset = 0;
  }

  /** Bricht die laufende Äußerung ab und macht ihre Ereignisse wirkungslos. */
  private halt(): void {
    this.generation++;
    clearTimeout(this.startTimer);
    clearTimeout(this.watchdog);
    clearTimeout(this.restartTimer);
    this.utterance = null;
    this.options.synth.cancel();
  }

  private speakCurrent(prefix = ''): void {
    const busy = this.options.synth.speaking;
    this.halt();
    const generation = this.generation;
    this.setState('playing');
    if (busy) {
      this.restartTimer = setTimeout(() => this.utter(generation, prefix), RESTART_DELAY_MS);
    } else {
      // Synchron, damit iOS den Aufruf noch der Benutzeraktion zuordnet.
      this.utter(generation, prefix);
    }
  }

  private utter(generation: number, prefix: string): void {
    if (generation !== this.generation) {
      return;
    }
    const chunk = this.chunks[this.paragraph]?.[this.chunk];
    if (!chunk) {
      this.finish();
      return;
    }
    const body = chunk.text.slice(this.offset);
    const text = prefix ? `${prefix} ${body}` : body;
    const prefixLength = prefix ? prefix.length + 1 : 0;
    const baseOffset = this.offset;
    const { synth } = this.options;

    const utterance = this.options.createUtterance(text);
    utterance.lang = 'de-DE';
    utterance.rate = this.rate;
    const voice = this.options.voice?.();
    if (voice) {
      utterance.voice = voice;
    }

    const current = (): boolean => generation === this.generation;
    utterance.addEventListener('start', () => {
      if (current()) {
        clearTimeout(this.startTimer);
        this.retried = false;
        this.armWatchdog(generation, text.length);
      }
    });
    utterance.addEventListener('boundary', (event) => {
      if (!current()) {
        return;
      }
      const index = (event as SpeechSynthesisEvent).charIndex;
      if (index - prefixLength >= 0) {
        this.offset = baseOffset + index - prefixLength;
      }
      this.armWatchdog(generation, text.length - index);
    });
    utterance.addEventListener('end', () => {
      if (current()) {
        this.advance();
      }
    });
    utterance.addEventListener('error', (event) => {
      if (current() && !IGNORED_ERRORS.has((event as SpeechSynthesisErrorEvent).error)) {
        this.fail(prefix);
      }
    });

    this.utterance = utterance;
    // Vor `speak()` setzen: Manche Engines melden `start` noch während des Aufrufs.
    this.startTimer = setTimeout(() => {
      if (!current()) {
        return;
      }
      if (synth.speaking) {
        // Spricht, hat aber `start` nicht gemeldet – weiter beobachten.
        this.armWatchdog(generation, text.length);
      } else {
        this.fail(prefix);
      }
    }, START_TIMEOUT_MS);

    if (synth.paused) {
      // Falls jemand anderes pausiert hat, bliebe die Warteschlange sonst stehen.
      synth.resume();
    }
    synth.speak(utterance);
  }

  /** Erkennt ein ausbleibendes `end` (kommt in Safari gelegentlich vor). */
  private armWatchdog(generation: number, remainingChars: number): void {
    clearTimeout(this.watchdog);
    const expected = (remainingChars / (CHARS_PER_SECOND * this.rate)) * 1000;
    this.watchdog = setTimeout(
      () => {
        if (generation !== this.generation) {
          return;
        }
        if (this.options.synth.speaking) {
          this.armWatchdog(generation, remainingChars);
        } else {
          this.advance();
        }
      },
      expected * 2 + WATCHDOG_SLACK_MS,
    );
  }

  private advance(): void {
    clearTimeout(this.startTimer);
    clearTimeout(this.watchdog);
    this.offset = 0;
    const chunks = this.chunks[this.paragraph] ?? [];
    if (this.chunk + 1 < chunks.length) {
      this.chunk++;
    } else if (this.paragraph + 1 < this.chunks.length) {
      this.moveTo(this.paragraph + 1);
      this.emit();
      this.reportPosition();
    } else {
      this.finish();
      return;
    }
    this.generation++;
    this.utter(this.generation, '');
  }

  private finish(): void {
    this.halt();
    this.setState('finished');
    this.options.onFinish?.();
    this.reportPosition();
  }

  private fail(prefix: string): void {
    if (!this.retried) {
      this.retried = true;
      this.speakCurrent(prefix);
      return;
    }
    this.retried = false;
    this.halt();
    this.setState('paused');
    this.options.onError?.(
      'Die Sprachausgabe reagiert nicht. Tippe auf „Fortsetzen“, um es erneut zu versuchen.',
    );
  }

  private setState(state: ReaderState): void {
    this.state = state;
    this.emit();
  }

  private emit(): void {
    this.options.onChange(this.snapshot);
  }
}

function clampRate(rate: number): number {
  return Math.round(Math.min(SPEECH_RATE_MAX, Math.max(SPEECH_RATE_MIN, rate)) * 10) / 10;
}
