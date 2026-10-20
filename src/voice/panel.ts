import { playTone } from '../audio/tones.ts';
import { h } from '../dom.ts';
import { status } from '../feedback.ts';
import { getSettings, updateSettings } from '../storage/settings.ts';
import { commandHelp, parseAlternatives, parseCommand, type VoiceCommand } from './commands.ts';
import { listeningFailed, prepareForListening, runCommand } from './controller.ts';
import { listenErrorMessages, listenOnce, ListenError, voiceAvailability, type Listening } from './recognition.ts';

export const PRIVACY_NOTE =
  'Die Spracherkennung von Safari nutzt die Diktierfunktion von Apple. Je nach iPhone wird die Aufnahme auf dem Gerät oder bei Apple ausgewertet. VoxDoc selbst speichert keine Aufnahmen und sendet nichts an eigene Server.';

export const VOICE_CONTROL_HINT =
  'Unabhängig davon funktioniert die iOS-Sprachsteuerung (Einstellungen › Bedienungshilfen › Sprachsteuerung): Sage „Tippe auf“ und den Namen eines Knopfs, zum Beispiel „Tippe auf Vorlesen“. Sie läuft auch in der installierten App.';

function micIcon(): SVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3');
  svg.append(path);
  return svg;
}

/**
 * Knopf „Befehl“ und Befehlsfenster. Gesprochene und getippte Befehle laufen
 * durch denselben Parser; das Befehlsfeld funktioniert überall – auch mit der
 * Diktiertaste der iOS-Tastatur, wenn die Spracherkennung für Webseiten fehlt.
 */
export function initVoicePanel(): void {
  const fab = h('button', { type: 'button', id: 'voice-button', class: 'voice-fab', 'aria-haspopup': 'dialog' }, micIcon(), h('span', null, 'Befehl'));
  const title = h('h2', { id: 'voice-title' }, 'Sprachbefehl');
  const state = h('p', { id: 'voice-state', class: 'voice-state' });
  const recognitionArea = h('div', { class: 'button-stack' });
  const input = h('input', {
    id: 'voice-input',
    type: 'text',
    autocomplete: 'off',
    autocapitalize: 'off',
    enterkeyhint: 'go',
    'aria-describedby': 'voice-input-hint',
  });
  const form = h(
    'form',
    { class: 'voice-form' },
    h('label', { for: 'voice-input' }, 'Befehl eingeben oder diktieren'),
    input,
    h('p', { id: 'voice-input-hint', class: 'hint' }, 'Zum Diktieren auf der Tastatur das Mikrofon antippen.'),
    h('button', { type: 'submit', class: 'button button-secondary' }, 'Ausführen'),
  );
  const listHeading = h('h3', { id: 'voice-list-heading', tabindex: '-1' }, 'Was kann ich sagen?');
  const closeButton = h('button', { type: 'button', class: 'button button-secondary' }, 'Schließen');
  const dialog = h(
    'dialog',
    { id: 'voice-dialog', class: 'voice-dialog', 'aria-labelledby': 'voice-title' },
    title,
    state,
    recognitionArea,
    form,
    listHeading,
    h('ul', { class: 'bullets voice-commands' }, ...commandHelp.map((item) => h('li', null, h('strong', null, `„${item.say}“`), ` – ${item.does}`))),
    h('p', { class: 'hint' }, VOICE_CONTROL_HINT),
    closeButton,
  );
  document.body.append(dialog);
  document.querySelector('.tab-bar')?.before(fab);

  let listening: Listening | null = null;
  let speakButton: HTMLButtonElement | null = null;

  const close = (): void => {
    listening?.abort();
    listening = null;
    if (dialog.open) {
      dialog.close();
    }
  };

  const execute = (command: VoiceCommand): void => {
    if (command.type === 'commands') {
      listHeading.focus();
      return;
    }
    close();
    void runCommand(command);
  };

  const notUnderstood = (heard: string): void => {
    const message = `„${heard}“ habe ich nicht als Befehl erkannt. Sage zum Beispiel „Vorlesen“ oder „Hilfe“.`;
    state.textContent = message;
    status(message, 'error');
  };

  /** Muss direkt im Tippen aufgerufen werden – iOS fragt dann nach Mikrofon und Spracherkennung. */
  const listen = (): void => {
    if (listening) {
      return;
    }
    prepareForListening();
    window.speechSynthesis?.cancel();
    // Keine Ansage, sonst würde das Mikrofon VoiceOver mithören – nur ein Ton und sichtbarer Text.
    if (getSettings().tones) {
      playTone('start');
    }
    state.textContent = 'Ich höre zu … Sprich jetzt deinen Befehl.';
    if (speakButton) {
      speakButton.disabled = true;
    }
    const current = listenOnce();
    listening = current;
    current.result
      .then((alternatives) => {
        const match = parseAlternatives(alternatives);
        if (match) {
          state.textContent = `Erkannt: „${match.heard}“`;
          execute(match.command);
        } else {
          notUnderstood(alternatives[0] ?? '');
          listeningFailed();
        }
      })
      .catch((error: unknown) => {
        const code = error instanceof ListenError ? error.code : 'unknown';
        listeningFailed();
        if (code === 'aborted') {
          return;
        }
        state.textContent = listenErrorMessages[code];
        status(listenErrorMessages[code], 'error');
      })
      .finally(() => {
        if (listening === current) {
          listening = null;
        }
        if (speakButton) {
          speakButton.disabled = false;
          if (dialog.open) {
            speakButton.focus();
          }
        }
      });
  };

  const renderRecognition = (): void => {
    const availability = voiceAvailability();
    speakButton = null;
    if (!availability.available) {
      recognitionArea.replaceChildren(h('p', { class: 'hint' }, availability.message));
      state.textContent = 'Tippe einen Befehl ein oder diktiere ihn.';
      return;
    }
    if (!getSettings().voiceRecognition) {
      const allow = h('button', { type: 'button', class: 'button button-primary' }, 'Spracherkennung erlauben und sprechen');
      allow.addEventListener('click', () => {
        updateSettings({ voiceRecognition: true });
        renderRecognition();
        listen();
      });
      recognitionArea.replaceChildren(h('p', { class: 'hint' }, PRIVACY_NOTE), allow);
      state.textContent = 'Sprich einen Befehl oder tippe ihn ein.';
      return;
    }
    speakButton = h('button', { type: 'button', class: 'button button-primary button-hero' }, 'Sprechen');
    speakButton.addEventListener('click', listen);
    recognitionArea.replaceChildren(speakButton);
  };

  fab.addEventListener('click', () => {
    renderRecognition();
    input.value = '';
    dialog.showModal();
    if (speakButton) {
      // Gleich zuhören – das Tippen auf „Befehl“ gilt als Benutzeraktion.
      speakButton.focus();
      listen();
    } else {
      (recognitionArea.querySelector('button') ?? input).focus();
    }
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) {
      input.focus();
      return;
    }
    const command = parseCommand(text);
    if (command) {
      execute(command);
    } else {
      notUnderstood(text);
      input.focus();
    }
  });
  closeButton.addEventListener('click', close);
  dialog.addEventListener('close', () => {
    listening?.abort();
    listening = null;
  });
}
