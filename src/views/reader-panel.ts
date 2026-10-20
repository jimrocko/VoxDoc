import { selectedVoice, setReaderActive, speechSupported } from '../audio/speech.ts';
import { playTone } from '../audio/tones.ts';
import { h } from '../dom.ts';
import { status } from '../feedback.ts';
import { Reader, rateLabel, type ReaderPosition, type ReaderSnapshot } from '../reader/reader.ts';
import { getSettings, updateSettings } from '../storage/settings.ts';
import type { PageMap } from '../reader/pages.ts';
import type { VoiceCommand } from '../voice/commands.ts';
import { section } from './components.ts';

const RATE_STEP = 0.1;

export interface ReaderPanel {
  element: HTMLElement;
  destroy: () => void;
  /** Führt einen Vorlese-Befehl aus (Sprachsteuerung/Befehlsfeld); `false`, wenn er nicht dazugehört. */
  handle?: (command: VoiceCommand) => boolean;
  /** Vorlesen still anhalten, z. B. bevor das Mikrofon zuhört. */
  pauseQuietly?: () => void;
  /** Nach erfolglosem Zuhören dort weiterlesen, wo für das Zuhören angehalten wurde. */
  resumeIfInterrupted?: () => void;
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
  pageMap: PageMap | null = null,
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

  const pages = pageMap && pageMap.starts.length > 1 ? pageMap.starts : null;
  const currentPageIndex = (): number => {
    const paragraph = reader.snapshot.paragraph;
    let index = 0;
    pages?.forEach((start, i) => {
      if (start.paragraph <= paragraph) {
        index = i;
      }
    });
    return index;
  };
  const goToPage = (direction: 1 | -1): void => {
    if (!pages) {
      const fallback =
        pageMap && pageMap.totalPages > 1
          ? 'Nur eine Seite dieses Dokuments enthält Text. Nutze „Nächster Absatz“.'
          : 'Dieses Dokument hat nur eine Seite. Nutze „Nächster Absatz“.';
      status(pageMap?.unavailable ?? fallback, 'error');
      return;
    }
    const target = pages[currentPageIndex() + direction];
    if (!target) {
      if (reader.snapshot.state === 'playing') {
        toneOnly();
      } else {
        status(direction > 0 ? 'Das ist die letzte Seite.' : 'Das ist die erste Seite.', 'error');
      }
      return;
    }
    reader.goToParagraph(target.paragraph, `Seite ${target.page} von ${pageMap!.totalPages}.`);
  };

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
      pages
        ? h(
            'div',
            { class: 'reader-row reader-pages', role: 'group', 'aria-label': 'Seiten' },
            navButton('Vorherige Seite', icons.previous, () => goToPage(-1)),
            navButton('Nächste Seite', icons.next, () => goToPage(1)),
          )
        : null,
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

  // Nur fürs Zuhören angehalten? Dann zählt es für Befehle weiter als „liest gerade“.
  let pausedForListening = false;

  const handle = (command: VoiceCommand): boolean => {
    const interrupted = pausedForListening;
    pausedForListening = false;
    const { resumable } = reader.snapshot;
    const state = interrupted ? 'playing' : reader.snapshot.state;
    switch (command.type) {
      case 'read':
      case 'resume':
        if (state !== 'playing') {
          reader.play();
        }
        return true;
      case 'pause':
        if (state === 'playing') {
          reader.pause();
          status(statusText(reader.snapshot));
        } else {
          status('Es wird gerade nicht vorgelesen.');
        }
        return true;
      case 'stop':
        if (state === 'idle' && !resumable) {
          status('Es wird gerade nicht vorgelesen.');
        } else {
          reader.stop();
          status('Vorlesen beendet.');
        }
        return true;
      case 'restart':
        reader.restart();
        return true;
      case 'nextParagraph':
        reader.next();
        return true;
      case 'previousParagraph':
        reader.previous();
        return true;
      case 'repeat':
        reader.repeat();
        return true;
      case 'faster':
      case 'slower':
        // Erst weiterlesen, damit die Vorlesestimme das neue Tempo selbst ansagt.
        if (interrupted) {
          reader.play();
        }
        changeRate(command.type === 'faster' ? 1 : -1);
        return true;
      case 'nextPage':
        goToPage(1);
        return true;
      case 'previousPage':
        goToPage(-1);
        return true;
      default:
        return false;
    }
  };

  return {
    element,
    handle,
    pauseQuietly: () => {
      if (reader.snapshot.state === 'playing') {
        reader.pause();
        pausedForListening = true;
      }
    },
    resumeIfInterrupted: () => {
      if (pausedForListening) {
        pausedForListening = false;
        reader.play();
      }
    },
    destroy: () => {
      document.removeEventListener('visibilitychange', onVisibility);
      reader.destroy();
      setReaderActive(false);
    },
  };
}
