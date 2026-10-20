import { h } from '../dom.ts';
import { section, viewHeader, type View } from './components.ts';

const list = (...items: string[]): HTMLUListElement => h('ul', { class: 'bullets' }, ...items.map((item) => h('li', null, item)));

export function helpView(): View {
  return {
    title: 'Hilfe',
    element: h(
      'div',
      { class: 'view' },
      viewHeader('Hilfe', 'Alles Wichtige zur Bedienung von VoxDoc.'),
      section(
        'help-scan',
        'Ein Dokument scannen',
        h('p', null, 'Tippe auf der Startseite auf „Dokument scannen“. Die Kamera öffnet sich, und du kannst ein Foto aufnehmen.'),
        list(
          'Lege das Dokument auf eine ebene, helle Fläche mit gutem Licht.',
          'Halte das iPhone flach, etwa 30 Zentimeter über die Mitte des Dokuments.',
          'Mit VoiceOver: Wähle den Auslöser aus und doppeltippe. Danach „Foto benutzen“ wählen.',
          'Nach dem Speichern hörst du einen aufsteigenden Ton, und das Dokument wird geöffnet.',
        ),
      ),
      section(
        'help-text',
        'Text und Vorlesen',
        h(
          'p',
          null,
          'In einem geöffneten Dokument kannst du über „Text bearbeiten“ den Text eingeben oder mit der Diktierfunktion der Tastatur sprechen. „Vorlesen“ liest Name und Text des Dokuments mit der gewählten Stimme vor.',
        ),
      ),
      section(
        'help-find',
        'Dokumente wiederfinden',
        list(
          'Die Bibliothek zeigt alle Dokumente. Du kannst nach Datum oder Name sortieren.',
          'Die Suche findet Wörter im Namen und im Text eines Dokuments.',
          'Vergib aussagekräftige Namen, zum Beispiel „Stromrechnung Oktober“.',
        ),
      ),
      section(
        'help-voiceover',
        'Bedienung mit VoiceOver',
        list(
          'Nach rechts oder links wischen: zum nächsten oder vorherigen Element.',
          'Doppeltippen: das ausgewählte Element aktivieren.',
          'Rotor (zwei Finger drehen) auf „Überschriften“ stellen, dann nach oben oder unten wischen, um zwischen Abschnitten zu springen.',
          'Mit vier Fingern oben auf den Bildschirm tippen: zum ersten Element springen.',
          'Die Navigation mit Start, Bibliothek, Suche, Einstellungen und Hilfe befindet sich am unteren Bildschirmrand.',
        ),
      ),
      section(
        'help-sounds',
        'Töne und Ansagen',
        h(
          'p',
          null,
          'VoxDoc sagt wichtige Ereignisse über VoiceOver an. Ein aufsteigender Ton bedeutet Erfolg, ein tiefer Ton einen Fehler. In den Einstellungen kannst du die Töne ausschalten oder Meldungen auch ohne VoiceOver vorlesen lassen. Ist der Stummschalter des iPhones aktiv, sind die Töne nicht zu hören.',
        ),
      ),
      section(
        'help-install',
        'Als App installieren',
        h(
          'p',
          null,
          'Öffne VoxDoc in Safari, tippe auf „Teilen“ und wähle „Zum Home-Bildschirm“. Danach startet VoxDoc wie eine eigene App und funktioniert auch ohne Internetverbindung.',
        ),
      ),
      section(
        'help-privacy',
        'Datenschutz',
        h(
          'p',
          null,
          'Fotos und Texte werden nur auf deinem iPhone gespeichert und nicht an einen Server übertragen. Wenn du VoxDoc vom Home-Bildschirm löschst, werden auch die Dokumente gelöscht.',
        ),
      ),
    ),
  };
}
