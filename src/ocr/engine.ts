import type { OcrAssets } from './assets.ts';
import { countWords } from './format.ts';

export interface RecognizedPage {
  text: string;
  confidence: number;
  words: number;
}

/** Schnittstelle der OCR – im Test durch eine Attrappe ersetzbar. */
export interface OcrEngine {
  readonly name: string;
  recognize(image: Blob, onProgress: (progress: number) => void): Promise<RecognizedPage>;
  terminate(): Promise<void>;
}

/**
 * Startskript des Workers. Es lädt zuerst die Engine und dann das Worker-Skript
 * von Tesseract.js (beide als Blob-URL aus dem eigenen Cache).
 *
 * Außerdem umgeht es einen Fehler in Tesseract.js 7.0.0: Beim Initialisieren
 * werden übergebene Sprachdaten-Objekte (`{ code, data }`) mit ihren Daten statt
 * mit ihrem Code benannt. Hier wird nur die Nachricht `initialize` korrigiert.
 */
function bootstrapSource(coreUrl: string, workerScriptUrl: string): string {
  return `
const addListener = self.addEventListener.bind(self);
self.addEventListener = function (type, listener, options) {
  if (type !== 'message') return addListener(type, listener, options);
  return addListener(type, function (event) {
    const message = event.data;
    if (message && message.action === 'initialize' && message.payload && Array.isArray(message.payload.langs)) {
      message.payload.langs = message.payload.langs.map(function (lang) { return typeof lang === 'string' ? lang : lang.code; });
    }
    return listener.call(this, event);
  }, options);
};
importScripts(${JSON.stringify(coreUrl)});
importScripts(${JSON.stringify(workerScriptUrl)});
`;
}

export async function createTesseractEngine(assets: OcrAssets): Promise<OcrEngine> {
  const { createWorker, OEM } = await import('tesseract.js');
  const coreUrl = URL.createObjectURL(assets.core);
  const workerScriptUrl = URL.createObjectURL(assets.worker);
  const bootstrapUrl = URL.createObjectURL(
    new Blob([bootstrapSource(coreUrl, workerScriptUrl)], { type: 'text/javascript' }),
  );
  const urls = [coreUrl, workerScriptUrl, bootstrapUrl];
  let onPageProgress: ((progress: number) => void) | null = null;

  let worker: Awaited<ReturnType<typeof createWorker>>;
  try {
    worker = await createWorker([{ code: 'deu', data: assets.language }], OEM.LSTM_ONLY, {
      workerPath: bootstrapUrl,
      workerBlobURL: false,
      // Wird nicht geladen, weil das Startskript die Engine schon geladen hat.
      corePath: coreUrl,
      // Die Sprachdaten liegen bereits im eigenen Cache; kein zweites Exemplar in IndexedDB.
      cacheMethod: 'none',
      logger: (message: { status: string; progress: number }) => {
        if (message.status === 'recognizing text') {
          onPageProgress?.(message.progress);
        }
      },
    });
    // Interne Hinweise der Engine („Estimating resolution …“) nicht in die Fehlerkonsole schreiben.
    await worker.setParameters({ debug_file: '/dev/null' } as Record<string, string>);
  } catch (error) {
    urls.forEach((url) => URL.revokeObjectURL(url));
    throw error;
  }

  return {
    name: 'Tesseract.js 7 (LSTM, Deutsch)',
    async recognize(image, onProgress) {
      onPageProgress = onProgress;
      try {
        const { data } = await worker.recognize(image, { rotateAuto: true });
        const text = data.text ?? '';
        const words = countWords(text);
        return { text, words, confidence: words > 0 ? Math.round(data.confidence) : 0 };
      } finally {
        onPageProgress = null;
      }
    },
    async terminate() {
      await worker.terminate();
      urls.forEach((url) => URL.revokeObjectURL(url));
    },
  };
}
