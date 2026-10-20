/** Längste Kante gespeicherter Fotos – genug für Texterkennung, schont Speicher. */
const MAX_EDGE = 2400;
const JPEG_QUALITY = 0.85;

function loadImage(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  return img
    .decode()
    .then(() => img)
    .finally(() => URL.revokeObjectURL(url));
}

/**
 * Verkleinert ein Kamerafoto auf höchstens MAX_EDGE Pixel und speichert es als
 * JPEG. Safari wendet dabei die EXIF-Ausrichtung automatisch an.
 */
export async function prepareImage(file: Blob): Promise<Blob> {
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  if (scale === 1 && file.type === 'image/jpeg') {
    return file;
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const context = canvas.getContext('2d');
  if (!context) {
    return file;
  }
  context.drawImage(img, 0, 0, canvas.width, canvas.height);
  return encode(canvas).catch(() => file);
}

function encode(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Bild konnte nicht erzeugt werden'))),
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
}

/** Nimmt das aktuelle Kamerabild in voller Auflösung (höchstens MAX_EDGE) auf. */
export function captureVideoFrame(video: HTMLVideoElement): Promise<Blob> {
  const scale = Math.min(1, MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
  return encode(canvas);
}

/** Breite der Miniatur für die Bildanalyse – klein genug für mehrere Analysen pro Sekunde. */
const SAMPLE_WIDTH = 96;

/** Verkleinertes Vorschaubild für die Analyse; wiederverwendet eine Leinwand. */
export function sampleVideoFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement): ImageData | null {
  if (!video.videoWidth || !video.videoHeight) {
    return null;
  }
  const width = SAMPLE_WIDTH;
  const height = Math.round((SAMPLE_WIDTH * video.videoHeight) / video.videoWidth);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    return null;
  }
  context.drawImage(video, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}
