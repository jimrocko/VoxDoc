import { status, type StatusKind } from '../feedback.ts';
import { countLabel } from '../format.ts';
import { href } from '../router.ts';
import { classifyStorageError, StorageError, storageErrorMessage } from '../storage/errors.ts';
import {
  getDocument,
  updateDocument,
  type OcrPageResult,
  type OcrResult,
  type VoxDocument,
} from '../storage/documents.ts';
import { cachedOcrBytes, loadOcrAssets } from './assets.ts';
import { createTesseractEngine, type OcrEngine } from './engine.ts';
import { classifyOcrError, DOWNLOAD_MB, OcrError, ocrErrorMessages } from './errors.ts';
import { confidenceLabels, confidenceLevel, overallConfidence, textFromOcr } from './format.ts';

export type OcrJobState =
  | { phase: 'queued' }
  | { phase: 'preparing'; progress: number }
  | { phase: 'recognizing'; page: number; pages: number; progress: number };

export type OcrEvent =
  | { type: 'progress'; docId: string; state: OcrJobState }
  | { type: 'done'; docId: string; doc: VoxDocument; textReplaced: boolean }
  | { type: 'error'; docId: string; message: string }
  | { type: 'cancelled'; docId: string };

export interface OcrDeps {
  createEngine: (onProgress: (progress: number) => void) => Promise<OcrEngine>;
  /** Müssen die Sprachdaten noch aus dem Netz geladen werden? */
  needsDownload: () => Promise<boolean>;
  getDocument: (id: string) => Promise<VoxDocument | undefined>;
  updateDocument: (id: string, changes: Partial<Pick<VoxDocument, 'text' | 'ocr'>>) => Promise<VoxDocument>;
  announce: (message: string, kind?: StatusKind) => void;
  /** Wird die Seite dieses Dokuments gerade angezeigt? Sonst nennt die Ansage den Titel. */
  isShowing: (docId: string) => boolean;
  now: () => number;
}

/** Längste Zeit für eine Seite, bevor abgebrochen wird (älteres iPhone, sehr volle Seite). */
export const PAGE_TIMEOUT_MS = 180_000;
/** Abstand der Fortschrittsansagen während langer Erkennungen. */
export const PROGRESS_ANNOUNCE_MS = 15_000;
/** Danach wird die Engine beendet, um Arbeitsspeicher freizugeben. */
export const IDLE_TERMINATE_MS = 60_000;

class Cancelled extends Error {}

export class OcrService {
  private queue: string[] = [];
  private states = new Map<string, OcrJobState>();
  private errors = new Map<string, string>();
  private listeners = new Set<(event: OcrEvent) => void>();
  private engine: OcrEngine | null = null;
  private engineLoading: Promise<OcrEngine> | null = null;
  private running: string | null = null;
  private cancelled = new Set<string>();
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private lastProgressAnnounce = 0;
  /** Beendet die laufende Erkennung sofort, auch wenn die Engine nicht mehr antwortet. */
  private abortRunning: (() => void) | null = null;

  constructor(private readonly deps: OcrDeps) {}

