import { germanVoices, onVoicesChanged, speak, speechSupported } from '../audio/speech.ts';
import { playTone } from '../audio/tones.ts';
import { h } from '../dom.ts';
import { status } from '../feedback.ts';
import { countLabel, megabytes } from '../format.ts';
import { deleteAllDocuments, listDocuments } from '../storage/documents.ts';
import {
  getSettings,
  updateSettings,
  SPEECH_RATE_MAX,
  SPEECH_RATE_MIN,
  type Theme,
} from '../storage/settings.ts';
import { section, viewHeader, type View } from './components.ts';

const themeLabels: Record<Theme, string> = {
  dark: 'Dunkel',
  light: 'Hell',
  system: 'Wie iPhone-Einstellung',
};

function rateText(rate: number): string {
  return rate === 1 ? 'normal' : `${rate.toLocaleString('de-DE', { minimumFractionDigits: 1 })}-fach`;
}

/** Schalter: auf iOS 17.4+ als nativer Switch, sonst als Checkbox. */
function toggle(id: string, label: string, description: string, checked: boolean, onChange: (value: boolean) => void): HTMLElement {
  const input = h('input', {
    id,
    type: 'checkbox',
    switch: true,
    checked,
    'aria-describedby': `${id}-hint`,
    onchange: (event: Event) => onChange((event.target as HTMLInputElement).checked),
  });
  return h(
    'div',
    { class: 'field field-toggle' },
    h('label', { for: id }, label),
    input,
    h('p', { id: `${id}-hint`, class: 'hint' }, description),
  );
}

function speechSection(): { element: HTMLElement; destroy: () => void } {
  if (!speechSupported) {
    return {
      element: section('speech-heading', 'Sprachausgabe', h('p', null, 'Dieser Browser unterstützt keine Sprachausgabe.')),
      destroy: () => {},
    };
  }

  const settings = getSettings();
  const voiceSelect = h('select', {
    id: 'voice-select',
    onchange: (event: Event) => {
      updateSettings({ voiceURI: (event.target as HTMLSelectElement).value });
      status('Stimme geändert.');
    },
  });
  const fillVoices = (): void => {
    const selected = getSettings().voiceURI;
    voiceSelect.replaceChildren(
      h('option', { value: '', selected: selected === '' }, 'Standardstimme'),
      ...germanVoices().map((voice) =>
        h('option', { value: voice.voiceURI, selected: voice.voiceURI === selected }, voice.name),
      ),
    );
  };
  fillVoices();
  const stopListening = onVoicesChanged(fillVoices);

  const rateOutput = h('output', { for: 'rate-input', id: 'rate-output' }, rateText(settings.speechRate));
  const rateInput = h('input', {
    id: 'rate-input',
    type: 'range',
    min: String(SPEECH_RATE_MIN),
    max: String(SPEECH_RATE_MAX),
    step: '0.1',
    value: String(settings.speechRate),
    'aria-valuetext': rateText(settings.speechRate),
  });
  rateInput.addEventListener('input', () => {
    const rate = Math.round(Number(rateInput.value) * 10) / 10;
    const text = rateText(rate);
    rateOutput.textContent = text;
    rateInput.setAttribute('aria-valuetext', text);
    updateSettings({ speechRate: rate });
  });

  return {
    element: section(
      'speech-heading',
      'Sprachausgabe',
      h('p', { class: 'hint' }, 'Gilt für „Vorlesen“ bei Dokumenten.'),
      h('div', { class: 'field' }, h('label', { for: 'voice-select' }, 'Stimme'), voiceSelect),
      h(
        'div',
        { class: 'field' },
        h('div', { class: 'field-label-row' }, h('label', { for: 'rate-input' }, 'Sprechtempo'), rateOutput),
        rateInput,
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'button button-secondary',
          onclick: () => speak('Hallo, ich bin VoxDoc. So klingt das Vorlesen mit dieser Einstellung.'),
        },
        'Sprachausgabe testen',
      ),
    ),
    destroy: stopListening,
  };
}

function feedbackSection(): HTMLElement {
  const settings = getSettings();
  return section(
    'feedback-heading',
    'Rückmeldungen',
    toggle(
      'tones-toggle',
      'Signaltöne',
      'Kurzer Ton bei Erfolg und Fehler, zum Beispiel nach dem Speichern eines Scans.',
      settings.tones,
      (tones) => {
        updateSettings({ tones });
        if (tones) {
          playTone('success');
        }
        status(tones ? 'Signaltöne an.' : 'Signaltöne aus.');
      },
    ),
    toggle(
      'speak-status-toggle',
      'Statusmeldungen vorlesen',
      'Für die Nutzung ohne VoiceOver. Mit eingeschaltetem VoiceOver werden Meldungen ohnehin angesagt.',
      settings.speakStatus,
      (speakStatus) => {
        updateSettings({ speakStatus });
        status(speakStatus ? 'Statusmeldungen werden vorgelesen.' : 'Statusmeldungen werden nicht mehr vorgelesen.');
      },
    ),
  );
}

function themeSection(): HTMLElement {
  const current = getSettings().theme;
  return section(
    'theme-heading',
    'Darstellung',
    h(
      'fieldset',
      { class: 'radio-group' },
      h('legend', null, 'Farbschema'),
      ...(Object.keys(themeLabels) as Theme[]).map((theme) =>
        h(
          'label',
          { class: 'radio' },
          h('input', {
            type: 'radio',
            name: 'theme',
            value: theme,
            checked: theme === current,
            onchange: () => {
              updateSettings({ theme });
              status(`Farbschema: ${themeLabels[theme]}.`);
            },
          }),
          themeLabels[theme],
        ),
      ),
    ),
  );
}

async function storageSection(): Promise<HTMLElement> {
  const documents = await listDocuments();
  const summary = h('p', null, `${countLabel(documents.length, 'Dokument', 'Dokumente')} gespeichert.`);
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (estimate?.usage !== undefined) {
      summary.textContent += ` Belegter Speicher: etwa ${megabytes(estimate.usage)}.`;
    }
  } catch {
    // Speicherschätzung nicht verfügbar.
  }

  return section(
    'storage-heading',
    'Speicher',
    h('p', { class: 'hint' }, 'Alle Dokumente bleiben ausschließlich auf diesem iPhone.'),
    summary,
    documents.length > 0
      ? h(
          'button',
          {
            type: 'button',
            class: 'button button-danger',
            onclick: async () => {
              if (!window.confirm(`Wirklich alle ${documents.length} Dokumente löschen? Das kann nicht rückgängig gemacht werden.`)) {
                return;
              }
              await deleteAllDocuments();
              summary.textContent = 'Keine Dokumente gespeichert.';
              status('Alle Dokumente wurden gelöscht.', 'success');
            },
          },
          'Alle Dokumente löschen',
        )
      : null,
  );
}

function aboutSection(): HTMLElement {
  return section(
    'about-heading',
    'Über VoxDoc',
    h(
      'dl',
      { class: 'facts' },
      h('dt', null, 'Version'),
      h('dd', null, __APP_VERSION__),
      h('dt', null, 'Verbindung'),
      h('dd', { 'data-connection-state': true }, navigator.onLine ? 'Online' : 'Offline'),
    ),
  );
}

export async function settingsView(): Promise<View> {
  const speech = speechSection();
  return {
    title: 'Einstellungen',
    element: h(
      'div',
      { class: 'view' },
      viewHeader('Einstellungen'),
      speech.element,
      feedbackSection(),
      themeSection(),
      await storageSection(),
      aboutSection(),
    ),
    destroy: speech.destroy,
  };
}
