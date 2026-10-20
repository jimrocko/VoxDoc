import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Reader, RESTART_DELAY_MS, START_TIMEOUT_MS, type ReaderOptions, type SynthLike } from '../src/reader/reader.ts';

class FakeUtterance extends EventTarget {
  lang = '';
  rate = 1;
  voice: unknown = null;
  constructor(public text: string) {
    super();
  }
}

/** Ahmt WebKit nach: `cancel()` meldet für die abgebrochene Äußerung noch `end`. */
class FakeSynth implements SynthLike {
  queue: FakeUtterance[] = [];
  spoken: FakeUtterance[] = [];
  speaking = false;
  paused = false;
  cancels = 0;
  /** `speak()` wird stillschweigend verworfen (kommt in Safari vor). */
  drop = false;

  speak(utterance: SpeechSynthesisUtterance): void {
    const u = utterance as unknown as FakeUtterance;
    this.spoken.push(u);
    if (this.drop) {
      return;
    }
    this.queue.push(u);
    if (this.queue.length === 1) {
      this.begin();
    }
  }

  cancel(): void {
    this.cancels++;
    const cancelled = this.queue;
    this.queue = [];
    this.speaking = false;
    for (const u of cancelled) {
      u.dispatchEvent(new Event('end'));
    }
  }

  resume(): void {
    this.paused = false;
  }

  get current(): FakeUtterance | undefined {
    return this.queue[0];
  }

  boundary(charIndex: number): void {
    this.current?.dispatchEvent(Object.assign(new Event('boundary'), { charIndex, name: 'word' }));
  }

  finish(): void {
    const u = this.queue.shift();
    this.speaking = false;
    u?.dispatchEvent(new Event('end'));
    this.begin();
  }

  /** Äußerung endet, aber `end` geht verloren. */
  loseEnd(): void {
    this.queue.shift();
    this.speaking = false;
  }

  private begin(): void {
    const u = this.queue[0];
    if (u) {
      this.speaking = true;
      u.dispatchEvent(new Event('start'));
    }
  }
}

let synth: FakeSynth;
let events: { finish: number; errors: string[]; edges: string[] };

