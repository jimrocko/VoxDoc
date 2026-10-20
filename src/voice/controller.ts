import { status } from '../feedback.ts';
import { navigate } from '../router.ts';
import { presetSearchQuery } from '../views/search.ts';
import type { CommandType, VoiceCommand } from './commands.ts';

/**
 * Die gerade angezeigte Ansicht übernimmt Befehle, die nur dort Sinn ergeben
 * (z. B. „Vorlesen“ im Dokument, „Aufnehmen“ im Scanner).
 */
export interface VoiceContext {
  /** `true`, wenn der Befehl hier ausgeführt wurde. */
  handle(command: VoiceCommand): boolean | Promise<boolean>;
  /** Vor dem Zuhören: z. B. Vorlesen anhalten, damit das Mikrofon die Stimme nicht aufnimmt. */
  beforeListening?(): void;
  /** Zuhören ohne verwertbaren Befehl beendet: Angehaltenes fortsetzen. */
  afterListeningFailed?(): void;
}

let context: VoiceContext | null = null;

export function setVoiceContext(next: VoiceContext): () => void {
  context = next;
  return () => {
    if (context === next) {
      context = null;
    }
  };
}

export function prepareForListening(): void {
  context?.beforeListening?.();
}

export function listeningFailed(): void {
  context?.afterListeningFailed?.();
}

/** Ehrliche Antwort, wenn ein Befehl in der aktuellen Ansicht nicht geht. */
const notHere: Partial<Record<CommandType, string>> = {
  capture: '„Aufnehmen“ geht im Scanner. Sage „Dokument scannen“, um ihn zu öffnen.',
  save: 'Hier gibt es nichts zu speichern. Dokumente speichert VoxDoc sofort; im Scanner sagst du „Speichern“.',
  exportPdf: '„Als PDF exportieren“ geht in einem geöffneten Dokument. Öffne zuerst ein Dokument in der Bibliothek.',
};
const readingHint = 'Das geht beim Vorlesen eines Dokuments. Öffne zuerst ein Dokument mit Text.';

export async function runCommand(command: VoiceCommand): Promise<void> {
  if (context && (await context.handle(command))) {
    return;
  }
  switch (command.type) {
    case 'scan':
      navigate({ name: 'scan' });
      return;
    case 'search':
      presetSearchQuery(command.query);
      navigate({ name: 'search' });
      return;
    case 'help':
      navigate({ name: 'help' });
      return;
    case 'home':
      navigate({ name: 'start' });
      return;
    case 'library':
      navigate({ name: 'library' });
      return;
    case 'settings':
      navigate({ name: 'settings' });
      return;
    case 'commands':
      // Die Liste zeigt das Befehlsfenster selbst an.
      return;
    default:
      status(notHere[command.type] ?? readingHint, 'error');
  }
}
