import { germanVoices, onVoicesChanged, speak, speechSupported } from '../audio/speech.ts';
import { playTone } from '../audio/tones.ts';
import { h } from '../dom.ts';
import { rateLabel } from '../reader/reader.ts';
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
import { cachedOcrBytes, deleteOcrAssets, loadOcrAssets } from '../ocr/assets.ts';
import { classifyOcrError, DOWNLOAD_MB, ocrErrorMessages } from '../ocr/errors.ts';
import { backupFileName, createBackup, restoreBackup } from '../storage/backup.ts';
import { storageErrorMessage } from '../storage/errors.ts';
import { checkStorageHealth, EVICTION_HINT } from '../storage/health.ts';
import { section, viewHeader, type View } from './components.ts';

const themeLabels: Record<Theme, string> = {
  dark: 'Dunkel',
  light: 'Hell',
  system: 'Wie iPhone-Einstellung',
};

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

  const rateOutput = h('output', { for: 'rate-input', id: 'rate-output' }, rateLabel(settings.speechRate));
  const rateInput = h('input', {
    id: 'rate-input',
    type: 'range',
    min: String(SPEECH_RATE_MIN),
    max: String(SPEECH_RATE_MAX),
    step: '0.1',
    value: String(settings.speechRate),
    'aria-valuetext': rateLabel(settings.speechRate),
  });
  rateInput.addEventListener('input', () => {
    const rate = Math.round(Number(rateInput.value) * 10) / 10;
    const text = rateLabel(rate);
    rateOutput.textContent = text;
    rateInput.setAttribute('aria-valuetext', text);
    updateSettings({ speechRate: rate });
  });

  return {
    element: section(
      'speech-heading',
      'Sprachausgabe',
      h('p', { class: 'hint' }, 'Gilt für das Vorlesen von Dokumenten. Das Tempo lässt sich auch beim Vorlesen ändern.'),
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
      toggle(
        'announce-paragraphs-toggle',
        'Absatznummer ansagen',
        'Beim Springen zum vorherigen oder nächsten Absatz wird zuerst „Absatz 3 von 5“ gesprochen.',
        settings.announceParagraphs,
        (announceParagraphs) => {
          updateSettings({ announceParagraphs });
          status(announceParagraphs ? 'Absatznummer wird angesagt.' : 'Absatznummer wird nicht angesagt.');
        },
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

function scannerSection(): HTMLElement {
  return section(
    'scanner-heading',
    'Scanner',
    toggle(
      'settings-auto-capture',
      'Automatisch auslösen',
      'Der Scanner nimmt eine Seite auf, sobald sie vollständig und ruhig im Bild ist.',
      getSettings().autoCapture,
      (autoCapture) => {
        updateSettings({ autoCapture });
        status(autoCapture ? 'Automatisch auslösen an.' : 'Automatisch auslösen aus.');
      },
    ),
  );
}

async function ocrSection(): Promise<{ element: HTMLElement; destroy: () => void }> {
  const summary = h('p', { id: 'ocr-assets-status' });
  const progress = h('progress', { max: '100', value: '0', 'aria-label': 'Download der Sprachdaten', hidden: true });
  const downloadButton = h('button', { type: 'button', class: 'button button-secondary' }, 'Jetzt für Offline-Nutzung laden');
  const deleteButton = h('button', { type: 'button', class: 'button button-danger' }, 'Sprachdaten löschen');
  let destroyed = false;

  const refresh = async (): Promise<void> => {
    const bytes = await cachedOcrBytes();
    if (destroyed) {
      return;
    }
    summary.textContent =
      bytes === null
        ? `Die deutschen Sprachdaten sind noch nicht auf diesem iPhone. Sie werden bei der ersten Texterkennung geladen (etwa ${DOWNLOAD_MB} MB).`
        : `Die deutschen Sprachdaten sind auf diesem iPhone gespeichert (${megabytes(bytes)}). Die Texterkennung funktioniert offline.`;
    downloadButton.hidden = bytes !== null;
    deleteButton.hidden = bytes === null;
  };

  downloadButton.addEventListener('click', async () => {
    downloadButton.disabled = true;
    progress.hidden = false;
    status(`Sprachdaten werden geladen, etwa ${DOWNLOAD_MB} Megabyte.`);
    try {
      await loadOcrAssets((loaded, total) => {
        progress.value = total ? Math.round((loaded / total) * 100) : 0;
      });
      status('Sprachdaten gespeichert. Die Texterkennung funktioniert jetzt auch offline.', 'success');
    } catch (error) {
      status(ocrErrorMessages[classifyOcrError(error)], 'error');
    } finally {
      downloadButton.disabled = false;
      progress.hidden = true;
      await refresh();
    }
  });
  deleteButton.addEventListener('click', async () => {
    if (!window.confirm('Sprachdaten der Texterkennung löschen? Sie werden bei der nächsten Erkennung neu geladen.')) {
      return;
    }
    await deleteOcrAssets();
    await refresh();
    status('Sprachdaten gelöscht.', 'success');
    downloadButton.focus();
  });

  await refresh();
  return {
    element: section(
      'ocr-settings-heading',
      'Texterkennung',
      toggle(
        'auto-ocr-toggle',
        'Nach dem Scannen automatisch erkennen',
        'Startet die Texterkennung, sobald ein gescanntes Dokument gespeichert ist.',
        getSettings().autoOcr,
        (autoOcr) => {
          updateSettings({ autoOcr });
          status(autoOcr ? 'Automatische Texterkennung an.' : 'Automatische Texterkennung aus.');
        },
      ),
      summary,
      progress,
      h('div', { class: 'button-stack' }, downloadButton, deleteButton),
      h('p', { class: 'hint' }, 'Die Texterkennung (Tesseract) läuft vollständig auf dem iPhone. Fotos und Texte werden nicht übertragen.'),
    ),
    destroy: () => {
      destroyed = true;
    },
  };
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
  const summary = h('p', null);
  const persistence = h('p', { id: 'storage-persistence' });
  let count = 0;
  try {
    count = (await listDocuments()).length;
    summary.textContent = `${countLabel(count, 'Dokument', 'Dokumente')} gespeichert.`;
  } catch (error) {
    summary.textContent = storageErrorMessage(error);
  }
  const health = await checkStorageHealth();
  if (health.usage !== null) {
    summary.textContent += ` Belegter Speicher: etwa ${megabytes(health.usage)}${health.quota ? ` von ${megabytes(health.quota)}` : ''}.`;
  }
  const notes: string[] = [];
  if (health.nearlyFull) {
    notes.push('Der Speicher ist fast voll. Neue Scans können fehlschlagen.');
  }
  if (health.persisted === true) {
    notes.push('Safari hat zugesagt, die Daten nicht automatisch zu löschen.');
  } else if (health.evictionRisk) {
    notes.push(EVICTION_HINT);
  } else {
    notes.push('Erstelle regelmäßig eine Sicherung, damit beim Löschen der App oder einem neuen iPhone nichts verloren geht.');
  }
  persistence.textContent = notes.join(' ');

  return section(
    'storage-heading',
    'Speicher',
    h('p', { class: 'hint' }, 'Alle Dokumente bleiben ausschließlich auf diesem iPhone. Es gibt keine Anmeldung und keine Übertragung in eine Cloud.'),
    summary,
    persistence,
    count > 0
      ? h(
          'button',
          {
            type: 'button',
            class: 'button button-danger',
            onclick: async () => {
              if (!window.confirm(`Wirklich alle ${count} Dokumente löschen? Das kann nicht rückgängig gemacht werden. Erstelle vorher eine Sicherung, wenn du sie später noch brauchst.`)) {
                return;
              }
              try {
                await deleteAllDocuments();
              } catch (error) {
                status(storageErrorMessage(error), 'error');
                return;
              }
              summary.textContent = 'Keine Dokumente gespeichert.';
              status('Alle Dokumente wurden gelöscht.', 'success');
            },
          },
          'Alle Dokumente löschen',
        )
      : null,
  );
}

/** Übergibt eine Datei an das Teilen-Menü (z. B. „In Dateien sichern“) oder lädt sie herunter. */
async function offerFile(blob: Blob, name: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], name, { type: blob.type });
  if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return 'shared';
    } catch (error) {
      if ((error as DOMException).name === 'AbortError') {
        return 'cancelled';
      }
      // Teilen nicht möglich – auf Herunterladen ausweichen.
    }
  }
  const url = URL.createObjectURL(file);
  const link = h('a', { href: url, download: name, hidden: true });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'downloaded';
}

