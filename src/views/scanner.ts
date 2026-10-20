import { playTone, type Tone } from '../audio/tones.ts';
import { h } from '../dom.ts';
import { status } from '../feedback.ts';
import { countLabel } from '../format.ts';
import { href } from '../router.ts';
import { analyzeFrame, type Analysis } from '../scan/analyze.ts';
import { Camera, cameraAvailability, describeCameraError, permissionDenied, type CameraError } from '../scan/camera.ts';
import { Guide } from '../scan/guidance.ts';
import { captureVideoFrame, sampleVideoFrame } from '../scan/image.ts';
import { pickImages, prepareFiles, saveScannedDocument, type PickSource } from '../scan/scan.ts';
import {
  addPage,
  clearPages,
  movePageInScan,
  removePage,
  replacePage,
  restorePages,
  scanPages,
  setPersistErrorHandler,
} from '../scan/session.ts';
import { storageErrorMessage } from '../storage/errors.ts';
import { setVoiceContext } from '../voice/controller.ts';
import { getSettings, updateSettings } from '../storage/settings.ts';
import { section, viewHeader, type View } from './components.ts';

/** Analysen pro Sekunde – genug für flüssige Hinweise, schont den Akku. */
const ANALYSIS_INTERVAL_MS = 250;

const START_HINT = 'Kamera bereit. Halte das iPhone flach, etwa 30 Zentimeter über das Dokument.';
const PERMISSION_HINT =
  'Bitte erlaube VoxDoc den Zugriff auf die Kamera. Die Abfrage erscheint als Hinweisfenster auf dem Bildschirm.';
/** Dauert der Start länger, wartet das iPhone vermutlich auf die Erlaubnis. */
const PERMISSION_HINT_DELAY_MS = 1500;

function tone(name: Tone): void {
  if (getSettings().tones) {
    playTone(name);
  }
}

