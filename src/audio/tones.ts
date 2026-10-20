export type Tone = 'success' | 'error' | 'start' | 'tick' | 'shutter';

/** Frequenzfolgen in Hz: aufsteigend = Erfolg, tief = Fehler. */
const sequences: Record<Tone, number[]> = {
  success: [660, 880],
  error: [330, 220],
  start: [520],
  /** Takt während der automatischen Auslösung. */
  tick: [990],
  /** Auslöser: kurz absteigend wie eine Kamera. */
  shutter: [1320, 880],
};

const NOTE_SECONDS = 0.09;
const TICK_SECONDS = 0.04;
const VOLUME = 0.15;

let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (!context && typeof AudioContext !== 'undefined') {
    context = new AudioContext();
  }
  return context;
}

/** Muss in einer Benutzeraktion aufgerufen werden, sonst bleibt iOS stumm. */
export function unlockAudio(): void {
  const ctx = audioContext();
  if (ctx?.state === 'suspended') {
    void ctx.resume();
  }
}

export function playTone(tone: Tone): void {
  const ctx = audioContext();
  if (!ctx || ctx.state !== 'running') {
    return;
  }
  let start = ctx.currentTime;
  const length = tone === 'tick' || tone === 'shutter' ? TICK_SECONDS : NOTE_SECONDS;
  for (const frequency of sequences[tone]) {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    // Kurzes Ein- und Ausblenden verhindert Knacken.
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(VOLUME, start + 0.01);
    gain.gain.linearRampToValueAtTime(0, start + length);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + length);
    start += length + 0.02;
  }
}
