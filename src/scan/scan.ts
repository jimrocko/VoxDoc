import { byId } from '../dom.ts';
import { status } from '../feedback.ts';
import { defaultTitle } from '../format.ts';
import { navigate } from '../router.ts';
import { createDocument, requestPersistentStorage } from '../storage/documents.ts';
import { prepareImage } from './image.ts';

export type ScanSource = 'camera' | 'photos';

const inputIds: Record<ScanSource, string> = {
  camera: 'camera-input',
  photos: 'photo-input',
};

let busy = false;

async function handleFile(file: File): Promise<void> {
  busy = true;
  status('Foto wird gespeichert …');
  try {
    const image = await prepareImage(file);
    const doc = await createDocument({ title: defaultTitle(new Date()), image });
    void requestPersistentStorage();
    status(`Dokument gespeichert: ${doc.title}.`, 'success');
    navigate({ name: 'document', id: doc.id });
  } catch (error) {
    console.error(error);
    status('Das Foto konnte nicht gespeichert werden. Bitte versuche es erneut.', 'error');
  } finally {
    busy = false;
  }
}

export function initScanInputs(): void {
  for (const id of Object.values(inputIds)) {
    const input = byId<HTMLInputElement>(id);
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.value = '';
      if (file) {
        void handleFile(file);
      }
    });
  }
}

/** Öffnet die Kamera (bzw. die Fotoauswahl). Muss aus einem Tippen heraus aufgerufen werden. */
export function startScan(source: ScanSource): void {
  if (busy) {
    status('Bitte warten, das letzte Foto wird noch gespeichert.');
    return;
  }
  byId<HTMLInputElement>(inputIds[source]).click();
}
