import { byId } from '../dom.ts';
import { status } from '../feedback.ts';
import { countLabel, defaultTitle } from '../format.ts';
import { navigate } from '../router.ts';
import { createDocument, requestPersistentStorage } from '../storage/documents.ts';
import { prepareImage } from './image.ts';

/** `camera` öffnet die Kamera-App von iOS, `photos` die Mediathek (Mehrfachauswahl). */
export type PickSource = 'camera' | 'photos';

const inputIds: Record<PickSource, string> = {
  camera: 'camera-input',
  photos: 'photo-input',
};

let onPicked: ((files: File[]) => void) | null = null;

export function initScanInputs(): void {
  for (const id of Object.values(inputIds)) {
    const input = byId<HTMLInputElement>(id);
    input.addEventListener('change', () => {
      const files = [...(input.files ?? [])];
      input.value = '';
      if (files.length > 0) {
        onPicked?.(files);
      }
    });
  }
}

/**
 * Öffnet die Dateiauswahl – die Alternative zur Live-Kamera.
 * Muss direkt aus einem Tippen heraus aufgerufen werden.
 */
export function pickImages(source: PickSource, handler: (files: File[]) => void): void {
  onPicked = handler;
  byId<HTMLInputElement>(inputIds[source]).click();
}

/** Bereitet ausgewählte Fotos als Seiten vor; fehlerhafte Dateien werden übersprungen. */
export async function prepareFiles(files: readonly File[]): Promise<{ pages: Blob[]; failed: number }> {
  const pages: Blob[] = [];
  let failed = 0;
  for (const file of files) {
    try {
      pages.push(await prepareImage(file));
    } catch (error) {
      console.error(error);
      failed++;
    }
  }
  return { pages, failed };
}

export async function saveScannedDocument(pages: Blob[]): Promise<void> {
  const doc = await createDocument({ title: defaultTitle(new Date()), pages });
  void requestPersistentStorage();
  status(`Dokument mit ${countLabel(pages.length, 'Seite', 'Seiten')} gespeichert.`, 'success');
  navigate({ name: 'document', id: doc.id });
}

let importing = false;

/** Fotos aus der Mediathek direkt als neues Dokument übernehmen. */
export function importFromPhotos(): void {
  if (importing) {
    status('Bitte warten, die Fotos werden noch gespeichert.');
    return;
  }
  pickImages('photos', async (files) => {
    importing = true;
    status(files.length === 1 ? 'Foto wird gespeichert …' : `${files.length} Fotos werden gespeichert …`);
    try {
      const { pages, failed } = await prepareFiles(files);
      if (pages.length === 0) {
        throw new Error('Keine lesbaren Bilder');
      }
      await saveScannedDocument(pages);
      if (failed > 0) {
        status(`${countLabel(failed, 'Bild konnte', 'Bilder konnten')} nicht gelesen werden.`, 'error');
      }
    } catch (error) {
      console.error(error);
      status('Die Fotos konnten nicht gespeichert werden. Bitte versuche es erneut.', 'error');
    } finally {
      importing = false;
    }
  });
}
