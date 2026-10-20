import { h } from '../dom.ts';
import { offerFile, type DeliveryResult } from '../share.ts';

export interface Delivery {
  /** Erscheint nur, wenn Safari zum Speichern ein erneutes Tippen verlangt. */
  button: HTMLButtonElement;
  deliver: (blob: Blob, name: string) => Promise<DeliveryResult>;
}

/**
 * Datei weitergeben; muss dafür erst getippt werden (z. B. nach einem
 * Sprachbefehl), erscheint ein Knopf und erhält den Fokus.
 */
export function createDelivery(buttonLabel: string, onResult: (result: DeliveryResult, name: string) => void): Delivery {
  const button = h('button', { type: 'button', class: 'button button-primary', hidden: true }, buttonLabel);
  let pending: { blob: Blob; name: string } | null = null;

  button.addEventListener('click', async () => {
    if (!pending) {
      return;
    }
    const { blob, name } = pending;
    const result = await offerFile(blob, name);
    if (result !== 'needsTap') {
      pending = null;
      button.hidden = true;
    }
    onResult(result, name);
  });

  return {
    button,
    async deliver(blob, name) {
      const result = await offerFile(blob, name);
      if (result === 'needsTap') {
        pending = { blob, name };
        button.hidden = false;
        button.focus();
      }
      onResult(result, name);
      return result;
    },
  };
}