function createReader(paragraphs: string[], options: Partial<ReaderOptions> = {}): Reader {
  return new Reader(paragraphs, {
    synth,
    createUtterance: (text) => new FakeUtterance(text) as unknown as SpeechSynthesisUtterance,
    rate: 1,
    announceParagraphs: true,
    onChange: () => {},
    onFinish: () => events.finish++,
    onError: (message) => events.errors.push(message),
    onEdge: (edge) => events.edges.push(edge),
    ...options,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  synth = new FakeSynth();
  events = { finish: 0, errors: [], edges: [] };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Reader', () => {
  it('liest alle Absätze nacheinander und meldet das Ende', () => {
    const states: string[] = [];
    const reader = createReader(['Erster Absatz.', 'Zweiter Absatz.'], {
      onChange: (s) => states.push(`${s.state}:${s.paragraph}`),
    });
    reader.play();
    expect(reader.currentText).toBe('Erster Absatz.');
    expect(synth.current?.lang).toBe('de-DE');
    synth.finish();
    expect(reader.currentText).toBe('Zweiter Absatz.');
    expect(reader.snapshot).toMatchObject({ state: 'playing', paragraph: 1, total: 2 });
    synth.finish();
    expect(reader.snapshot.state).toBe('finished');
    expect(events.finish).toBe(1);
    expect(states).toEqual(['playing:0', 'playing:1', 'finished:1']);
  });

  it('liest lange Absätze in Abschnitten, ohne den Absatz zu wechseln', () => {
    const long = Array.from({ length: 8 }, (_, i) => `Das ist der ausführliche Satz Nummer ${i + 1} in diesem Absatz.`).join(' ');
    const reader = createReader([long, 'Ende.']);
    reader.play();
    let parts = 0;
    while (reader.snapshot.paragraph === 0 && reader.snapshot.state === 'playing') {
      expect(reader.currentText!.length).toBeLessThanOrEqual(220);
      synth.finish();
      parts++;
    }
    expect(parts).toBeGreaterThan(1);
    expect(reader.currentText).toBe('Ende.');
  });

  it('setzt nach einer Pause beim zuletzt gesprochenen Wort fort', () => {
    const reader = createReader(['Erster Absatz mit mehreren Wörtern.']);
    reader.play();
    synth.boundary(14); // „mit“
    reader.pause();
    expect(reader.snapshot.state).toBe('paused');
    expect(synth.speaking).toBe(false);
    reader.play();
    expect(reader.currentText).toBe('mit mehreren Wörtern.');
    synth.boundary(4); // „mehreren“ in der neuen Äußerung
    reader.pause();
    reader.toggle();
    expect(reader.currentText).toBe('mehreren Wörtern.');
  });

  it('ignoriert verspätete Ereignisse abgebrochener Äußerungen', () => {
    const reader = createReader(['Eins.', 'Zwei.', 'Drei.'], { announceParagraphs: false });
    reader.play();
    const old = synth.current!;
    reader.next();
    vi.advanceTimersByTime(RESTART_DELAY_MS);
    expect(reader.currentText).toBe('Zwei.');
    old.dispatchEvent(new Event('end'));
    old.dispatchEvent(Object.assign(new Event('error'), { error: 'synthesis-failed' }));
    expect(reader.snapshot).toMatchObject({ state: 'playing', paragraph: 1 });
    expect(reader.currentText).toBe('Zwei.');
  });

  it('springt mit Absatzansage und ignoriert Wortgrenzen in der Ansage', () => {
    const reader = createReader(['Eins.', 'Zweiter Absatz hier.', 'Drei.']);
    reader.play();
    reader.next();
    vi.advanceTimersByTime(RESTART_DELAY_MS);
    const prefix = 'Absatz 2 von 3. ';
    expect(reader.currentText).toBe(`${prefix}Zweiter Absatz hier.`);
    synth.boundary(3);
    reader.pause();
    reader.play();
    expect(reader.currentText).toBe('Zweiter Absatz hier.');
    synth.boundary(8);
    reader.repeat();
    vi.advanceTimersByTime(RESTART_DELAY_MS);
    expect(reader.currentText).toBe(`${prefix}Zweiter Absatz hier.`);
    reader.previous();
    vi.advanceTimersByTime(RESTART_DELAY_MS);
    expect(reader.currentText).toBe('Absatz 1 von 3. Eins.');
  });

  it('meldet Anfang und Ende der Absätze', () => {
    const reader = createReader(['Eins.', 'Zwei.'], { announceParagraphs: false });
    reader.previous();
    expect(events.edges).toEqual(['first']);
    expect(reader.currentText).toBe('Eins.');
    reader.next();
    vi.advanceTimersByTime(RESTART_DELAY_MS);
    reader.next();
    expect(events.edges).toEqual(['first', 'last']);
    expect(reader.currentText).toBe('Zwei.');
  });

  it('übernimmt ein neues Tempo sofort ab dem aktuellen Wort', () => {
    const reader = createReader(['Ein Satz zum Testen.']);
    reader.play();
    synth.boundary(9);
    expect(reader.setRate(1.5)).toBe(1.5);
    vi.advanceTimersByTime(RESTART_DELAY_MS);
    expect(reader.currentText).toBe('Tempo 1,5-fach. zum Testen.');
    expect(synth.current?.rate).toBe(1.5);
    expect(reader.setRate(7)).toBe(2);
    expect(reader.setRate(0.1)).toBe(0.5);
  });

  it('ändert das Tempo ohne Vorlesen nur intern', () => {
    const reader = createReader(['Text.']);
    reader.setRate(1.2);
    expect(synth.spoken).toHaveLength(0);
    reader.play();
    expect(synth.current?.rate).toBe(1.2);
  });

  it('macht weiter, wenn Safari das Ende nicht meldet', () => {
    const reader = createReader(['Eins.', 'Zwei.']);
    reader.play();
    synth.loseEnd();
    vi.advanceTimersByTime(10_000);
    expect(reader.snapshot.paragraph).toBe(1);
    expect(reader.currentText).toBe('Zwei.');
  });

  it('wartet, solange die Stimme noch spricht', () => {
    const reader = createReader(['Eins.', 'Zwei.']);
    reader.play();
    vi.advanceTimersByTime(60_000);
    expect(reader.snapshot.paragraph).toBe(0);
  });

  it('versucht es erneut, wenn die Ausgabe nicht startet, und meldet dann einen Fehler', () => {
    synth.drop = true;
    const reader = createReader(['Eins.']);
    reader.play();
    vi.advanceTimersByTime(START_TIMEOUT_MS);
    expect(synth.spoken).toHaveLength(2);
    vi.advanceTimersByTime(START_TIMEOUT_MS);
    expect(reader.snapshot.state).toBe('paused');
    expect(events.errors).toHaveLength(1);

    synth.drop = false;
    reader.play();
    expect(reader.snapshot.state).toBe('playing');
    expect(reader.currentText).toBe('Eins.');
  });

  it('beendet und beginnt danach von vorn', () => {
    const reader = createReader(['Eins.', 'Zwei.'], { announceParagraphs: false });
    reader.play();
    synth.finish();
    reader.stop();
    expect(reader.snapshot).toMatchObject({ state: 'idle', paragraph: 0 });
    expect(synth.speaking).toBe(false);
    reader.play();
    expect(reader.currentText).toBe('Eins.');
  });

  it('beginnt nach dem Ende von vorn', () => {
    const reader = createReader(['Eins.']);
    reader.play();
    synth.finish();
    expect(reader.snapshot.state).toBe('finished');
    reader.play();
    expect(reader.currentText).toBe('Eins.');
  });

  it('spricht nach destroy nicht weiter', () => {
    const reader = createReader(['Eins.', 'Zwei.']);
    reader.play();
    const old = synth.current!;
    reader.destroy();
    old.dispatchEvent(new Event('end'));
    vi.advanceTimersByTime(60_000);
    expect(synth.spoken).toHaveLength(1);
  });

  it('löst eine fremde Pause, bevor es spricht', () => {
    synth.paused = true;
    createReader(['Eins.']).play();
    expect(synth.paused).toBe(false);
  });

  it('tut ohne Text nichts', () => {
    const reader = createReader(['', '  ']);
    reader.play();
    expect(reader.snapshot).toMatchObject({ state: 'idle', total: 0 });
    expect(synth.spoken).toHaveLength(0);
  });
});