  subscribe(listener: (event: OcrEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  state(docId: string): OcrJobState | null {
    return this.states.get(docId) ?? null;
  }

  /** Letzte Fehlermeldung, bis zum nächsten Versuch. */
  error(docId: string): string | null {
    return this.errors.get(docId) ?? null;
  }

  /** Stellt ein Dokument in die Warteschlange. Läuft weiter, auch wenn die Ansicht gewechselt wird. */
  enqueue(docId: string): void {
    if (this.states.has(docId)) {
      return;
    }
    this.errors.delete(docId);
    this.cancelled.delete(docId);
    this.queue.push(docId);
    this.setState(docId, { phase: 'queued' });
    void this.drain();
  }

  async cancel(docId: string): Promise<void> {
    if (!this.states.has(docId)) {
      return;
    }
    this.cancelled.add(docId);
    if (this.running === docId) {
      // Sofort stoppen: Die Engine lässt sich nicht mitten in einer Seite anhalten.
      this.abortRunning?.();
      await this.dropEngine();
    } else {
      this.queue = this.queue.filter((id) => id !== docId);
      this.finishCancelled(docId);
    }
  }

  /** Alle laufenden und wartenden Erkennungen beenden (z. B. vor „Alle Dokumente löschen“). */
  async cancelAll(): Promise<void> {
    await Promise.all([...this.states.keys()].map((docId) => this.cancel(docId)));
  }

  private emit(event: OcrEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private setState(docId: string, state: OcrJobState): void {
    this.states.set(docId, state);
    this.emit({ type: 'progress', docId, state });
  }

  private finishCancelled(docId: string): void {
    this.states.delete(docId);
    this.cancelled.delete(docId);
    this.deps.announce('Texterkennung abgebrochen.');
    this.emit({ type: 'cancelled', docId });
  }

  private async dropEngine(): Promise<void> {
    const engine = this.engine;
    this.engine = null;
    this.engineLoading = null;
    await engine?.terminate().catch(() => {});
  }

  private async drain(): Promise<void> {
    if (this.running) {
      return;
    }
    clearTimeout(this.idleTimer);
    let docId: string | undefined;
    while ((docId = this.queue.shift())) {
      this.running = docId;
      await this.run(docId);
      this.running = null;
    }
    this.idleTimer = setTimeout(() => void this.dropEngine(), IDLE_TERMINATE_MS);
  }

  private label(doc: VoxDocument): string {
    return this.deps.isShowing(doc.id) ? '' : `„${doc.title}“: `;
  }

  private async getEngine(docId: string): Promise<OcrEngine> {
    if (this.engine) {
      return this.engine;
    }
    if (!this.engineLoading) {
      if (await this.deps.needsDownload()) {
        this.deps.announce(`Sprachdaten für die Texterkennung werden geladen, etwa ${DOWNLOAD_MB} Megabyte. Das ist nur beim ersten Mal nötig.`);
      }
      this.engineLoading = this.deps.createEngine((progress) => this.setState(docId, { phase: 'preparing', progress }));
    }
    try {
      this.engine = await this.engineLoading;
      return this.engine;
    } catch (error) {
      this.engineLoading = null;
      throw error;
    }
  }

  private async run(docId: string): Promise<void> {
    const check = (): void => {
      if (this.cancelled.has(docId)) {
        throw new Cancelled();
      }
    };
    const aborted = new Promise<never>((_, reject) => {
      this.abortRunning = () => reject(new Cancelled());
    });
    aborted.catch(() => {});
    const abortable = <T>(promise: Promise<T>): Promise<T> => Promise.race([promise, aborted]);
    let doc: VoxDocument | undefined;
    try {
      doc = await this.deps.getDocument(docId);
      if (!doc || doc.pages.length === 0) {
        throw new OcrError('noPages');
      }
      const pages = doc.pages.length;
      this.deps.announce(
        `${this.label(doc)}Texterkennung für ${countLabel(pages, 'Seite', 'Seiten')} gestartet.`,
      );
      this.setState(docId, { phase: 'preparing', progress: 0 });
      const engine = await abortable(this.getEngine(docId));
      check();

      const results: OcrPageResult[] = [];
      this.lastProgressAnnounce = this.deps.now();
      for (const [index, image] of doc.pages.entries()) {
        const update = (pageProgress: number): void => {
          const progress = (index + pageProgress) / pages;
          this.setState(docId, { phase: 'recognizing', page: index + 1, pages, progress });
          if (this.deps.now() - this.lastProgressAnnounce >= PROGRESS_ANNOUNCE_MS) {
            this.lastProgressAnnounce = this.deps.now();
            this.deps.announce(`Texterkennung läuft: ${Math.round(progress * 100)} Prozent.`);
          }
        };
        update(0);
        const page = await abortable(withTimeout(engine.recognize(image, update), PAGE_TIMEOUT_MS));
        check();
        results.push(page);
        if (pages > 1 && index < pages - 1) {
          this.deps.announce(`Seite ${index + 1} von ${pages} erkannt.`);
        }
      }

      const ocr: OcrResult = { engine: engine.name, language: 'deu', recognizedAt: this.deps.now(), pages: results };
      // Selbst bearbeiteten Text nicht überschreiben – nur leeren oder bisher unveränderten OCR-Text.
      const current = await this.deps.getDocument(docId);
      if (!current) {
        throw new OcrError('noPages');
      }
      const untouched = !current.text.trim() || (current.ocr !== null && current.text === textFromOcr(current.ocr));
      let updated: VoxDocument;
      try {
        updated = await this.deps.updateDocument(docId, untouched ? { ocr, text: textFromOcr(ocr) } : { ocr });
      } catch (error) {
        // Speicherfehler (z. B. Speicher voll) verständlich als solche melden.
        throw error instanceof StorageError ? error : new StorageError(classifyStorageError(error), error);
      }
      this.states.delete(docId);
      this.deps.announce(...resultMessage(this.label(updated), ocr, untouched));
      this.emit({ type: 'done', docId, doc: updated, textReplaced: untouched });
    } catch (error) {
      if (error instanceof Cancelled || this.cancelled.has(docId)) {
        this.finishCancelled(docId);
        return;
      }
      console.error(error);
      const code = classifyOcrError(error);
      if (code === 'memory' || code === 'timeout' || code === 'failed') {
        // Nach einem Absturz ist die Engine nicht mehr verlässlich.
        await this.dropEngine();
      }
      const message = error instanceof StorageError ? `Der erkannte Text konnte nicht gespeichert werden. ${storageErrorMessage(error)}` : ocrErrorMessages[code];
      this.states.delete(docId);
      this.errors.set(docId, message);
      this.deps.announce(`${doc ? this.label(doc) : ''}${message}`, 'error');
      this.emit({ type: 'error', docId, message });
    } finally {
      this.abortRunning = null;
    }
  }
}

/** Ansage nach der Erkennung – beschreibt nur, was tatsächlich erkannt wurde. */
export function resultMessage(prefix: string, ocr: OcrResult, textReplaced: boolean): [string, StatusKind] {
  const words = ocr.pages.reduce((sum, page) => sum + page.words, 0);
  const pages = ocr.pages.length;
  if (words === 0) {
    return [
      `${prefix}Auf ${pages === 1 ? 'der Seite' : `den ${pages} Seiten`} wurde kein Text erkannt. Prüfe, ob das Foto scharf und hell genug ist und die Schrift waagerecht liegt.`,
      'error',
    ];
  }
  const confidence = overallConfidence(ocr) ?? 0;
  const level = confidenceLevel(confidence);
  const parts = [
    `${prefix}Text erkannt: ${countLabel(words, 'Wort', 'Wörter')}${pages > 1 ? ` auf ${pages} Seiten` : ''}. Genauigkeit ${confidenceLabels[level]}.`,
  ];
  const empty = ocr.pages.flatMap((page, index) => (page.words === 0 ? [index + 1] : []));
  if (empty.length > 0) {
    parts.push(`Auf ${empty.length === 1 ? 'Seite' : 'den Seiten'} ${empty.join(', ')} wurde kein Text gefunden.`);
  }
  if (level === 'low') {
    parts.push('Der Text enthält wahrscheinlich Fehler.');
  }
  if (!textReplaced) {
    parts.push('Dein bearbeiteter Text wurde nicht ersetzt.');
  }
  return [parts.join(' '), level === 'low' ? 'error' : 'success'];
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new OcrError('timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export const ocrService = new OcrService({
  createEngine: async (onProgress) =>
    createTesseractEngine(await loadOcrAssets((loaded, total) => onProgress(total ? loaded / total : 0))),
  needsDownload: async () => (await cachedOcrBytes()) === null,
  getDocument,
  updateDocument,
  announce: status,
  isShowing: (docId) => window.location.hash === href({ name: 'document', id: docId }),
  now: () => Date.now(),
});
