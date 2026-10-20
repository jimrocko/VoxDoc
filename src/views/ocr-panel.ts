import { h } from '../dom.ts';
import { status } from '../feedback.ts';
import { spokenDate } from '../format.ts';
import { confidenceLabels, confidenceLevel, overallConfidence, textFromOcr } from '../ocr/format.ts';
import { ocrService, type OcrJobState } from '../ocr/service.ts';
import { updateDocument, type VoxDocument } from '../storage/documents.ts';
import { section } from './components.ts';

export interface OcrPanel {
  element: HTMLElement;
  /** Nach Änderungen am Dokument außerhalb des Panels aufrufen. */
  refresh: () => void;
  destroy: () => void;
}

function progressText(state: OcrJobState): string {
  switch (state.phase) {
    case 'queued':
      return 'Wartet auf die Texterkennung …';
    case 'preparing':
      return `Texterkennung wird vorbereitet … ${Math.round(state.progress * 100)} %`;
    case 'recognizing':
      return state.pages > 1
        ? `Seite ${state.page} von ${state.pages} wird erkannt … ${Math.round(state.progress * 100)} %`
        : `Text wird erkannt … ${Math.round(state.progress * 100)} %`;
  }
}

function resultText(doc: VoxDocument): string {
  const ocr = doc.ocr;
  if (!ocr) {
    return 'Für dieses Dokument wurde noch kein Text erkannt.';
  }
  const confidence = overallConfidence(ocr);
  const when = `Erkannt am ${spokenDate(ocr.recognizedAt)}.`;
  if (confidence === null) {
    return `${when} Es wurde kein Text gefunden.`;
  }
  const words = ocr.pages.reduce((sum, page) => sum + page.words, 0);
  const parts = [`${when} ${words === 1 ? '1 Wort' : `${words} Wörter`}, Genauigkeit ${confidenceLabels[confidenceLevel(confidence)]} (${confidence} %).`];
  const empty = ocr.pages.flatMap((page, index) => (page.words === 0 ? [index + 1] : []));
  if (empty.length > 0 && ocr.pages.length > 1) {
    parts.push(`Kein Text auf Seite ${empty.join(', ')}.`);
  }
  if (confidenceLevel(confidence) === 'low') {
    parts.push('Der Text enthält wahrscheinlich Fehler – prüfe ihn oder scanne die Seite erneut.');
  }
  return parts.join(' ');
}

/**
 * Bedienfeld der Texterkennung. Fortschritt steht sichtbar im Text und im
 * Fortschrittsbalken; angesagt werden nur wichtige Schritte (siehe OcrService).
 */
export function ocrPanel(
  getDoc: () => VoxDocument,
  onDocChanged: (doc: VoxDocument, textChanged: boolean) => void,
): OcrPanel {
  const statusLine = h('p', { id: 'ocr-status', class: 'ocr-status' });
  const errorLine = h('p', { id: 'ocr-error', class: 'ocr-error', hidden: true });
  const progress = h('progress', { max: '100', value: '0', 'aria-label': 'Fortschritt der Texterkennung', hidden: true });
  const startButton = h('button', { type: 'button', class: 'button button-primary' });
  const cancelButton = h('button', { type: 'button', class: 'button button-secondary', hidden: true }, 'Texterkennung abbrechen');
  const adoptButton = h('button', { type: 'button', class: 'button button-secondary', hidden: true }, 'Erkannten Text übernehmen');

  function render(): void {
    const doc = getDoc();
    const state = ocrService.state(doc.id);
    const error = ocrService.error(doc.id);
    const running = state !== null;

    statusLine.textContent = running ? progressText(state) : resultText(doc);
    progress.hidden = !running;
    progress.value = state && state.phase !== 'queued' ? Math.round(state.progress * 100) : 0;
    errorLine.hidden = running || !error;
    errorLine.textContent = error ?? '';

    startButton.hidden = running;
    startButton.textContent = doc.ocr ? 'Text erneut erkennen' : 'Text erkennen';
    cancelButton.hidden = !running;
    // Nur anbieten, wenn der Lesetext vom erkannten Text abweicht (z. B. nach eigener Bearbeitung).
    adoptButton.hidden = running || !doc.ocr || !textFromOcr(doc.ocr) || textFromOcr(doc.ocr) === doc.text;
  }

  startButton.addEventListener('click', () => {
    ocrService.enqueue(getDoc().id);
    render();
    cancelButton.focus();
  });
  cancelButton.addEventListener('click', () => {
    void ocrService.cancel(getDoc().id).then(() => {
      render();
      startButton.focus();
    });
  });
  adoptButton.addEventListener('click', async () => {
    const doc = getDoc();
    if (!doc.ocr || !window.confirm('Deinen bearbeiteten Text durch den erkannten Text ersetzen?')) {
      return;
    }
    const updated = await updateDocument(doc.id, { text: textFromOcr(doc.ocr) });
    onDocChanged(updated, true);
    status('Erkannter Text übernommen.', 'success');
    render();
    startButton.focus();
  });

  const unsubscribe = ocrService.subscribe((event) => {
    if (event.docId !== getDoc().id) {
      return;
    }
    if (event.type === 'done') {
      onDocChanged(event.doc, event.textReplaced);
    }
    const hadFocus = document.activeElement === cancelButton;
    render();
    if (hadFocus && event.type !== 'progress') {
      // Der Abbrechen-Knopf verschwindet – Fokus nicht verlieren.
      startButton.focus();
    }
  });

  render();

  return {
    element: section(
      'ocr-heading',
      'Texterkennung',
      statusLine,
      progress,
      errorLine,
      h('div', { class: 'button-stack' }, startButton, cancelButton, adoptButton),
      h(
        'p',
        { class: 'hint' },
        'Die Erkennung läuft vollständig auf diesem iPhone. Die Fotos bleiben unverändert; der erkannte Text wird getrennt gespeichert.',
      ),
    ),
    refresh: render,
    destroy: unsubscribe,
  };
}
