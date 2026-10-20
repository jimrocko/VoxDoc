import { selectedVoice, setReaderActive, speechSupported } from '../audio/speech.ts';
import { playTone } from '../audio/tones.ts';
import { h } from '../dom.ts';
import { status } from '../feedback.ts';
import { Reader, rateLabel, type ReaderPosition, type ReaderSnapshot } from '../reader/reader.ts';
import { getSettings, updateSettings } from '../storage/settings.ts';
import { section } from './components.ts';

const RATE_STEP = 0.1;

export interface ReaderPanel {
  element: HTMLElement;
  destroy: () => void;
}

const toggleLabels: Record<ReaderSnapshot['state'], string> = {
  idle: 'Vorlesen',
  playing: 'Pause',
  paused: 'Fortsetzen',
  finished: 'Erneut vorlesen',
};

function statusText({ state, paragraph, total, resumable }: ReaderSnapshot, finishedBefore = false): string {
  const position = `Absatz ${paragraph + 1} von ${total}`;
  if (state === 'idle' && resumable) {
    return `Zuletzt gelesen bis ${position}.`;
  }
  if (state === 'idle' && finishedBefore) {
    return total === 1 ? 'Bereits ganz vorgelesen. 1 Absatz.' : `Bereits ganz vorgelesen. ${total} Absätze.`;
  }
  switch (state) {
    case 'idle':
      return total === 1 ? 'Bereit. 1 Absatz.' : `Bereit. ${total} Absätze.`;
    case 'playing':
      return `Liest ${position}.`;
    case 'paused':
      return `Pausiert bei ${position}.`;
    case 'finished':
      return 'Fertig vorgelesen.';
  }
}

function icon(path: string): SVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  shape.setAttribute('d', path);
  svg.append(shape);
  return svg;
}

const icons = {
  previous: 'M6 5v14M19 5l-9 7 9 7z',
  repeat: 'M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4',
  next: 'M18 5v14M5 5l9 7-9 7z',
};

/**
 * Bedienfeld fürs Vorlesen. Rückmeldungen während des Vorlesens kommen als
 * Ton oder aus der Vorlesestimme selbst – nie über die Live-Region, damit
 * VoiceOver nicht gleichzeitig spricht.
 */
export interface SavedPosition {
  /** Zuletzt gespeicherte Position, `null` wenn noch nie gelesen. */
  position: ReaderPosition | null;
  save: (position: ReaderPosition) => void;
}

