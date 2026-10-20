import { h } from '../dom.ts';
import { status } from '../feedback.ts';
import { spokenDate } from '../format.ts';
import { href, navigate } from '../router.ts';
import { exportDocument, ExportError, exportErrorMessages, formatLabels, type ExportFormat } from '../export/export.ts';
import { textFromOcr } from '../ocr/format.ts';
import { pageMapFor } from '../reader/pages.ts';
import { splitParagraphs } from '../reader/text.ts';
import { deleteDocument, getDocument, movePage, updateDocument, type VoxDocument } from '../storage/documents.ts';
import { storageErrorMessage } from '../storage/errors.ts';
import { getPosition, savePosition, type ReadingPosition } from '../storage/positions.ts';
import { section, viewHeader, type View } from './components.ts';
import { notFoundView } from './not-found.ts';
import { ocrPanel } from './ocr-panel.ts';
import { setVoiceContext } from '../voice/controller.ts';
import { createDelivery } from './delivery.ts';
import { readerPanel, type ReaderPanel } from './reader-panel.ts';

function shareFiles(doc: VoxDocument): File[] {
  const base = doc.title.replace(/[\\/:*?"<>|]+/g, '-');
  return doc.pages.map(
    (page, index) =>
      new File([page], doc.pages.length > 1 ? `${base} – Seite ${index + 1}.jpg` : `${base}.jpg`, {
        type: page.type || 'image/jpeg',
      }),
  );
}

function canShare(doc: VoxDocument): boolean {
  if (typeof navigator.share !== 'function') {
    return false;
  }
  const files = shareFiles(doc);
  return files.length === 0 || !navigator.canShare || navigator.canShare({ files });
}

export async function documentView(id: string): Promise<View> {
  const found = await getDocument(id);
  if (!found) {
    return notFoundView('Dieses Dokument gibt es nicht mehr. Vielleicht wurde es gelöscht.');
  }
  let doc: VoxDocument = found;
  let pageUrls: string[] = [];
  // Eine fehlende Leseposition ist kein Fehler – dann beginnt das Vorlesen am Anfang.
  const storedPosition: ReadingPosition | null = await getPosition(doc.id, doc.text).catch(() => null);

  const header = viewHeader(doc.title, h('p', { class: 'view-intro' }, `Gescannt am ${spokenDate(doc.createdAt)}.`));
  const title = header.querySelector('h1') as HTMLHeadingElement;

  // ---------- Text und Vorlesen ----------
  const textBody = h('div', { class: 'doc-text' });
  const readerHolder = h('div', null);
  let reader: ReaderPanel | null = null;

  const renderText = (position: ReadingPosition | null = null): void => {
    reader?.destroy();
    reader = null;
    const texts = splitParagraphs(doc.text);
    if (texts.length === 0) {
      textBody.replaceChildren(
        h(
          'p',
          { class: 'empty' },
          doc.pages.length > 0
            ? 'Dieses Dokument hat noch keinen Text. Starte oben die Texterkennung oder gib ihn über „Text bearbeiten“ ein.'
            : 'Dieses Dokument hat noch keinen Text. Du kannst ihn über „Text bearbeiten“ eingeben oder diktieren.',
        ),
      );
      readerHolder.replaceChildren();
      return;
    }
    const elements = texts.map((text) => h('p', null, text));
    textBody.replaceChildren(...elements);
    const text = doc.text;
    reader = readerPanel(texts, elements, {
      position,
      save: (current) => {
        savePosition({ docId: doc.id, ...current }, text).catch((error: unknown) => {
          // Nur die Leseposition geht verloren; das Dokument selbst ist sicher.
          console.warn('Leseposition nicht gespeichert', error);
        });
      },
    }, pageMapFor(doc));
    readerHolder.replaceChildren(reader.element);
  };
  renderText(storedPosition);

  // ---------- Texterkennung ----------
  const ocr =
    doc.pages.length > 0
      ? ocrPanel(
          () => doc,
          (updated, textChanged) => {
            doc = updated;
            // Den Leser nur neu aufbauen, wenn sich der Text geändert hat – sonst bräche Vorlesen ab.
            if (textChanged) {
              renderText();
            }
          },
        )
      : null;

  // ---------- Formulare (Umbenennen, Text bearbeiten) ----------
  const formHolder = h('div', null);
  let returnFocus: HTMLElement | null = null;

  const closeForm = (): void => {
    formHolder.replaceChildren();
    returnFocus?.focus();
  };

  const openForm = (
    trigger: HTMLElement,
    label: string,
    field: HTMLInputElement | HTMLTextAreaElement,
    onSave: (value: string) => Promise<void>,
  ): void => {
    returnFocus = trigger;
    field.id = 'edit-field';
    const form = h(
      'form',
      {
        class: 'card edit-form',
        onsubmit: async (event: Event) => {
          event.preventDefault();
          try {
            await onSave(field.value);
            closeForm();
          } catch (error) {
            console.error(error);
            status(storageErrorMessage(error), 'error');
          }
        },
      },
      h('label', { for: 'edit-field' }, label),
      field,
      h(
        'div',
        { class: 'button-row' },
        h('button', { type: 'submit', class: 'button button-primary' }, 'Speichern'),
        h(
          'button',
          {
            type: 'button',
            class: 'button button-secondary',
            onclick: () => {
              closeForm();
              status('Abgebrochen.');
            },
          },
          'Abbrechen',
        ),
      ),
    );
    formHolder.replaceChildren(form);
    field.focus();
  };

  const renameButton = h('button', { type: 'button', class: 'button button-secondary' }, 'Umbenennen');
  renameButton.addEventListener('click', () => {
    const input = h('input', { type: 'text', value: doc.title, required: true, maxlength: '120', enterkeyhint: 'done' });
    openForm(renameButton, 'Neuer Name', input, async (value) => {
      const newTitle = value.trim();
      if (!newTitle || newTitle === doc.title) {
        return;
      }
      doc = await updateDocument(doc.id, { title: newTitle });
      title.textContent = doc.title;
      document.title = `${doc.title} – VoxDoc`;
      status(`Umbenannt in „${doc.title}“.`, 'success');
    });
  });

  const editButton = h('button', { type: 'button', class: 'button button-secondary' }, 'Text bearbeiten');
  editButton.addEventListener('click', () => {
    const textarea = h('textarea', { rows: '10', autocapitalize: 'sentences' });
    textarea.value = doc.text;
    openForm(editButton, 'Text des Dokuments', textarea, async (value) => {
      doc = await updateDocument(doc.id, { text: value.trim() });
      renderText();
      ocr?.refresh();
      status('Text gespeichert.', 'success');
    });
  });

  const shareButton = canShare(doc)
    ? h(
        'button',
        {
          type: 'button',
          class: 'button button-secondary',
          onclick: async () => {
            const files = shareFiles(doc);
            try {
              await navigator.share({
                title: doc.title,
                ...(doc.text ? { text: doc.text } : {}),
                ...(files.length > 0 ? { files } : {}),
              });
            } catch (error) {
              if ((error as DOMException).name !== 'AbortError') {
                status('Teilen ist fehlgeschlagen.', 'error');
              }
            }
          },
        },
        'Teilen',
      )
    : null;

  // ---------- Exportieren ----------
  const formats: ExportFormat[] = ['pdf', 'html', 'txt'];
  const formatHints: Record<ExportFormat, string> = {
    pdf: 'Getaggtes PDF mit Überschriften, Absätzen und echtem Text',
    html: 'Webseite mit Überschriften und Absätzen, in jedem Browser lesbar',
    txt: 'Nur der Text, ohne Fotos',
  };
  let exportFormat: ExportFormat = 'pdf';
  const formatInputs = new Map<ExportFormat, HTMLInputElement>();
  const photosToggle = h('input', { id: 'export-photos', type: 'checkbox', switch: true, checked: doc.pages.length > 0, disabled: doc.pages.length === 0 });
  const photosField = h(
    'div',
    { class: 'field field-toggle' },
    h('label', { for: 'export-photos' }, 'Fotos einschließen'),
    photosToggle,
    h('p', { class: 'hint', id: 'export-photos-hint' }, 'Die Fotos werden mit Alternativtext hinter dem Text eingefügt.'),
  );
  photosToggle.setAttribute('aria-describedby', 'export-photos-hint');
  const setFormat = (format: ExportFormat): void => {
    exportFormat = format;
    formatInputs.get(format)!.checked = true;
    // TXT kann keine Fotos enthalten – Schalter ausblenden statt wirkungslos anzubieten.
    photosField.hidden = format === 'txt' || doc.pages.length === 0;
  };
  const formatGroup = h(
    'fieldset',
    { class: 'radio-group' },
    h('legend', null, 'Format'),
    ...formats.map((format) => {
      const input = h('input', {
        type: 'radio',
        name: 'export-format',
        value: format,
        'aria-describedby': `export-hint-${format}`,
        onchange: () => setFormat(format),
      });
      formatInputs.set(format, input);
      // Beschreibung außerhalb des Labels: Der Name bleibt kurz („PDF“), die Beschreibung folgt einmal.
      return h(
        'div',
        { class: 'radio-described' },
        h('label', { class: 'radio' }, input, formatLabels[format]),
        h('p', { class: 'hint', id: `export-hint-${format}` }, formatHints[format]),
      );
    }),
  );
  const exportButton = h('button', { type: 'button', class: 'button button-primary' }, 'Exportieren');
  let exportSummary = '';
  const delivery = createDelivery('Datei speichern', (result, name) => {
    if (result === 'needsTap') {
      status(`${exportSummary} ist fertig. Tippe auf „Datei speichern“, um sie abzulegen.`);
    } else if (result === 'cancelled') {
      status('Export nicht gespeichert.');
    } else if (result === 'downloaded') {
      status(`${exportSummary} heruntergeladen als „${name}“. Du findest sie in der Dateien-App unter Downloads.`, 'success');
    } else {
      status(`${exportSummary} weitergegeben.`, 'success');
    }
  });
  const runExport = async (format: ExportFormat = exportFormat): Promise<void> => {
    setFormat(format);
    exportButton.disabled = true;
    status(`${formatLabels[format]} wird erstellt …`);
    try {
      const result = await exportDocument(doc, format, photosToggle.checked);
      exportSummary = result.summary;
      if (result.replacedCharacters > 0) {
        status(`${result.replacedCharacters} Zeichen konnten im PDF nicht dargestellt werden und wurden durch Fragezeichen ersetzt.`);
      }
      await delivery.deliver(result.blob, result.name);
    } catch (error) {
      console.error(error);
      status(error instanceof ExportError ? exportErrorMessages[error.reason] : 'Der Export ist fehlgeschlagen. Versuche es erneut.', 'error');
    } finally {
      exportButton.disabled = false;
    }
  };
  exportButton.addEventListener('click', () => void runExport());
  setFormat('pdf');
  const exportSection = section(
    'export-heading',
    'Exportieren',
    formatGroup,
    photosField,
    h('div', { class: 'button-stack' }, exportButton, delivery.button),
    h(
      'p',
      { class: 'hint' },
      'Die Datei entsteht auf diesem iPhone. Danach wählst du im Teilen-Menü, wo sie gespeichert wird, zum Beispiel „In Dateien sichern“.',
    ),
  );

  const unregisterVoice = setVoiceContext({
    beforeListening: () => reader?.pauseQuietly?.(),
    afterListeningFailed: () => reader?.resumeIfInterrupted?.(),
    handle: (command) => {
      if (reader?.handle?.(command)) {
        return true;
      }
      switch (command.type) {
        case 'read':
        case 'resume':
        case 'restart':
        case 'pause':
        case 'stop':
        case 'nextPage':
        case 'previousPage':
        case 'nextParagraph':
        case 'previousParagraph':
        case 'repeat':
          status(doc.pages.length > 0 ? 'Dieses Dokument hat noch keinen Text zum Vorlesen. Starte die Texterkennung.' : 'Dieses Dokument hat noch keinen Text zum Vorlesen.', 'error');
          return true;
        case 'export':
          void runExport(command.format);
          return true;
        case 'save': {
          const form = formHolder.querySelector('form');
          if (form) {
            form.requestSubmit();
          } else {
            status('Das Dokument ist bereits gespeichert. Änderungen speichert VoxDoc sofort.');
          }
          return true;
        }
        default:
          return false;
      }
    },
  });

  const deleteButton = h(
    'button',
    {
      type: 'button',
      class: 'button button-danger',
      onclick: async () => {
        if (!window.confirm(`„${doc.title}“ wirklich löschen? Das kann nicht rückgängig gemacht werden.`)) {
          return;
        }
        try {
          await deleteDocument(doc.id);
        } catch (error) {
          status(storageErrorMessage(error), 'error');
          return;
        }
        status(`„${doc.title}“ gelöscht.`, 'success');
        navigate({ name: 'library' });
      },
    },
    'Dokument löschen',
  );

  // ---------- Seiten (Fotos und Reihenfolge) ----------
  const photoHeading = h('h2', { id: 'photo-heading', tabindex: '-1' });
  const photoList = h('ol', { class: 'page-list' });
  const photoSection = doc.pages.length > 0 ? h('section', { class: 'section', 'aria-labelledby': 'photo-heading' }, photoHeading, photoList) : null;

  const renderPhotos = (focus?: { index: number; direction: 'up' | 'down' }): void => {
    pageUrls.forEach((url) => URL.revokeObjectURL(url));
    pageUrls = doc.pages.map((page) => URL.createObjectURL(page));
    const count = pageUrls.length;
    photoHeading.textContent = count === 1 ? 'Foto' : `Fotos (${count} Seiten)`;
    const moveButtons: { up?: HTMLButtonElement; down?: HTMLButtonElement }[] = [];
    photoList.replaceChildren(
      ...pageUrls.map((url, index) => {
        const number = index + 1;
        const buttons: { up?: HTMLButtonElement; down?: HTMLButtonElement } = {};
        if (index > 0) {
          buttons.up = h('button', { type: 'button', class: 'button button-secondary', onclick: () => void move(index, index - 1, 'up') }, `Seite ${number} nach vorn verschieben`);
        }
        if (index < count - 1) {
          buttons.down = h('button', { type: 'button', class: 'button button-secondary', onclick: () => void move(index, index + 1, 'down') }, `Seite ${number} nach hinten verschieben`);
        }
        moveButtons.push(buttons);
        return h(
          'li',
          { class: 'doc-page' },
          h(
            'figure',
            { class: 'doc-photo' },
            h('img', {
              src: url,
              alt: count === 1 ? `Foto des Dokuments „${doc.title}“` : `Foto von Seite ${number}`,
              decoding: 'async',
            }),
            count > 1 ? h('figcaption', null, `Seite ${number} von ${count}`) : null,
          ),
          count > 1 ? h('div', { class: 'button-row' }, buttons.up ?? null, buttons.down ?? null) : null,
        );
      }),
    );
    if (focus) {
      // Fokus bleibt bei der verschobenen Seite, damit man sie weiter verschieben kann.
      const target = moveButtons[focus.index];
      (target?.[focus.direction] ?? target?.up ?? target?.down ?? photoHeading).focus();
    }
  };

  const move = async (from: number, to: number, direction: 'up' | 'down'): Promise<void> => {
    try {
      const result = await movePage(doc.id, from, to);
      doc = result.doc;
      renderPhotos({ index: to, direction });
      const notes = [`Seite ${from + 1} ist jetzt Seite ${to + 1}.`];
      if (result.textReordered) {
        renderText();
        notes.push('Der erkannte Text wurde neu geordnet.');
      } else if (doc.ocr && doc.text.trim() && doc.text !== textFromOcr(doc.ocr)) {
        notes.push('Dein bearbeiteter Text wurde nicht umsortiert.');
      }
      ocr?.refresh();
      status(notes.join(' '), 'success');
    } catch (error) {
      status(storageErrorMessage(error), 'error');
    }
  };
  renderPhotos();

  const element = h(
    'div',
    { class: 'view' },
    h('a', { class: 'back-link', href: href({ name: 'library' }) }, 'Zurück zur Bibliothek'),
    header,
    ocr?.element,
    readerHolder,
    section('text-heading', 'Text', textBody),
    section(
      'actions-heading',
      'Bearbeiten',
      h('div', { class: 'button-stack' }, editButton, renameButton, shareButton),
      formHolder,
    ),
    exportSection,
    photoSection,
    h('div', { class: 'button-stack danger-zone' }, deleteButton),
  );

  return {
    title: doc.title,
    element,
    destroy: () => {
      unregisterVoice();
      reader?.destroy();
      ocr?.destroy();
      pageUrls.forEach((url) => URL.revokeObjectURL(url));
    },
  };
}
