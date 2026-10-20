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
        h(
          'p',
          null,
          'Tippe auf der Startseite auf „Dokument scannen“. Beim ersten Mal fragt das iPhone, ob VoxDoc die Kamera verwenden darf – wähle „Erlauben“. VoxDoc sagt dir dann, wie du das iPhone halten sollst.',
        ),
        list(
          'Lege das Blatt auf eine dunkle, ebene Fläche, zum Beispiel einen dunklen Tisch. Ein weißes Blatt auf weißem Untergrund wird nicht erkannt.',
          'Sorge für gleichmäßiges Licht ohne starke Schatten.',
          'Halte das iPhone flach, mit dem Bildschirm nach oben, etwa 30 Zentimeter über der Mitte des Blatts.',
          'Folge den Ansagen: „nach links“ und „nach rechts“ beziehen sich auf das iPhone; „Richtung Oberkante“ heißt, das iPhone in die Richtung seiner oberen Kante zu schieben.',
          'Sobald das Blatt vollständig und ruhig im Bild ist, hörst du schnelle Takt-Töne und dann ein Auslösegeräusch. Die Seite ist aufgenommen.',
          'Für die nächste Seite lege einfach das neue Blatt hin. Dieselbe Seite wird nicht zweimal aufgenommen.',
          'Ohne automatische Auslösung tippst du selbst auf „Seite aufnehmen“, wenn „Dokument erkannt“ angesagt wird.',
        ),
      ),
      section(
        'help-pages',
        'Seiten prüfen und speichern',
        list(
          'Unter „Erfasste Seiten“ steht jede Seite mit den Knöpfen „neu aufnehmen“ und „entfernen“.',
          'Bei „neu aufnehmen“ ersetzt die nächste Aufnahme genau diese Seite.',
          '„Dokument speichern“ legt alle Seiten als ein Dokument in der Bibliothek ab. Verlässt du den Scanner vorher, bleiben die Seiten erhalten, bis du speicherst oder „Scan verwerfen“ wählst.',
        ),
      ),
      section(
        'help-camera-problems',
        'Wenn die Kamera nicht startet',
        list(
          'Hast du den Kamerazugriff abgelehnt, sagt VoxDoc dir, wo du ihn in den Einstellungen wieder erlaubst.',
          'Ist die Kamera belegt, etwa durch einen Anruf, beende die andere App und tippe auf „Kamera erneut versuchen“.',
          'Es geht immer auch ohne Live-Kamera: „Foto mit der Kamera-App aufnehmen“ öffnet die normale iPhone-Kamera, „Fotos aus der Mediathek wählen“ übernimmt vorhandene Fotos. Jedes Foto wird eine Seite.',
        ),
      ),
      section(
        'help-text',
        'Text eingeben',
        h(
          'p',
          null,
          'In einem geöffneten Dokument kannst du über „Text bearbeiten“ den Text eingeben oder mit der Diktierfunktion der Tastatur sprechen. Jede Zeile wird zu einem eigenen Absatz.',
        ),
      ),
      section(
        'help-reader',
        'Vorlesen',
        h('p', null, 'Im Bereich „Vorlesen“ eines Dokuments findest du diese Knöpfe:'),
        list(
          '„Vorlesen“ startet am Anfang. Während des Vorlesens heißt der Knopf „Pause“, danach „Fortsetzen“ – es geht beim zuletzt gesprochenen Wort weiter.',
          '„Vorheriger Absatz“, „Absatz wiederholen“ und „Nächster Absatz“ lesen sofort den gewählten Absatz vor. Vorher wird „Absatz 3 von 5“ angesagt; das lässt sich in den Einstellungen ausschalten.',
          '„Langsamer“ und „Schneller“ ändern das Tempo in kleinen Schritten. Beim Vorlesen sagt die Stimme das neue Tempo an und liest an derselben Stelle weiter.',
          '„Vorlesen beenden“ hält an; der nächste Start beginnt wieder am Anfang.',
          'Am Ende des Dokuments hörst du einen aufsteigenden Ton. Ein tiefer Ton bedeutet: Es gibt keinen weiteren Absatz oder das Tempo ist am Anschlag.',
        ),
      ),
      section(
        'help-reader-voiceover',
        'Vorlesen zusammen mit VoiceOver',
        list(
          'VoiceOver und die Vorlesestimme sprechen unabhängig voneinander. Bleibe während des Vorlesens auf den Knöpfen, damit VoiceOver nicht gleichzeitig den Text liest.',
          'Während des Vorlesens macht VoxDoc keine VoiceOver-Ansagen. Rückmeldungen kommen als Ton oder von der Vorlesestimme selbst.',
          'Alternativ kannst du den Text mit VoiceOver selbst lesen: Wähle den ersten Absatz und wische mit zwei Fingern nach unten.',
          'Wechselst du in eine andere App oder sperrst das iPhone, wird das Vorlesen pausiert. Mit „Fortsetzen“ geht es an derselben Stelle weiter.',
          'Bessere Stimmen kannst du unter Einstellungen › Bedienungshilfen › Gesprochene Inhalte › Stimmen › Deutsch laden und danach in VoxDoc auswählen.',
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
