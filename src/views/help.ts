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
          'Halte das iPhone flach, mit dem Bildschirm nach oben, etwa 20 bis 30 Zentimeter über der Mitte des Blatts. Das Blatt sollte den Bildschirm fast ausfüllen – sonst ist der Text zu klein für die Texterkennung.',
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
        'help-ocr',
        'Texterkennung',
        list(
          'Nach dem Speichern eines Scans erkennt VoxDoc den Text automatisch. Den Fortschritt siehst du im Bereich „Texterkennung“ des Dokuments; wichtige Schritte werden angesagt.',
          'Beim ersten Mal werden die deutschen Sprachdaten geladen, etwa 5 MB. Danach funktioniert die Texterkennung auch ohne Internet.',
          'Die Erkennung läuft vollständig auf deinem iPhone. Die Fotos bleiben unverändert erhalten; der erkannte Text wird getrennt gespeichert.',
          'Die Genauigkeit wird als gut, mittel oder niedrig angesagt. Bei niedriger Genauigkeit enthält der Text wahrscheinlich Fehler – scanne die Seite dann näher oder mit mehr Licht neu, oder nutze die Kamera-App.',
          'Hast du den Text selbst bearbeitet, überschreibt eine neue Erkennung ihn nicht. Mit „Erkannten Text übernehmen“ ersetzt du ihn bewusst.',
          'Handschrift und sehr kleine oder verzierte Schrift werden oft nicht erkannt. Die Seite muss aufrecht liegen; leicht schräge Seiten werden ausgeglichen.',
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
          'VoxDoc merkt sich, wo du aufgehört hast. Öffnest du das Dokument wieder, heißt der Knopf „Weiterlesen“ und beginnt am Anfang des Satzes, bei dem du warst. „Von vorn vorlesen“ startet am Anfang.',
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
          'Vergib aussagekräftige Namen, zum Beispiel „Stromrechnung Oktober“. „Umbenennen“ findest du im Dokument unter „Bearbeiten“.',
          'In der Liste steht bei angefangenen Dokumenten „weiterlesen ab Absatz …“. Das zuletzt angefangene Dokument erscheint auf der Startseite unter „Weiterlesen“.',
          'Die Reihenfolge der Seiten änderst du im Dokument unter „Fotos“ mit „nach vorn verschieben“ und „nach hinten verschieben“. Der erkannte Text wird mit umsortiert, solange du ihn nicht selbst bearbeitet hast.',
          '„Dokument löschen“ steht am Ende eines Dokuments und fragt vorher nach.',
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
        'help-backup',
        'Datenverlust vermeiden',
        list(
          'Safari kann Daten von Websites löschen, die sieben Tage lang nicht geöffnet wurden. Füge VoxDoc deshalb zum Home-Bildschirm hinzu.',
          'Löschst du VoxDoc vom Home-Bildschirm oder die Website-Daten in Safari, sind auch die Dokumente weg. Erstelle vorher unter Einstellungen › Datensicherung eine Sicherung und speichere sie zum Beispiel in der Dateien-App.',
          'Mit „Sicherung wiederherstellen“ holst du die Dokumente zurück, auch auf einem neuen iPhone. Vorhandene Dokumente werden dabei nicht überschrieben.',
          'Ein angefangener Scan wird laufend gesichert. Wird die App unterbrochen, sind die aufgenommenen Seiten beim nächsten Öffnen des Scanners wieder da.',
          'Ist der Speicher voll, sagt VoxDoc das an und speichert nichts halb. Bereits gespeicherte Dokumente bleiben erhalten.',
        ),
      ),
      section(
        'help-privacy',
        'Datenschutz',
        h(
          'p',
          null,
          'VoxDoc braucht keine Anmeldung. Fotos, Texte und Lesepositionen werden nur auf deinem iPhone gespeichert und nie automatisch übertragen. Nur wenn du selbst „Teilen“ oder „Sicherung erstellen“ wählst, gibst du eine Datei weiter.',
        ),
      ),
    ),
  };
}