function backupSection(): HTMLElement {
  const exportButton = h('button', { type: 'button', class: 'button button-secondary' }, 'Sicherung erstellen');
  const importButton = h('button', { type: 'button', class: 'button button-secondary' }, 'Sicherung wiederherstellen');
  const input = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, tabindex: '-1', 'aria-hidden': 'true' });

  exportButton.addEventListener('click', async () => {
    exportButton.disabled = true;
    status('Sicherung wird erstellt …');
    try {
      const { blob, count } = await createBackup();
      if (count === 0) {
        status('Es gibt noch keine Dokumente zum Sichern.');
        return;
      }
      const name = backupFileName();
      const result = await offerFile(blob, name);
      const what = `Sicherung mit ${countLabel(count, 'Dokument', 'Dokumenten')} (${megabytes(blob.size)})`;
      if (result === 'cancelled') {
        status(`${what} wurde nicht gespeichert.`);
      } else if (result === 'downloaded') {
        status(`${what} heruntergeladen als „${name}“. Du findest sie in der Dateien-App unter Downloads.`, 'success');
      } else {
        status(`${what} weitergegeben.`, 'success');
      }
    } catch (error) {
      status(`Die Sicherung konnte nicht erstellt werden. ${storageErrorMessage(error)}`, 'error');
    } finally {
      exportButton.disabled = false;
      exportButton.focus();
    }
  });

  importButton.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    status('Sicherung wird gelesen …');
    try {
      const { added, skipped } = await restoreBackup(file);
      const parts = [`${countLabel(added, 'Dokument', 'Dokumente')} wiederhergestellt.`];
      if (skipped > 0) {
        parts.push(`${countLabel(skipped, 'Dokument war', 'Dokumente waren')} schon vorhanden und ${skipped === 1 ? 'blieb' : 'blieben'} unverändert.`);
      }
      status(parts.join(' '), added > 0 ? 'success' : 'info');
    } catch (error) {
      status(storageErrorMessage(error), 'error');
    } finally {
      importButton.focus();
    }
  });

  return section(
    'backup-heading',
    'Datensicherung',
    h(
      'p',
      { class: 'hint' },
      'Speichert alle Dokumente mit Fotos, Text und Leseposition in einer Datei. Du entscheidest selbst, wo sie abgelegt wird, zum Beispiel in der Dateien-App. VoxDoc überträgt nichts automatisch.',
    ),
    h('div', { class: 'button-stack' }, exportButton, importButton),
    h('p', { class: 'hint' }, 'Beim Wiederherstellen werden nur fehlende Dokumente ergänzt; vorhandene bleiben unverändert.'),
    input,
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
  const ocr = await ocrSection();
  return {
    title: 'Einstellungen',
    element: h(
      'div',
      { class: 'view' },
      viewHeader('Einstellungen'),
      speech.element,
      feedbackSection(),
      scannerSection(),
      ocr.element,
      themeSection(),
      await storageSection(),
      backupSection(),
      aboutSection(),
    ),
    destroy: () => {
      speech.destroy();
      ocr.destroy();
    },
  };
}
