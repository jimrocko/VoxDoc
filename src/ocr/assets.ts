import { simd } from 'wasm-feature-detect';
import languageUrl from '@tesseract.js-data/deu/4.0.0_best_int/deu.traineddata.gz?url';
import coreUrl from 'tesseract.js-core/tesseract-core-lstm.wasm.js?url';
import coreSimdUrl from 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url';
import workerUrl from 'tesseract.js/dist/worker.min.js?url';
import { OcrError } from './errors.ts';

/**
 * Die OCR-Dateien liegen versioniert (mit Hash im Namen) neben der App und
 * werden beim ersten Gebrauch in einen eigenen Cache geladen. Die App lädt sie
 * selbst und gibt sie dem Worker als Blob – so funktioniert die Texterkennung
 * offline, unabhängig davon, ob Safari Anfragen aus Web Workern über den
 * Service Worker leitet.
 */
const CACHE_NAME = 'voxdoc-ocr';

export interface OcrAssets {
  worker: Blob;
  core: Blob;
  /** Deutsche Sprachdaten (gzip, `best_int`-Modell). */
  language: Uint8Array;
}

export type AssetProgress = (loaded: number, total: number) => void;

/** Ungefähre Größen als Fallback, wenn der Server keine Länge meldet. */
const APPROX_BYTES: Record<string, number> = {
  [workerUrl]: 112_000,
  [coreUrl]: 3_900_000,
  [coreSimdUrl]: 3_900_000,
  [languageUrl]: 1_340_000,
};

let simdSupport: Promise<boolean> | null = null;

/** Die passende Engine: mit SIMD (Safari 16.4+) schneller, sonst die einfache Variante. */
async function requiredUrls(): Promise<string[]> {
  simdSupport ??= simd().catch(() => false);
  return [workerUrl, (await simdSupport) ? coreSimdUrl : coreUrl, languageUrl];
}

export function ocrSupported(): boolean {
  return typeof WebAssembly === 'object' && typeof Worker === 'function' && typeof Blob === 'function';
}

async function openCache(): Promise<Cache | null> {
  try {
    return 'caches' in window ? await caches.open(CACHE_NAME) : null;
  } catch {
    // Kein Cache Storage (z. B. ohne HTTPS) – dann ohne Offline-Speicherung.
    return null;
  }
}

async function download(url: string, onProgress: (loaded: number) => void): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new OcrError(navigator.onLine ? 'download' : 'offline', error);
  }
  if (!response.ok) {
    throw new OcrError('download', new Error(`HTTP ${response.status} für ${url}`));
  }
  if (!response.body) {
    return response.blob();
  }
  const reader = response.body.getReader();
  const chunks: BlobPart[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value as Uint8Array<ArrayBuffer>);
    loaded += value.byteLength;
    onProgress(loaded);
  }
  return new Blob(chunks, { type: response.headers.get('content-type') ?? 'application/octet-stream' });
}

async function getAsset(cache: Cache | null, url: string, onProgress: (loaded: number) => void): Promise<Blob> {
  const cached = await cache?.match(url);
  if (cached) {
    const blob = await cached.blob();
    onProgress(blob.size);
    return blob;
  }
  const blob = await download(url, onProgress);
  try {
    await cache?.put(url, new Response(blob, { headers: { 'content-type': blob.type } }));
  } catch (error) {
    if ((error as Error).name === 'QuotaExceededError') {
      throw new OcrError('storage', error);
    }
    // Nicht speicherbar – die Erkennung läuft trotzdem, nur nicht offline.
  }
  return blob;
}

/** Lädt alle Dateien (aus dem Cache oder aus dem Netz) und meldet den Fortschritt in Bytes. */
export async function loadOcrAssets(onProgress?: AssetProgress): Promise<OcrAssets> {
  if (!ocrSupported()) {
    throw new OcrError('unsupported');
  }
  const urls = await requiredUrls();
  const cache = await openCache();
  void removeStaleAssets(cache);
  const total = urls.reduce((sum, url) => sum + (APPROX_BYTES[url] ?? 0), 0);
  const loaded = urls.map(() => 0);
  const report = (index: number) => (bytes: number) => {
    loaded[index] = bytes;
    onProgress?.(Math.min(total, loaded.reduce((a, b) => a + b, 0)), total);
  };
  const [worker, core, language] = await Promise.all(urls.map((url, index) => getAsset(cache, url, report(index))));
  return { worker: worker!, core: core!, language: new Uint8Array(await language!.arrayBuffer()) };
}

/** Sind alle Dateien offline vorhanden? Liefert die belegte Größe, sonst `null`. */
export async function cachedOcrBytes(): Promise<number | null> {
  const cache = await openCache();
  if (!cache) {
    return null;
  }
  let bytes = 0;
  for (const url of await requiredUrls()) {
    const response = await cache.match(url);
    if (!response) {
      return null;
    }
    bytes += (await response.blob()).size;
  }
  return bytes;
}

export async function deleteOcrAssets(): Promise<void> {
  if ('caches' in window) {
    await caches.delete(CACHE_NAME);
  }
}

/** Nach einem Update: Dateien früherer Versionen entfernen. */
async function removeStaleAssets(cache: Cache | null): Promise<void> {
  if (!cache) {
    return;
  }
  const known = new Set([workerUrl, coreUrl, coreSimdUrl, languageUrl].map((url) => new URL(url, location.href).href));
  for (const request of await cache.keys()) {
    if (!known.has(request.url)) {
      await cache.delete(request);
    }
  }
}
