import { frameDifference, type Analysis } from './analyze.ts';

export type HintKey =
  | 'dark'
  | 'noDocument'
  | 'tooClose'
  | 'tooFar'
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'moving'
  | 'ready'
  | 'next';

/**
 * „Oben“ meint die Oberkante des iPhones: Bei flach gehaltenem Gerät im
 * Hochformat entspricht der obere Bildrand der Richtung, in die die Oberkante zeigt.
 */
export const hintMessages: Record<HintKey, string> = {
  dark: 'Zu dunkel. Sorge für mehr Licht.',
  noDocument: 'Kein Dokument zu sehen. Halte das iPhone flach über das Blatt.',
  tooClose: 'Zu nah. Hebe das iPhone etwas an.',
  tooFar: 'Zu weit weg. Gehe mit dem iPhone näher heran.',
  left: 'Bewege das iPhone etwas nach links.',
  right: 'Bewege das iPhone etwas nach rechts.',
  up: 'Bewege das iPhone etwas in Richtung Oberkante.',
  down: 'Bewege das iPhone etwas in Richtung Unterkante.',
  moving: 'Halte das iPhone ruhig.',
  ready: 'Dokument erkannt. Ruhig halten.',
  next: 'Lege die nächste Seite hin.',
};

export const readyManualMessage = 'Dokument erkannt. Jetzt aufnehmen.';

/** Ein erkanntes Blatt muss mindestens so hell sein. */
const DARK_PAPER = 90;
/** Ohne Blatt nur bei fast schwarzem Bild (z. B. verdeckte Linse) – ein dunkler Tisch ist kein Lichtmangel. */
const DARK_SCENE = 35;
const TOO_CLOSE_COVERAGE = 0.9;
/** Unterhalb davon reicht die Auflösung eines Videobilds nicht für die Texterkennung (gemessen mit 11-pt-Schrift: bei 55 % Fläche vollständig, bei 34 % lückenhaft erkannt). */
const TOO_FAR_COVERAGE = 0.45;
const OFF_CENTER = 0.12;
/** Mittlere Helligkeitsänderung zwischen zwei Analysebildern, ab der es „wackelt“. */
const MOTION = 8;
/** So stark muss sich das Bild nach einer Aufnahme ändern, bevor automatisch weiter aufgenommen wird. */
const SCENE_CHANGE = 20;

/** Hinweis muss so lange gleich bleiben, bevor er angesagt wird (kein Flackern). */
export const SETTLE_MS = 700;
/** Mindestabstand zwischen zwei Ansagen. */
export const MIN_GAP_MS = 1500;
/** Unveränderte Hinweise werden in diesem Abstand wiederholt. */
export const REPEAT_MS = 6000;
/** So lange muss das Bild gut sein, bevor automatisch ausgelöst wird. */
export const AUTO_CAPTURE_MS = 1500;
export const TICK_MS = 500;
/** Pause nach einer Aufnahme. */
export const COOLDOWN_MS = 2000;

export function hintFor(analysis: Analysis, motion: number): HintKey {
  const { document, coverage, cutOff, offsetX, offsetY } = analysis;
  // Ein dunkler Untergrund ist erwünscht – „zu dunkel“ richtet sich nach dem Blatt.
  if (!document) {
    return analysis.highlights < DARK_SCENE ? 'dark' : 'noDocument';
  }
  if (analysis.paperBrightness < DARK_PAPER) {
    return 'dark';
  }
  const cut = [cutOff.left, cutOff.right, cutOff.top, cutOff.bottom].filter(Boolean).length;
  if (coverage > TOO_CLOSE_COVERAGE || cut >= 2) {
    return 'tooClose';
  }
  // Ragt das Blatt links aus dem Bild, liegt es links vom iPhone.
  if (cutOff.left) return 'left';
  if (cutOff.right) return 'right';
  if (cutOff.top) return 'up';
  if (cutOff.bottom) return 'down';
  if (Math.max(Math.abs(offsetX), Math.abs(offsetY)) > OFF_CENTER) {
    if (Math.abs(offsetX) >= Math.abs(offsetY)) {
      return offsetX < 0 ? 'left' : 'right';
    }
    return offsetY < 0 ? 'up' : 'down';
  }
  if (coverage < TOO_FAR_COVERAGE) {
    return 'tooFar';
  }
  if (motion > MOTION) {
    return 'moving';
  }
  return 'ready';
}

export interface GuideUpdate {
  hint: HintKey;
  message: string;
  /** Text zum Ansagen, wenn jetzt angesagt werden soll. */
  announce: string | null;
  /** Kurzer Takt-Ton während der automatischen Auslösung. */
  tick: boolean;
  /** Jetzt automatisch aufnehmen. */
  capture: boolean;
}

export class Guide {
  autoCapture: boolean;
  private previous: Uint8Array | null = null;
  private current: HintKey | null = null;
  private since = 0;
  private lastAnnounced: HintKey | null = null;
  private lastAnnounceAt = -Infinity;
  private readySince: number | null = null;
  private lastTick = -Infinity;
  private armed = true;
  private captured: Uint8Array | null = null;
  private cooldownUntil = 0;

  constructor(autoCapture: boolean) {
    this.autoCapture = autoCapture;
  }

  update(analysis: Analysis, now: number): GuideUpdate {
    const motion = this.previous ? frameDifference(this.previous, analysis.luma) : 0;
    this.previous = analysis.luma;
    let hint = hintFor(analysis, motion);

    if (!this.armed) {
      const changed =
        hint === 'noDocument' || !this.captured || frameDifference(this.captured, analysis.luma) > SCENE_CHANGE;
      if (now >= this.cooldownUntil && changed) {
        this.armed = true;
      } else if (hint === 'ready') {
        hint = 'next';
      }
    }

    if (hint !== this.current) {
      this.current = hint;
      this.since = now;
    }

    let tick = false;
    let capture = false;
    if (this.autoCapture && hint === 'ready') {
      this.readySince ??= now;
      if (now - this.readySince >= AUTO_CAPTURE_MS) {
        capture = true;
        this.readySince = null;
      } else if (now - this.lastTick >= TICK_MS) {
        tick = true;
        this.lastTick = now;
      }
    } else {
      this.readySince = null;
    }

    const message = hint === 'ready' && !this.autoCapture ? readyManualMessage : hintMessages[hint];
    return { hint, message, announce: this.shouldAnnounce(hint, now) ? message : null, tick, capture };
  }

  /** Nach jeder Aufnahme: erst weiter automatisch aufnehmen, wenn eine neue Seite daliegt. */
  markCaptured(luma: Uint8Array | null, now: number): void {
    this.armed = false;
    this.captured = luma;
    this.cooldownUntil = now + COOLDOWN_MS;
    this.readySince = null;
    // Die Aufnahme selbst wurde angesagt; der nächste Hinweis darf nicht sofort folgen.
    this.lastAnnounceAt = now;
    this.lastAnnounced = 'ready';
  }

  private shouldAnnounce(hint: HintKey, now: number): boolean {
    if (now - this.since < SETTLE_MS || now - this.lastAnnounceAt < MIN_GAP_MS) {
      return false;
    }
    const repeat = hint === this.lastAnnounced;
    // „Bereit“ und „nächste Seite“ nur einmal ansagen – danach übernehmen Töne bzw. die Ruhe.
    if (repeat && (hint === 'ready' || hint === 'next' || now - this.lastAnnounceAt < REPEAT_MS)) {
      return false;
    }
    this.lastAnnounced = hint;
    this.lastAnnounceAt = now;
    return true;
  }
}