export function readerPanel(
  texts: readonly string[],
  paragraphElements: readonly HTMLElement[],
  saved: SavedPosition = { position: null, save: () => {} },
): ReaderPanel {
  if (!speechSupported) {
    return {
      element: section(
        'reader-heading',
        'Vorlesen',
        h('p', null, 'Dieser Browser unterstützt keine Sprachausgabe. Mit VoiceOver kannst du den Text unten trotzdem lesen.'),
      ),
      destroy: () => {},
    };
  }

  const statusLine = h('p', { id: 'reader-status', class: 'reader-status' });
  const rateDisplay = h('p', { id: 'reader-rate', class: 'reader-rate-value' });
  const toggleButton = h('button', {
    type: 'button',
    class: 'button button-primary button-hero',
    'aria-describedby': 'reader-status',
  });
  const stopButton = h('button', { type: 'button', class: 'button button-secondary' }, 'Vorlesen beenden');

  const navButton = (label: string, path: string, action: () => void): HTMLButtonElement =>
    h(
      'button',
      { type: 'button', class: 'button button-secondary button-icon', onclick: action },
      icon(path),
      h('span', null, label),
    );

  const toneOnly = (): void => {
    if (getSettings().tones) {
      playTone('error');
    }
  };

  let finishedBefore = saved.position?.finished ?? false;
  const restartButton = h('button', { type: 'button', class: 'button button-secondary', hidden: true }, 'Von vorn vorlesen');

  const reader = new Reader(texts, {
    synth: window.speechSynthesis,
    createUtterance: (text) => new SpeechSynthesisUtterance(text),
    voice: () => selectedVoice(getSettings().voiceURI),
    rate: getSettings().speechRate,
    announceParagraphs: getSettings().announceParagraphs,
    start: saved.position && !saved.position.finished ? saved.position : null,
    onPosition: (position) => {
      finishedBefore = position.finished;
      saved.save(position);
    },
    onChange: render,
    onFinish: () => status('Ende des Dokuments.', 'success'),
    onError: (message) => status(message, 'error'),
    onEdge: (edge) => {
      if (edge === 'first') {
        // Der erste Absatz wird ohnehin neu gelesen – nur ein Ton.
        toneOnly();
      } else if (reader.snapshot.state === 'playing') {
        toneOnly();
      } else {
        status('Das ist der letzte Absatz.', 'error');
      }
    },
  });

  function render(snapshot: ReaderSnapshot): void {
    toggleButton.textContent = snapshot.resumable ? 'Weiterlesen' : toggleLabels[snapshot.state];
    statusLine.textContent = statusText(snapshot, finishedBefore);
    restartButton.hidden = !(snapshot.resumable || snapshot.state === 'paused');
    rateDisplay.textContent = `Tempo: ${rateLabel(snapshot.rate)}`;
    stopButton.hidden = snapshot.state === 'idle';
    setReaderActive(snapshot.state === 'playing');
    paragraphElements.forEach((element, index) => {
      element.classList.toggle('is-reading', snapshot.state !== 'idle' && index === snapshot.paragraph);
    });
  }

  toggleButton.addEventListener('click', () => {
    const wasPlaying = reader.snapshot.state === 'playing';
    reader.toggle();
    if (wasPlaying) {
      status(statusText(reader.snapshot));
    }
  });

  restartButton.addEventListener('click', () => {
    reader.restart();
    // Der Knopf verschwindet beim Vorlesen – Fokus auf den Hauptknopf („Pause“).
    toggleButton.focus();
  });

  stopButton.addEventListener('click', () => {
    reader.stop();
    status('Vorlesen beendet.');
    toggleButton.focus();
  });

  const changeRate = (direction: 1 | -1): void => {
    const before = reader.snapshot.rate;
    const after = reader.setRate(before + direction * RATE_STEP);
    if (after === before) {
      const message = direction > 0 ? 'Schnellstes Tempo erreicht.' : 'Langsamstes Tempo erreicht.';
      if (reader.snapshot.state === 'playing') {
        toneOnly();
      } else {
        status(message, 'error');
      }
      return;
    }
    updateSettings({ speechRate: after });
    // Beim Vorlesen sagt die Vorlesestimme das neue Tempo selbst an.
    if (reader.snapshot.state !== 'playing') {
      status(`Tempo ${rateLabel(after)}.`);
    }
  };

  // iOS hält die Sprachausgabe im Hintergrund an; danach sauber pausiert weitermachen.
  const onVisibility = (): void => {
    if (document.hidden) {
      reader.pause();
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  render(reader.snapshot);

  const element = section(
    'reader-heading',
    'Vorlesen',
    statusLine,
    h(
      'div',
      { class: 'reader-controls' },
      toggleButton,
      h(
        'div',
        { class: 'reader-row', role: 'group', 'aria-label': 'Absätze' },
        navButton('Vorheriger Absatz', icons.previous, () => reader.previous()),
        navButton('Absatz wiederholen', icons.repeat, () => reader.repeat()),
        navButton('Nächster Absatz', icons.next, () => reader.next()),
      ),
      h(
        'div',
        { class: 'reader-rate', role: 'group', 'aria-label': 'Sprechtempo' },
        h(
          'button',
          { type: 'button', class: 'button button-secondary', 'aria-describedby': 'reader-rate', onclick: () => changeRate(-1) },
          'Langsamer',
        ),
        rateDisplay,
        h(
          'button',
          { type: 'button', class: 'button button-secondary', 'aria-describedby': 'reader-rate', onclick: () => changeRate(1) },
          'Schneller',
        ),
      ),
      restartButton,
      stopButton,
    ),
    h(
      'p',
      { class: 'hint' },
      'Tipp für VoiceOver: Bediene während des Vorlesens nur diese Knöpfe. Wischst du über den Text, spricht VoiceOver gleichzeitig.',
    ),
  );

  return {
    element,
    destroy: () => {
      document.removeEventListener('visibilitychange', onVisibility);
      reader.destroy();
      setReaderActive(false);
    },
  };
}
