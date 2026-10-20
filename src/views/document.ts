import { h } from '../dom.ts';
import { status } from '../feedback.ts';
import { spokenDate } from '../format.ts';
import { href, navigate } from '../router.ts';
import { splitParagraphs } from '../reader/text.ts';
import { deleteDocument, getDocument, updateDocument, type VoxDocument } from '../storage/documents.ts';
import { section, viewHeader, type View } from './components.ts';
import { notFoundView } from './not-found.ts';
import { ocrPanel } from './ocr-panel.ts';
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
  const pageUrls = doc.pages.map((page) => URL.createObjectURL(page));

  const header = viewHeader(doc.title, h('p', { class: 'view-intro' }, `Gescannt am ${spokenDate(doc.createdAt)}.`));
  const title = header.querySelector('h1') as HTMLHeadingElement;

  // ---------- Text und Vorlesen ----------
  const textBody = h('div', { class: 'doc-text' });
  const readerHolder = h('div', null);
  let reader: ReaderPanel | null = null;

  const renderText = (): void => {
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
    reader = readerPanel(texts, elements);
    readerHolder.replaceChildren(reader.element);
  };
  renderText();

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
            status('Speichern fehlgeschlagen. Bitte versuche es erneut.', 'error');
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

  const deleteButton = h(
    'button',
    {
      type: 'button',
      class: 'button button-danger',
      onclick: async () => {
        if (!window.confirm(`„${doc.title}“ wirklich löschen? Das kann nicht rückgängig gemacht werden.`)) {
          return;
        }
        await deleteDocument(doc.id);
        status('Dokument gelöscht.', 'success');
        navigate({ name: 'library' });
      },
    },
    'Dokument löschen',
  );

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
    pageUrls.length > 0
      ? section(
          'photo-heading',
          pageUrls.length === 1 ? 'Foto' : `Fotos (${pageUrls.length} Seiten)`,
          ...pageUrls.map((url, index) =>
            h(
              'figure',
              { class: 'doc-photo' },
              h('img', {
                src: url,
                alt: pageUrls.length === 1 ? `Foto des Dokuments „${doc.title}“` : `Foto von Seite ${index + 1}`,
                decoding: 'async',
              }),
              pageUrls.length > 1 ? h('figcaption', null, `Seite ${index + 1} von ${pageUrls.length}`) : null,
            ),
          ),
        )
      : null,
    h('div', { class: 'button-stack danger-zone' }, deleteButton),
  );

  return {
    title: doc.title,
    element,
    destroy: () => {
      reader?.destroy();
      ocr?.destroy();
      pageUrls.forEach((url) => URL.revokeObjectURL(url));
    },
  };
}
