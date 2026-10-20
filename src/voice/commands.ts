/** Befehle, die VoxDoc versteht – gesprochen oder getippt. */
export type VoiceCommand =
  | { type: 'scan' }
  | { type: 'capture' }
  | { type: 'read' }
  | { type: 'resume' }
  | { type: 'pause' }
  | { type: 'stop' }
  | { type: 'restart' }
  | { type: 'nextPage' }
  | { type: 'previousPage' }
  | { type: 'nextParagraph' }
  | { type: 'previousParagraph' }
  | { type: 'repeat' }
  | { type: 'faster' }
  | { type: 'slower' }
  | { type: 'search'; query: string }
  | { type: 'save' }
  | { type: 'export'; format: 'pdf' | 'html' | 'txt' }
  | { type: 'help' }
  | { type: 'commands' }
  | { type: 'home' }
  | { type: 'library' }
  | { type: 'settings' };

export type CommandType = VoiceCommand['type'];

/** Für die Liste „Was kann ich sagen?“ – nur Befehle, die tatsächlich umgesetzt sind. */
export const commandHelp: { say: string; does: string }[] = [
  { say: 'Dokument scannen', does: 'öffnet den Scanner' },
  { say: 'Aufnehmen', does: 'nimmt im Scanner die nächste Seite auf' },
  { say: 'Speichern', does: 'speichert im Scanner das Dokument bzw. ein geöffnetes Formular' },
  { say: 'Vorlesen', does: 'liest das geöffnete Dokument vor (setzt fort, wenn schon angefangen)' },
  { say: 'Pause', does: 'hält das Vorlesen an' },
  { say: 'Weiterlesen', does: 'setzt das Vorlesen fort' },
  { say: 'Von vorn', does: 'liest ab dem Anfang vor' },
  { say: 'Nächste Seite / Vorherige Seite', does: 'springt beim Vorlesen zur nächsten bzw. vorherigen Seite' },
  { say: 'Nächster Absatz / Vorheriger Absatz', does: 'springt einen Absatz weiter bzw. zurück' },
  { say: 'Wiederholen', does: 'liest den Absatz noch einmal' },
  { say: 'Schneller / Langsamer', does: 'ändert das Sprechtempo' },
  { say: 'Stopp', does: 'beendet das Vorlesen' },
  { say: 'Suche nach …', does: 'durchsucht deine Dokumente, z. B. „Suche nach Stromrechnung“' },
  { say: 'Als PDF exportieren', does: 'erstellt ein getaggtes PDF des geöffneten Dokuments' },
  { say: 'Als HTML exportieren / Als Text exportieren', does: 'erstellt eine Webseite bzw. Textdatei des Dokuments' },
  { say: 'Start / Bibliothek / Einstellungen / Hilfe', does: 'öffnet den Bereich' },
  { say: 'Was kann ich sagen?', does: 'zeigt diese Liste' },
];

/** Klein, ohne Satzzeichen und Füllwörter; Umlaute bleiben erhalten. */
export function normalizeCommand(text: string): string {
  return text
    .normalize('NFC')
    .toLocaleLowerCase('de-DE')
    .replace(/[.,!?;:"„“”«»'’()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(hey |hallo |ok |okay )?(voxdoc )?(bitte )?/, '')
    .replace(/ bitte$/, '')
    .trim();
}

type Rule = [RegExp, (match: RegExpMatchArray) => VoiceCommand];

const rules: Rule[] = [
  [/^(?:suche?n?|finde?|durchsuche)(?: (?:nach|mir))?(?: (.+))?$/, (m) => ({ type: 'search', query: (m[1] ?? '').trim() })],
  [/(?:^| )pdf(?: |$)|^exportieren$/, () => ({ type: 'export', format: 'pdf' })],
  [/^(?:als )?(?:html|webseite|internetseite)(?: exportieren| speichern)?$/, () => ({ type: 'export', format: 'html' })],
  [/^(?:als )?(?:text|txt|textdatei)(?: exportieren| speichern)$/, () => ({ type: 'export', format: 'txt' })],
  [/^(?:(?:ein |das |neues )?(?:dokument|blatt|brief) )?scann?e?n?$|^neues dokument$|^scanner(?: öffnen)?$/, () => ({ type: 'scan' })],
  [/^(?:aufnehmen|auslösen|foto(?: machen)?|seite aufnehmen|aufnahme)$/, () => ({ type: 'capture' })],
  [/^(?:nächste|naechste) seite$|^seite (?:vor|weiter)$/, () => ({ type: 'nextPage' })],
  [/^(?:vorherige|letzte) seite$|^seite zurück$/, () => ({ type: 'previousPage' })],
  [/^(?:nächster|naechster) absatz$|^absatz (?:vor|weiter)$/, () => ({ type: 'nextParagraph' })],
  [/^(?:vorheriger|letzter) absatz$|^absatz zurück$/, () => ({ type: 'previousParagraph' })],
  [/^(?:wiederholen|wiederhole|nochmal|noch einmal|absatz wiederholen)$/, () => ({ type: 'repeat' })],
  [/^(?:von vorn|von vorne|von anfang an|vom anfang|von vorn vorlesen|neu anfangen)$/, () => ({ type: 'restart' })],
  [/^(?:weiterlesen|weiter lesen|weiter|fortsetzen|mach weiter)$/, () => ({ type: 'resume' })],
  [/^(?:vorlesen|vor lesen|lies vor|lies|lesen|lies mir vor|lies das vor)$/, () => ({ type: 'read' })],
  [/^(?:pause|pausieren|anhalten|halt|warte)$/, () => ({ type: 'pause' })],
  [/^(?:stopp?|beenden|aufhören|vorlesen beenden|ende)$/, () => ({ type: 'stop' })],
  [/(?:^| )schneller$/, () => ({ type: 'faster' })],
  [/(?:^| )langsamer$/, () => ({ type: 'slower' })],
  [/^(?:speichern|speicher|sichern|dokument speichern)$/, () => ({ type: 'save' })],
  [/^(?:was kann ich sagen|welche befehle(?: gibt es)?|befehle)$/, () => ({ type: 'commands' })],
  [/^(?:hilfe|help)$/, () => ({ type: 'help' })],
  [/^(?:start|startseite)$/, () => ({ type: 'home' })],
  [/^(?:bibliothek|meine dokumente|dokumente)$/, () => ({ type: 'library' })],
  [/^einstellungen$/, () => ({ type: 'settings' })],
];

export function parseCommand(text: string): VoiceCommand | null {
  const normalized = normalizeCommand(text);
  if (!normalized) {
    return null;
  }
  for (const [pattern, build] of rules) {
    const match = normalized.match(pattern);
    if (match) {
      return build(match);
    }
  }
  return null;
}

/** Erste Alternative der Spracherkennung, die ein Befehl ist. */
export function parseAlternatives(alternatives: readonly string[]): { command: VoiceCommand; heard: string } | null {
  for (const heard of alternatives) {
    const command = parseCommand(heard);
    if (command) {
      return { command, heard };
    }
  }
  return null;
}