export function scannerView(): View {
  const video = h('video', { class: 'camera-video', 'aria-hidden': 'true' });
  const outline = h('div', { class: 'camera-outline', hidden: true, 'aria-hidden': 'true' });
  const cameraBox = h('div', { class: 'camera', hidden: true }, video, outline);
  const camera = new Camera(video);
  const guide = new Guide(getSettings().autoCapture);
  const sampleCanvas = document.createElement('canvas');

  let loop: number | undefined;
  let lastAnalysis: Analysis | null = null;
  let retakeIndex: number | null = null;
  let capturing = false;
  let destroyed = false;
  let resumeOnVisible = false;
  const thumbnails = new Map<string, string>();

  // ---------- Elemente ----------
  const guidance = h('p', { id: 'scan-guidance', class: 'scan-guidance' }, 'Kamera wird gestartet …');
  const shutter = h('button', {
    type: 'button',
    class: 'button button-primary button-hero',
    'aria-describedby': 'scan-guidance',
    hidden: true,
  });
  const cancelRetake = h('button', { type: 'button', class: 'button button-secondary', hidden: true }, 'Neuaufnahme abbrechen');

  const autoToggleInput = h('input', {
    id: 'auto-capture-toggle',
    type: 'checkbox',
    switch: true,
    checked: guide.autoCapture,
    'aria-describedby': 'auto-capture-hint',
  });
  const autoToggle = h(
    'div',
    { class: 'field field-toggle', hidden: true },
    h('label', { for: 'auto-capture-toggle' }, 'Automatisch auslösen'),
    autoToggleInput,
    h('p', { id: 'auto-capture-hint', class: 'hint' }, 'Nimmt die Seite auf, sobald sie vollständig und ruhig im Bild ist. Ein Takt-Ton zählt herunter.'),
  );

  const torchButton = h('button', { type: 'button', class: 'button button-secondary', 'aria-pressed': 'false', hidden: true }, 'Licht');

  const errorTitle = h('h2', { id: 'camera-error-heading', tabindex: '-1' });
  const errorText = h('p', null);
  const retryButton = h('button', { type: 'button', class: 'button button-secondary' }, 'Kamera erneut versuchen');
  const errorBox = h(
    'section',
    { class: 'card notice', 'aria-labelledby': 'camera-error-heading', hidden: true },
    errorTitle,
    errorText,
    h('p', null, 'Du kannst stattdessen die Kamera-App oder die Mediathek verwenden – siehe unten.'),
    retryButton,
  );

  const pagesHeading = h('h2', { id: 'pages-heading', tabindex: '-1' }, 'Erfasste Seiten');
  const pagesSummary = h('p', { class: 'view-intro' });
  const pagesList = h('ol', { class: 'page-list' });
  const saveButton = h('button', { type: 'button', class: 'button button-primary' });
  const discardButton = h('button', { type: 'button', class: 'button button-danger' }, 'Scan verwerfen');

  // ---------- Darstellung ----------
  function pageNumber(): number {
    return retakeIndex !== null ? retakeIndex + 1 : scanPages().length + 1;
  }

  function renderShutter(): void {
    shutter.textContent = retakeIndex !== null ? `Seite ${pageNumber()} neu aufnehmen` : `Seite ${pageNumber()} aufnehmen`;
    cancelRetake.hidden = retakeIndex === null;
  }

  function renderPages(): void {
    const pages = scanPages();
    const count = pages.length;
    pagesSummary.textContent = count === 0 ? 'Noch keine Seite aufgenommen.' : `${countLabel(count, 'Seite', 'Seiten')} erfasst.`;
    saveButton.textContent = `Dokument speichern (${countLabel(count, 'Seite', 'Seiten')})`;
    saveButton.hidden = count === 0;
    discardButton.hidden = count === 0;

    const ids = new Set(pages.map((page) => page.id));
    for (const [id, url] of thumbnails) {
      if (!ids.has(id)) {
        URL.revokeObjectURL(url);
        thumbnails.delete(id);
      }
    }
    pagesList.replaceChildren(
      ...pages.map((page, index) => {
        let url = thumbnails.get(page.id);
        if (!url) {
          url = URL.createObjectURL(page.blob);
          thumbnails.set(page.id, url);
        }
        const number = index + 1;
        return h(
          'li',
          { class: 'page-item' },
          h('img', { src: url, alt: `Foto von Seite ${number}`, class: 'page-thumb' }),
          h(
            'div',
            { class: 'page-actions' },
            h('span', { class: 'page-label' }, `Seite ${number}`),
            h('button', { type: 'button', class: 'button button-secondary', onclick: () => startRetake(index) }, `Seite ${number} neu aufnehmen`),
            index > 0
              ? h('button', { type: 'button', class: 'button button-secondary', 'data-move': `${index}-up`, onclick: () => movePage(index, index - 1, 'up') }, `Seite ${number} nach vorn verschieben`)
              : null,
            index < pages.length - 1
              ? h('button', { type: 'button', class: 'button button-secondary', 'data-move': `${index}-down`, onclick: () => movePage(index, index + 1, 'down') }, `Seite ${number} nach hinten verschieben`)
              : null,
            h('button', { type: 'button', class: 'button button-danger', onclick: () => deletePage(index) }, `Seite ${number} entfernen`),
          ),
        );
      }),
    );
    renderShutter();
  }

  function showOutline(analysis: Analysis | null): void {
    const box = analysis?.document;
    outline.hidden = !box;
    if (box) {
      Object.assign(outline.style, {
        left: `${box.left * 100}%`,
        top: `${box.top * 100}%`,
        width: `${(box.right - box.left) * 100}%`,
        height: `${(box.bottom - box.top) * 100}%`,
      });
    }
  }

  // ---------- Seiten ----------
  function storePage(blob: Blob): number {
    let number: number;
    if (retakeIndex !== null) {
      replacePage(retakeIndex, blob);
      number = retakeIndex + 1;
      retakeIndex = null;
    } else {
      number = addPage(blob) + 1;
    }
    renderPages();
    return number;
  }

  function startRetake(index: number): void {
    retakeIndex = index;
    renderShutter();
    if (camera.active) {
      shutter.focus();
      status(`Neuaufnahme von Seite ${index + 1}. Richte die Kamera auf die Seite.`);
    } else {
      status(`Neuaufnahme von Seite ${index + 1}. Wähle unten die Kamera-App oder die Mediathek.`);
    }
  }

  function movePage(from: number, to: number, direction: 'up' | 'down'): void {
    movePageInScan(from, to);
    if (retakeIndex === from) {
      retakeIndex = to;
    } else if (retakeIndex === to) {
      retakeIndex = from;
    }
    renderPages();
    // Fokus bleibt bei der verschobenen Seite, damit man sie weiter verschieben kann.
    const button =
      pagesList.querySelector<HTMLButtonElement>(`[data-move="${to}-${direction}"]`) ??
      pagesList.querySelector<HTMLButtonElement>(`[data-move^="${to}-"]`);
    (button ?? pagesHeading).focus();
    status(`Seite ${from + 1} ist jetzt Seite ${to + 1}.`, 'success');
  }

  function deletePage(index: number): void {
    if (!window.confirm(`Seite ${index + 1} wirklich entfernen?`)) {
      return;
    }
    removePage(index);
    if (retakeIndex !== null) {
      retakeIndex = retakeIndex === index ? null : retakeIndex > index ? retakeIndex - 1 : retakeIndex;
    }
    renderPages();
    pagesHeading.focus();
    const left = scanPages().length;
    status(`Seite ${index + 1} entfernt. ${left === 0 ? 'Keine Seiten mehr.' : `Noch ${countLabel(left, 'Seite', 'Seiten')}.`}`, 'success');
  }

  async function capture(auto: boolean): Promise<void> {
    if (capturing || !camera.active) {
      return;
    }
    capturing = true;
    tone('shutter');
    try {
      const blob = await captureVideoFrame(video);
      const retake = retakeIndex !== null;
      const number = storePage(blob);
      guide.markCaptured(lastAnalysis?.luma ?? null, performance.now());
      status(
        retake
          ? `Seite ${number} neu aufgenommen.`
          : `Seite ${number} aufgenommen. ${auto ? 'Lege die nächste Seite hin' : 'Nimm die nächste Seite auf'} oder speichere das Dokument.`,
      );
    } catch (error) {
      console.error(error);
      status('Die Aufnahme ist fehlgeschlagen. Bitte versuche es erneut.', 'error');
    } finally {
      capturing = false;
    }
  }

  async function addFiles(files: File[]): Promise<void> {
    status(files.length === 1 ? 'Foto wird übernommen …' : `${files.length} Fotos werden übernommen …`);
    const { pages, failed } = await prepareFiles(retakeIndex !== null ? files.slice(0, 1) : files);
    const numbers = pages.map((blob) => storePage(blob));
    if (numbers.length > 0) {
      status(
        numbers.length === 1 ? `Seite ${numbers[0]} hinzugefügt.` : `Seiten ${numbers[0]} bis ${numbers.at(-1)} hinzugefügt.`,
        'success',
      );
    }
    if (failed > 0) {
      status(`${countLabel(failed, 'Bild konnte', 'Bilder konnten')} nicht gelesen werden.`, 'error');
    }
  }

  // ---------- Kamera ----------
  function showError(error: CameraError, moveFocus: boolean): void {
    cameraBox.hidden = true;
    shutter.hidden = true;
    autoToggle.hidden = true;
    torchButton.hidden = true;
    errorTitle.textContent = error.title;
    errorText.textContent = error.message;
    retryButton.hidden = !error.retry;
    errorBox.hidden = false;
    guidance.textContent = 'Live-Kamera nicht verfügbar.';
    if (moveFocus) {
      errorTitle.focus();
    }
    status(`${error.title}. ${error.message}`, 'error');
  }

  function stopCamera(): void {
    window.clearInterval(loop);
    loop = undefined;
    camera.stop();
    showOutline(null);
  }

  function analyse(): void {
    const frame = sampleVideoFrame(video, sampleCanvas);
    if (!frame) {
      return;
    }
    const analysis = analyzeFrame(frame);
    lastAnalysis = analysis;
    const update = guide.update(analysis, performance.now());
    guidance.textContent = update.message;
    showOutline(analysis);
    if (update.announce) {
      status(update.announce);
    }
    if (update.tick) {
      tone('tick');
    }
    if (update.capture) {
      void capture(true);
    }
  }

  async function startCamera(moveFocus: boolean): Promise<void> {
    const unavailable = cameraAvailability();
    if (unavailable) {
      showError(unavailable, moveFocus);
      return;
    }
    if (await permissionDenied()) {
      showError(describeCameraError(new DOMException('', 'NotAllowedError')), moveFocus);
      return;
    }
    guidance.textContent = 'Kamera wird gestartet …';
    const permissionTimer = window.setTimeout(() => {
      guidance.textContent = PERMISSION_HINT;
      status(PERMISSION_HINT);
    }, PERMISSION_HINT_DELAY_MS);
    try {
      await camera.start();
    } catch (error) {
      window.clearTimeout(permissionTimer);
      if (!destroyed) {
        showError(describeCameraError(error), moveFocus);
      }
      return;
    }
    window.clearTimeout(permissionTimer);
    if (destroyed) {
      camera.stop();
      return;
    }
    errorBox.hidden = true;
    cameraBox.hidden = false;
    shutter.hidden = false;
    autoToggle.hidden = false;
    torchButton.hidden = !camera.torchSupported;
    guidance.textContent = START_HINT;
    status(START_HINT, 'start');
    window.clearInterval(loop);
    loop = window.setInterval(analyse, ANALYSIS_INTERVAL_MS);
  }

  // iOS beendet die Kamera im Hintergrund; danach automatisch neu starten.
  const onVisibility = (): void => {
    if (document.hidden) {
      resumeOnVisible = camera.active;
      stopCamera();
    } else if (resumeOnVisible) {
      resumeOnVisible = false;
      void startCamera(false);
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  // ---------- Ereignisse ----------
  shutter.addEventListener('click', () => void capture(false));
  cancelRetake.addEventListener('click', () => {
    const number = (retakeIndex ?? 0) + 1;
    retakeIndex = null;
    renderShutter();
    status(`Neuaufnahme von Seite ${number} abgebrochen.`);
  });
  autoToggleInput.addEventListener('change', () => {
    guide.autoCapture = autoToggleInput.checked;
    updateSettings({ autoCapture: guide.autoCapture });
    status(guide.autoCapture ? 'Automatisch auslösen an.' : 'Automatisch auslösen aus. Tippe zum Aufnehmen auf den Auslöser.');
  });
  torchButton.addEventListener('click', async () => {
    const on = torchButton.getAttribute('aria-pressed') !== 'true';
    if (await camera.setTorch(on)) {
      torchButton.setAttribute('aria-pressed', String(on));
      status(on ? 'Licht an.' : 'Licht aus.');
    } else {
      status('Das Licht lässt sich nicht einschalten.', 'error');
    }
  });
  retryButton.addEventListener('click', () => void startCamera(true));

  saveButton.addEventListener('click', async () => {
    const pages = scanPages().map((page) => page.blob);
    saveButton.disabled = true;
    try {
      await saveScannedDocument(pages);
      clearPages();
    } catch (error) {
      console.error(error);
      // Die Seiten bleiben im Entwurf erhalten und können erneut gespeichert werden.
      status(`Das Dokument wurde nicht gespeichert. ${storageErrorMessage(error)} Die aufgenommenen Seiten bleiben erhalten.`, 'error');
      saveButton.disabled = false;
    }
  });
  discardButton.addEventListener('click', () => {
    const count = scanPages().length;
    if (!window.confirm(`Scan mit ${countLabel(count, 'Seite', 'Seiten')} verwerfen?`)) {
      return;
    }
    clearPages();
    retakeIndex = null;
    renderPages();
    pagesHeading.focus();
    status('Scan verworfen.', 'success');
  });

  const pickButton = (label: string, source: PickSource): HTMLButtonElement =>
    h(
      'button',
      { type: 'button', class: 'button button-secondary', onclick: () => pickImages(source, (files) => void addFiles(files)) },
      label,
    );

  const unregisterVoice = setVoiceContext({
    handle: (command) => {
      if (command.type === 'capture') {
        if (camera.active) {
          void capture(false);
        } else {
          status('Die Live-Kamera ist nicht aktiv. Tippe auf „Foto mit der Kamera-App aufnehmen“.', 'error');
        }
        return true;
      }
      if (command.type === 'save') {
        if (scanPages().length > 0) {
          saveButton.click();
        } else {
          status('Es ist noch keine Seite aufgenommen. Sage „Aufnehmen“ oder lege ein Blatt unter die Kamera.', 'error');
        }
        return true;
      }
      return false;
    },
  });

  let persistErrorShown = false;
  setPersistErrorHandler((error) => {
    // Einmal pro Besuch melden, nicht bei jeder weiteren Seite erneut.
    if (!persistErrorShown) {
      persistErrorShown = true;
      status(`Der Zwischenstand des Scans konnte nicht gesichert werden. Speichere das Dokument bald. ${storageErrorMessage(error)}`, 'error');
    }
  });

  renderPages();
  void restorePages()
    .then((restored) => {
      if (restored > 0 && !destroyed) {
        renderPages();
        status(`Ein unvollständiger Scan mit ${countLabel(restored, 'Seite', 'Seiten')} wurde wiederhergestellt.`);
      }
    })
    .catch((error: unknown) => console.warn('Scan-Entwurf nicht lesbar', error));
  void startCamera(false);

  const element = h(
    'div',
    { class: 'view' },
    h('a', { class: 'back-link', href: href({ name: 'start' }) }, 'Zurück zum Start'),
    viewHeader('Dokument scannen', guidance),
    errorBox,
    cameraBox,
    h('div', { class: 'button-stack' }, shutter, cancelRetake, torchButton),
    autoToggle,
    h('section', { class: 'section', 'aria-labelledby': 'pages-heading' }, pagesHeading, pagesSummary, pagesList, h('div', { class: 'button-stack' }, saveButton, discardButton)),
    section(
      'alternatives-heading',
      'Ohne Live-Kamera',
      h('p', { class: 'hint' }, 'Nimm ein Foto mit der Kamera-App von iOS auf oder wähle vorhandene Fotos. Jedes Foto wird eine Seite.'),
      h('div', { class: 'button-stack' }, pickButton('Foto mit der Kamera-App aufnehmen', 'camera'), pickButton('Fotos aus der Mediathek wählen', 'photos')),
    ),
  );

  return {
    title: 'Dokument scannen',
    element,
    destroy: () => {
      destroyed = true;
      unregisterVoice();
      setPersistErrorHandler(null);
      document.removeEventListener('visibilitychange', onVisibility);
      stopCamera();
      for (const url of thumbnails.values()) {
        URL.revokeObjectURL(url);
      }
    },
  };
}
