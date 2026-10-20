import { getSettings } from '../storage/settings.ts';

/** Vorlesen über die Web Speech API (auf iOS ab Safari 7 verfügbar). */
export const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

export function germanVoices(): SpeechSynthesisVoice[] {
  if (!speechSupported) {
    return [];
  }
  return speechSynthesis
    .getVoices()
    .filter((voice) => voice.lang.toLowerCase().startsWith('de'))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/** Stimmen werden auf iOS verzögert geladen. */
export function onVoicesChanged(listener: () => void): () => void {
  if (!speechSupported) {
    return () => {};
  }
  speechSynthesis.addEventListener('voiceschanged', listener);
  return () => speechSynthesis.removeEventListener('voiceschanged', listener);
}

/** Solange der Dokument-Leser spricht, gehört ihm die Sprachausgabe allein. */
let readerActive = false;

export function setReaderActive(active: boolean): void {
  readerActive = active;
}

export function isReaderActive(): boolean {
  return readerActive;
}

export function selectedVoice(voiceURI: string): SpeechSynthesisVoice | undefined {
  return voiceURI ? germanVoices().find((voice) => voice.voiceURI === voiceURI) : undefined;
}

interface SpeakOptions {
  /** Laufende Ausgabe abbrechen (Standard) oder hinten anstellen. */
  interrupt?: boolean;
  onEnd?: () => void;
}

export function speak(text: string, { interrupt = true, onEnd }: SpeakOptions = {}): boolean {
  if (!speechSupported || !text.trim() || readerActive) {
    return false;
  }
  const { speechRate, voiceURI } = getSettings();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'de-DE';
  utterance.rate = speechRate;
  const voice = selectedVoice(voiceURI);
  if (voice) {
    utterance.voice = voice;
  }
  if (onEnd) {
    utterance.addEventListener('end', onEnd);
    utterance.addEventListener('error', onEnd);
  }
  if (interrupt) {
    speechSynthesis.cancel();
  }
  speechSynthesis.speak(utterance);
  return true;
}

/**
 * iOS gibt die Sprachausgabe erst nach einer Benutzeraktion frei. Eine leere
 * Ausgabe beim ersten Tippen schaltet sie für spätere Statusmeldungen frei.
 */
export function unlockSpeech(): void {
  if (speechSupported && !speechSynthesis.speaking) {
    const utterance = new SpeechSynthesisUtterance('');
    utterance.volume = 0;
    speechSynthesis.speak(utterance);
  }
}
