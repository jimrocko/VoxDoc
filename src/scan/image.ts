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
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? file), 'image/jpeg', JPEG_QUALITY);
  });
}
