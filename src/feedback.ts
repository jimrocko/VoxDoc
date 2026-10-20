import { announce } from './a11y/announcer.ts';
import { isReaderActive, speak } from './audio/speech.ts';
import { playTone, type Tone } from './audio/tones.ts';
import { getSettings } from './storage/settings.ts';

export type StatusKind = 'info' | Tone;

/**
 * Akustische Statusmeldung: Ansage über VoiceOver (Live-Region), je nach
 * Einstellung mit Signalton und zusätzlicher eigener Sprachausgabe.
 * Sichtbare Statustexte in den Ansichten bleiben davon unberührt.
 */
export function status(message: string, kind: StatusKind = 'info'): void {
  // Während des Vorlesens keine Ansagen (z. B. von der Texterkennung im Hintergrund) –
  // VoiceOver würde sonst gleichzeitig sprechen. Der Ton bleibt.
  if (!isReaderActive()) {
    announce(message);
  }
  const { tones, speakStatus } = getSettings();
  if (tones && kind !== 'info') {
    playTone(kind);
  }
  if (speakStatus) {
    speak(message, { interrupt: false });
  }
}
