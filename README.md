# VoxDoc

Barrierefreie Dokumentenerkennung für blinde und sehbehinderte Menschen, gebaut als
Progressive Web App (PWA) für das iPhone. VoxDoc soll Dokumente mit der Kamera erfassen,
den Text erkennen und vorlesen.

> **Status:** Scannen mit Live-Kamera und Sprachführung, lokale Texterkennung (Deutsch),
> Bibliothek, Suche, Vorlesen, Einstellungen und Hilfe funktionieren.

## Funktionen

- **Dokument scannen** – Live-Kamera mit Sprachführung und automatischer Auslösung, mehrere
  Seiten pro Dokument, Seiten neu aufnehmen oder entfernen. Alternativ Kamera-App oder Mediathek
  (siehe [Dokumentenscanner](#dokumentenscanner)). Fotos werden auf höchstens 2400 Pixel verkleinert
  und lokal gespeichert.
- **Texterkennung (OCR)** – Tesseract.js lokal im Browser, deutsches Modell, offline nach dem ersten
  Laden; startet automatisch nach dem Scannen (siehe [Texterkennung](#texterkennung-ocr)).
- **Bibliothek** – alle Dokumente, sortierbar nach Datum oder Name, mit Lesefortschritt
  („weiterlesen ab Absatz 3 von 8“); siehe [Dokumentverwaltung](#dokumentverwaltung-und-datenhaltung).
- **Weiterlesen** – die Leseposition wird gespeichert; beim erneuten Öffnen geht es dort weiter.
- **Datensicherung** – alle Dokumente als Datei exportieren und wiederherstellen, ohne Cloud.
- **Dokument** – Vorlesen, Text bearbeiten/diktieren, Umbenennen, Teilen (iOS-Teilen-Menü), Löschen.
- **Vorlesen** – Pause und Fortsetzen am zuletzt gesprochenen Wort, vorheriger/nächster Absatz,
  Absatz wiederholen, Tempo ändern während des Vorlesens (siehe [Vorlesefunktion](#vorlesefunktion)).
- **Suche** – durchsucht Titel und Text, zeigt einen Textausschnitt und sagt die Trefferzahl an.
- **Einstellungen** – Stimme, Sprechtempo, Absatznummer ansagen, Signaltöne, Statusmeldungen vorlesen,
  Farbschema (dunkel, hell, wie System), Speicherbelegung, alle Dokumente löschen.
- **Hilfe** – Bedienung, Scan-Tipps, VoiceOver-Gesten, Installation, Datenschutz.
- **Akustische Statusmeldungen** – Ansagen über VoiceOver, kurze Signaltöne (aufsteigend =
  Erfolg, tief = Fehler) und optional eigene Sprachausgabe für die Nutzung ohne VoiceOver.
- **Offline** – nach dem ersten Laden vollständig ohne Internet nutzbar; alle Daten bleiben auf dem Gerät.

## Technik

- [Vite](https://vite.dev/) mit **TypeScript** (strict), ohne UI-Framework
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) für Manifest und Service Worker (Workbox, offline nutzbar)
- [Tesseract.js](https://github.com/naptha/tesseract.js) 7 (Apache-2.0) mit `@tesseract.js-data/deu` (MIT) für die Texterkennung
- Optimiert für **iOS Safari** und **Apple VoiceOver**

## Voraussetzungen

- Node.js ≥ 20.19 (empfohlen: 22, siehe `.nvmrc`)
- npm

## Schnellstart

```bash
npm install
npm run dev
```

Die App läuft dann unter <http://localhost:5173>. Vite gibt außerdem eine Netzwerk-Adresse
aus (z. B. `http://192.168.1.20:5173`), die du auf dem iPhone im selben WLAN öffnen kannst.

### Auf dem iPhone testen (HTTPS)

iOS Safari erlaubt Service Worker und später auch den Kamerazugriff nur über HTTPS
(Ausnahme: `localhost`). Für Tests im lokalen Netz:

```bash
npm run dev:https
```

Damit wird ein selbstsigniertes Zertifikat verwendet. Öffne die angezeigte
`https://…`-Adresse auf dem iPhone und bestätige die Zertifikatswarnung.

Den Service Worker und die Installation testest du am besten mit dem Produktions-Build:

```bash
npm run build
npm run preview:https
```

Anschließend in Safari über „Teilen“ → „Zum Home-Bildschirm“ installieren.

## Skripte

| Befehl                  | Beschreibung                                         |
| ----------------------- | ---------------------------------------------------- |
| `npm run dev`           | Entwicklungsserver (HTTP, im LAN erreichbar)         |
| `npm run dev:https`     | Entwicklungsserver mit selbstsigniertem Zertifikat   |
| `npm run build`         | Typprüfung und Produktions-Build nach `dist/`        |
| `npm run preview`       | Produktions-Build lokal ausliefern                   |
| `npm run preview:https` | Produktions-Build über HTTPS ausliefern              |
| `npm run typecheck`     | Nur TypeScript-Typprüfung                            |
| `npm test`              | Unit-Tests mit Vitest (inkl. echter Texterkennung)   |

## Projektstruktur

```
├── index.html              App-Hülle: Tab-Leiste, Live-Region, Kamera-Eingaben
├── public/icons/           App-Icons (SVG, Apple Touch Icon, PWA-Icons)
├── src/
│   ├── main.ts             Einstiegspunkt, Service Worker, Audio-Freigabe
│   ├── app.ts              Routing, Fokus-Steuerung, Farbschema, Online-Status
│   ├── router.ts           Hash-Router (#/, #/bibliothek, #/suche, …)
│   ├── views/              Ansichten: Start, Scanner, Bibliothek, Dokument, Suche, Einstellungen, Hilfe;
│   │                       reader-panel.ts = Bedienfeld fürs Vorlesen
│   ├── reader/             Vorlese-Logik (reader.ts) und Text-Aufteilung (text.ts)
│   ├── ocr/                Texterkennung: Dateien laden/cachen (assets.ts), Tesseract-Worker (engine.ts),
│   │                       Warteschlange und Ansagen (service.ts), Textaufbereitung (format.ts), Fehler (errors.ts)
│   ├── scan/               Scanner: Kamera (camera.ts), Bildanalyse (analyze.ts), Sprachführung
│   │                       (guidance.ts), Seiten des laufenden Scans (session.ts), Dateiauswahl (scan.ts)
│   ├── storage/            IndexedDB: db.ts (Schema, Transaktionen), documents.ts, positions.ts
│   │                       (Leseposition), drafts.ts (Scan-Entwurf), backup.ts (Sicherung),
│   │                       health.ts (Speicherzustand), errors.ts (Meldungen); settings.ts (localStorage)
│   ├── audio/              Sprachausgabe (Web Speech API) und Signaltöne (Web Audio)
│   ├── a11y/announcer.ts   Ansagen für VoiceOver über eine Live-Region
│   ├── feedback.ts         Statusmeldungen: Ansage + Ton + optionale Sprachausgabe
│   ├── search.ts           Volltextsuche
│   ├── dom.ts, format.ts   DOM-Helfer, deutsche Datums- und Zahlenformate
│   └── styles.css          Dunkles, minimalistisches Design
├── tests/                  Unit-Tests (Vitest), inkl. echter Texterkennung auf Testbildern (fixtures/)
├── vite.config.ts          Vite- und PWA-Konfiguration (Manifest)
└── tsconfig.json
```

## Barrierefreiheit

Barrierefreiheit ist die Grundlage von VoxDoc, nicht ein Zusatz. Bereits umgesetzt:

- **Navigation:** Tab-Leiste als `<nav>` mit `aria-current="page"`. Beim Seitenwechsel erhält
  die Überschrift der neuen Ansicht den Fokus, damit VoiceOver dort weiterliest.
- **Formulare:** Jedes Feld hat ein sichtbares `<label>`; Schalter nutzen ab iOS 17.4 den
  nativen iOS-Switch (`<input type="checkbox" switch>`), das Sprechtempo hat einen
  sprechenden `aria-valuetext`.
- **Semantisches HTML:** Landmarks (`header`, `main`, `footer`), Überschriften-Hierarchie,
  echte `<button>`-Elemente – VoiceOver kann per Rotor nach Überschriften und Landmarks navigieren.
- **Live-Region** (`role="status"`) für Ansagen. Sie ist von Anfang an im DOM, weil VoiceOver
  nachträglich eingefügte Live-Regionen oft ignoriert. `announce()` leert die Region vor jeder
  Meldung, damit auch identische Meldungen erneut vorgelesen werden.
- **Dynamic Type:** `font: -apple-system-body` übernimmt die Textgröße aus den iOS-Einstellungen;
  alle Größen sind relativ (`em`/`rem`).
- **Zoomen bleibt erlaubt** (kein `user-scalable=no`).
- **Große Bedienelemente:** mindestens 44 × 44 pt, wie von Apple empfohlen.
- **Kontraste** nach WCAG AA, heller und dunkler Modus, `prefers-contrast: more`.
- **Reduzierte Bewegung** über `prefers-reduced-motion`.
- **Sichtbarer Fokus** für Tastatur und Schaltersteuerung, Link „Zum Inhalt springen“.
- **Safe Areas** (Notch, Home-Indikator) über `env(safe-area-inset-*)`.
- Sprache der Seite ist `de`, damit VoiceOver die deutsche Stimme verwendet.

### Testen mit VoiceOver

1. iPhone: *Einstellungen → Bedienungshilfen → VoiceOver* aktivieren
   (oder per Kurzbefehl: dreimal die Seitentaste drücken).
2. Mit Wischen nach rechts/links durch die Elemente navigieren, Doppeltippen aktiviert.
3. Rotor (Zwei-Finger-Drehgeste) auf „Überschriften“ stellen und prüfen, ob die Struktur stimmt.
4. Ein Dokument mit Text öffnen, „Vorlesen“ doppeltippen, dann „Pause“, „Nächster Absatz“ und
   „Schneller“ ausprobieren. Während des Vorlesens darf VoiceOver nichts zusätzlich ansagen.
5. „Dokument scannen“ aktivieren, Kamerazugriff erlauben und den Ansagen folgen, bis Takt-Töne und
   Auslösegeräusch kommen. Eine zweite Seite hinlegen, dann „Seite 1 neu aufnehmen“ und
   „Seite 2 entfernen“ ausprobieren und das Dokument speichern.
6. Über die Tab-Leiste zwischen den Bereichen wechseln und prüfen, dass jeweils die neue
   Überschrift angesagt wird.

## Dokumentenscanner

Erreichbar über „Dokument scannen“ auf der Startseite (`#/scannen`).

### Ablauf

1. Die Rückkamera startet über `getUserMedia` (`facingMode: environment`). Beim ersten Mal fragt
   iOS nach der Erlaubnis; dauert das länger als 1,5 Sekunden, sagt VoxDoc an, dass die Abfrage
   bestätigt werden muss.
2. Viermal pro Sekunde wird ein verkleinertes Bild (96 Pixel breit) analysiert. Daraus entsteht ein
   Hinweis, der angesagt wird: „Kein Dokument zu sehen“, „Bewege das iPhone etwas nach links“,
   „Zu nah“, „Zu weit weg“, „Halte das iPhone ruhig“, „Zu dunkel“, „Dokument erkannt“.
3. Ist das Blatt vollständig, mittig und ruhig im Bild, zählen Takt-Töne 1,5 Sekunden herunter, dann
   ertönt ein Auslösegeräusch und die Seite ist aufgenommen (abschaltbar; dann „Seite aufnehmen“ tippen).
4. Dieselbe Seite wird nicht zweimal aufgenommen: Erst wenn das Blatt entfernt oder ein anderes
   hingelegt wurde, löst der Scanner wieder automatisch aus.
5. Jede Seite steht in der Liste „Erfasste Seiten“ mit „Seite N neu aufnehmen“ und „Seite N entfernen“.
6. „Dokument speichern“ legt alle Seiten als ein Dokument an. Die Seiten des laufenden Scans bleiben
   beim Wechsel in einen anderen Tab erhalten, bis gespeichert oder „Scan verwerfen“ gewählt wird.

### Audioführung

- Hinweise werden über die Live-Region angesagt (VoiceOver) und, wenn „Statusmeldungen vorlesen“
  eingeschaltet ist, zusätzlich gesprochen.
- Ein Hinweis wird erst angesagt, wenn er 0,7 Sekunden stabil ist (kein Flackern), mit mindestens
  1,5 Sekunden Abstand zur vorigen Ansage, und unverändert höchstens alle 6 Sekunden wiederholt.
  „Dokument erkannt“ und „Lege die nächste Seite hin“ kommen nur einmal.
- Töne: Takt (hoch, kurz) während der Auslösung, Auslöser (zweitönig absteigend), Erfolg/Fehler wie
  im Rest der App. Alle Töne folgen der Einstellung „Signaltöne“.
- „Links/rechts“ bezieht sich auf das iPhone, „Richtung Oberkante/Unterkante“ auf die Kanten des iPhones.
- Ein gelber Rahmen zeigt das erkannte Blatt für Menschen mit Sehrest. Das Video selbst ist für
  VoiceOver ausgeblendet; der aktuelle Hinweis ist per `aria-describedby` mit dem Auslöser verbunden.
- Mit Taschenlampe (falls Gerät und Browser sie anbieten): Knopf „Licht“.

### Kameraberechtigungen und Fehler

Jeder Fehler erscheint als Abschnitt mit Überschrift, die beim erneuten Versuch den Fokus erhält, und
wird angesagt. Die Alternativen bleiben immer erreichbar.

| Situation                         | Meldung / Ausweg                                                    |
| --------------------------------- | ------------------------------------------------------------------- |
| Zugriff abgelehnt (`NotAllowedError`, auch vorab per Permissions API) | Erklärt den Weg in Safari bzw. den iPhone-Einstellungen; „Kamera erneut versuchen“ |
| Abfrage noch offen                | „Bitte erlaube VoxDoc den Zugriff auf die Kamera …“                 |
| Kamera belegt (`NotReadableError`) | Andere App beenden; „Kamera erneut versuchen“                      |
| Keine Kamera (`NotFoundError`)    | Hinweis; nur Alternativen                                           |
| Unpassende Einstellungen (`OverconstrainedError`) | automatischer zweiter Versuch mit `video: true`      |
| Kein HTTPS / kein `getUserMedia`  | Hinweis; nur Alternativen                                           |
| App im Hintergrund                | Kamera wird gestoppt und beim Zurückkehren neu gestartet            |

### Alternative ohne Live-Kamera

- „Foto mit der Kamera-App aufnehmen“ – `<input type="file" accept="image/*" capture="environment">`
  öffnet die iOS-Kamera; das Foto wird eine Seite (bei „neu aufnehmen“: ersetzt die Seite).
- „Fotos aus der Mediathek wählen“ – Mehrfachauswahl; jedes Foto wird eine Seite.
- Auf der Startseite legt „Fotos aus der Mediathek wählen“ direkt ein Dokument aus den Fotos an.

### Einschränkungen

- **Nicht auf einem echten iPhone getestet.** Getestet wurde in Chromium mit einer simulierten Kamera
  (Videodatei als Kamerabild, siehe unten), mit Unit-Tests auf synthetischen Bildern und mit echten
  Datei-Dialogen. Belichtung, Autofokus und Bildrauschen einer echten iPhone-Kamera können die
  Erkennung anders beeinflussen; die Schwellwerte in `guidance.ts` müssen ggf. angepasst werden.
- **Einfache Blatterkennung:** Erkannt wird ein heller Bereich auf dunklerem Untergrund (Otsu-Schwellwert
  und Zeilen-/Spaltenprojektion), keine echte Kanten- oder Perspektiverkennung. Ein weißes Blatt auf
  hellem Tisch wird nicht zuverlässig erkannt; die Hilfe empfiehlt eine dunkle Unterlage.
- **Keine Schärfeprüfung.** Unschärfe wird nur indirekt über Bewegung erkannt; ein ruhiges, aber
  unscharfes Bild (z. B. zu nah für den Autofokus) wird trotzdem aufgenommen.
- **Kein Zuschneiden und Entzerren:** Gespeichert wird das ganze Kamerabild.
- **Auflösung:** VoxDoc fordert bis zu 1920 Pixel an; ein Videobild hat in der Regel weniger Auflösung
  als ein Foto der Kamera-App. Für sehr kleine Schrift ist „Foto mit der Kamera-App aufnehmen“ besser.
- **Licht-Knopf** erscheint nur, wenn `getCapabilities()` eine Taschenlampe meldet; in iOS Safari ist
  das je nach Version nicht der Fall.
- **Kamerazugriff in der Home-Bildschirm-App:** iOS fragt bei installierten Web-Apps je nach Version bei
  jedem Start erneut nach der Erlaubnis.
- **„Zu dunkel“ ohne Blatt** wird nur bei fast schwarzem Bild angesagt, weil ein dunkler Tisch sonst
  mit Lichtmangel verwechselt würde. Das iPhone hellt dunkle Szenen zudem automatisch auf.
- Bestehende Dokumente (ein Foto) werden beim ersten Start automatisch in das neue Seitenformat
  übernommen (IndexedDB-Version 2). Seiten eines gespeicherten Dokuments lassen sich noch nicht
  nachträglich ergänzen.

### Kamera im Browser-Test simulieren

Chromium kann eine Y4M-Videodatei als Kamera ausgeben:

```bash
chromium --use-fake-device-for-media-stream --use-fake-ui-for-media-stream \
  --use-file-for-fake-video-capture=/pfad/zu/dokument.y4m
```

Damit lassen sich Szenen wie „Blatt ragt links heraus“, „Blatt liegt ruhig“ oder „Blatt entfernt“
reproduzierbar durchspielen. `--deny-permission-prompts` simuliert einen abgelehnten Kamerazugriff.

## Dokumentverwaltung und Datenhaltung

Alles liegt lokal in IndexedDB (Datenbank `voxdoc`). Es gibt **keine Anmeldung, kein Konto und keine
automatische Übertragung** – auch keine Synchronisation über iCloud. Daten verlassen das Gerät nur, wenn
der Nutzer selbst „Teilen“ oder „Sicherung erstellen“ wählt. Im Browser-Test wurde geprüft, dass keine
Anfrage an einen anderen Server als den eigenen geht (die OCR-Dateien liegen bei der App).

### Gespeicherte Daten

| Speicher | Inhalt |
| --- | --- |
| `documents` | Titel, Erstellungs- und Änderungsdatum, Seiten (Originalfotos in Lesereihenfolge), OCR-Rohergebnis je Seite, Lesetext |
| `positions` | Leseposition je Dokument: Absatz, Zeichenposition, „fertig gelesen“, Prüfsumme des Texts |
| `drafts` | laufender Scan (aufgenommene Seiten), bis er gespeichert oder verworfen wird |

Die Leseposition liegt getrennt, damit beim Vorlesen nicht jedes Mal die Fotos neu geschrieben werden.
Ändert sich der Text (Bearbeiten, neue Erkennung, Umsortieren), wird sie verworfen; die Prüfsumme fängt
auch verspätete Speichervorgänge mit altem Text ab.

Schema-Versionen: 1 (ein Foto je Dokument) → 2 (Seitenliste) → 3 (Lesepositionen, Entwürfe). Ältere
Datenbanken werden beim Öffnen ohne Datenverlust umgestellt (getestet).

### Aktionen (alle mit VoiceOver bedienbar)

| Aktion | Wo | Rückmeldung |
| --- | --- | --- |
| Speichern | Scanner „Dokument speichern“, Start „Fotos aus der Mediathek wählen“ | „Dokument mit 2 Seiten gespeichert.“ |
| Umbenennen | Dokument › Bearbeiten › „Umbenennen“ (Fokus springt ins Feld, danach zurück) | „Umbenannt in …“ |
| Suchen | Tab „Suche“ (Titel und Text) | Trefferzahl wird angesagt |
| Öffnen | Bibliothek, Suche, Start („Zuletzt gescannt“, „Weiterlesen“) | Überschrift des Dokuments erhält den Fokus |
| Vorlesen / Weiterlesen | Dokument › Vorlesen: „Weiterlesen“ bzw. „Von vorn vorlesen“ | Status „Zuletzt gelesen bis Absatz 2 von 4.“ |
| Seiten umsortieren | Dokument › Fotos bzw. Scanner: „Seite 2 nach vorn/hinten verschieben“ | „Seite 2 ist jetzt Seite 1.“; Fokus bleibt bei der Seite |
| Löschen | Dokument › „Dokument löschen“ (mit Rückfrage), Einstellungen › „Alle Dokumente löschen“ | „… gelöscht.“ |
| Sichern / Wiederherstellen | Einstellungen › Datensicherung | Anzahl und Größe werden angesagt |

Beim Umsortieren wandern Fotos und OCR-Ergebnisse gemeinsam. Der Lesetext wird nur neu zusammengesetzt,
wenn er nicht selbst bearbeitet wurde – sonst bleibt er unverändert, und VoxDoc sagt das an.

### Speicherfehler und Datenverlust

- **Atomare Schreibvorgänge:** Jede Änderung ist eine Transaktion (`durability: 'strict'`). Schlägt sie
  fehl, bleibt der vorherige Stand vollständig erhalten; es wird nichts halb gespeichert. Formulare
  bleiben bei einem Fehler offen, damit die Eingabe nicht verloren geht.
- **Verständliche Meldungen** (angesagt und sichtbar) für: Speicher voll, Speicher nicht verfügbar
  (z. B. privates Surfen), Datenbank-Update durch einen anderen Tab (mit „Seite neu laden“), Upgrade durch
  einen offenen Tab blockiert, Dokument nicht mehr vorhanden, ungültige Sicherungsdatei.
- **Speicherzustand beim Start:** Ist die Datenbank nicht nutzbar oder der Speicher zu über 90 % belegt,
  erscheint oben ein Hinweis, der auch angesagt wird.
- **Löschen durch Safari:** Safari kann Website-Daten nach sieben Tagen ohne Nutzung löschen, wenn die Seite
  nicht auf dem Home-Bildschirm installiert ist. VoxDoc bittet um dauerhaften Speicher
  (`navigator.storage.persist()`), zeigt unter *Einstellungen › Speicher*, ob er gewährt wurde, und weist
  sonst auf Installation und Sicherung hin.
- **Scan-Entwurf:** Aufgenommene Seiten werden nach jeder Änderung gesichert und beim nächsten Öffnen des
  Scanners wiederhergestellt („Ein unvollständiger Scan mit 2 Seiten wurde wiederhergestellt.“).
- **Datensicherung:** eine JSON-Datei mit allen Dokumenten, Fotos (Base64), OCR-Ergebnissen und
  Lesepositionen. Weitergabe über das iOS-Teilen-Menü (z. B. „In Dateien sichern“) oder als Download.
  Beim Wiederherstellen werden nur fehlende Dokumente ergänzt, vorhandene bleiben unverändert; eine
  fehlerhafte Datei wird vollständig abgelehnt.

### Einschränkungen

- **Nicht auf einem echten iPhone getestet** – Chromium mit simulierter Sprachausgabe und simulierten
  Speicherfehlern. Wie viel Speicher Safari erlaubt und wann es Daten löscht, entscheidet iOS.
- **Löschen durch iOS lässt sich nicht erkennen:** Wenn Safari die Website-Daten entfernt, sind auch alle
  Hinweise darauf weg. Schutz bieten nur Installation auf dem Home-Bildschirm und eine Sicherung.
- **Große Sicherungen:** Die Datei enthält alle Fotos und entsteht im Arbeitsspeicher; bei sehr vielen
  Dokumenten kann das auf älteren iPhones zu viel sein. Es gibt noch keine Sicherung einzelner Dokumente.
- Weiterlesen beginnt am Anfang des Satzes, in dem zuletzt gelesen wurde, nicht mitten im Satz.
- Einzelne Seiten eines gespeicherten Dokuments lassen sich umsortieren, aber noch nicht entfernen oder
  ergänzen.

## Texterkennung (OCR)

### Wahl der Lösung

**Tesseract.js 7** (Apache-2.0) mit dem deutschen LSTM-Modell `deu` in der Variante `4.0.0_best_int`
aus `@tesseract.js-data/deu` (MIT). Kostenlos, quelloffen, läuft als WebAssembly in einem Web Worker
vollständig auf dem Gerät – kein Server, keine Übertragung von Fotos oder Text. Das Modell kennt
Umlaute und ß. Verwendet wird nur die LSTM-Engine (`OEM.LSTM_ONLY`); die ältere Legacy-Engine würde
die Sprachdaten von 1,3 auf 7,1 MB vergrößern.

### Ablauf und Datenhaltung

- Nach dem Speichern eines Scans startet die Erkennung automatisch (abschaltbar), sonst über
  „Text erkennen“ im Dokument. Mehrere Dokumente werden nacheinander abgearbeitet; die Erkennung
  läuft weiter, wenn man die Ansicht wechselt.
- **Getrennte Speicherung:** `pages` enthält die Originalfotos (werden nie verändert), `ocr` das
  unveränderte Rohergebnis je Seite mit Konfidenz und Wortzahl, `text` den Lesetext. Der Lesetext
  entsteht aus dem Rohergebnis, indem nur Zeilenumbrüche zu Absätzen zusammengeführt werden – es wird
  kein Zeichen ergänzt, entfernt oder „korrigiert“.
- **Keine erfundenen Ergebnisse:** Leere Seiten bleiben leer und werden so angesagt. Die Genauigkeit
  (gut ≥ 80 %, mittel ≥ 60 %, sonst niedrig) wird immer genannt; bei niedriger Genauigkeit warnt VoxDoc,
  dass der Text wahrscheinlich Fehler enthält.
- **Eigene Bearbeitungen bleiben erhalten:** Wurde der Text bearbeitet, ersetzt eine neue Erkennung ihn
  nicht; „Erkannten Text übernehmen“ ersetzt ihn auf Wunsch (mit Rückfrage).
- Abbrechen ist jederzeit möglich; Teilergebnisse werden verworfen.

### Fortschritt und Meldungen (VoiceOver)

- Sichtbar: Statuszeile („Seite 2 von 3 wird erkannt … 45 %“) und ein `<progress>`-Balken mit Namen,
  den VoiceOver mit Prozentwert vorliest.
- Angesagt werden nur Schritte: Start, Laden der Sprachdaten (nur beim ersten Mal), jede fertige Seite
  bei mehrseitigen Dokumenten, alle 15 Sekunden der Fortschritt bei langen Erkennungen, das Ergebnis
  („Text erkannt: 43 Wörter. Genauigkeit gut.“) bzw. der Fehler. Läuft die Erkennung für ein anderes
  Dokument als das angezeigte, nennt die Ansage dessen Titel.
- Während des Vorlesens sind alle Ansagen stumm geschaltet (nur Töne), damit VoiceOver nicht
  gleichzeitig spricht.
- Fehler mit Ausweg: keine Internetverbindung beim ersten Laden, Download fehlgeschlagen, Speicher voll,
  Arbeitsspeicher reicht nicht, Zeitüberschreitung (3 Minuten je Seite), Browser ohne WebAssembly,
  Dokument ohne Fotos.

### Kompatibilität mit iPhone Safari

| Voraussetzung | Safari | Verwendung |
| --- | --- | --- |
| WebAssembly, Web Worker, Blob-URLs | iOS 11+ | Engine im Worker |
| WebAssembly SIMD | iOS 16.4+ | schnellere Engine; sonst automatisch die Variante ohne SIMD |
| Cache Storage | iOS 11.3+ (nur HTTPS bzw. localhost) | Offline-Speicher der OCR-Dateien |

Der Downloadfortschritt nutzt `response.body`; fehlt es, wird ohne Fortschrittsanzeige geladen. Ohne
Cache Storage (z. B. über unverschlüsseltes HTTP im LAN) funktioniert die Erkennung, aber nicht offline.
Die Relaxed-SIMD-Variante der Engine wird nicht verwendet. Mindestens Safari 16 ist sinnvoll.

### Speicherbedarf, Ladezeit, Offline

- **Download beim ersten Mal:** Worker 0,11 MB + Engine 3,9 MB + deutsche Sprachdaten 1,3 MB ≈ **5,3 MB**
  (die Engine-Datei ist base64-kodiertes WebAssembly und lässt sich beim Ausliefern gut komprimieren).
- **Speicher auf dem Gerät:** 5,3–6,1 MB im Cache `voxdoc-ocr` (je nachdem, ob der Server die Sprachdaten
  komprimiert ausliefert). Anzeige und Löschen unter *Einstellungen › Texterkennung*.
- **Nicht im Service-Worker-Precache:** Die App bleibt klein (Precache ≈ 130 KB); die OCR-Dateien werden
  erst bei der ersten Erkennung oder per „Jetzt für Offline-Nutzung laden“ geladen.
- **Offline:** Die App lädt die Dateien selbst aus dem Cache und übergibt sie dem Worker als Blob-URL bzw.
  Daten. Damit hängt der Offline-Betrieb nicht davon ab, ob Safari Anfragen aus Web Workern über den
  Service Worker leitet.
- **Gemessen (Chromium, Desktop-Rechner, nicht iPhone):** erste Erkennung inklusive Laden ≈ 2 s, weitere
  Seiten ≈ 1 s, Kaltstart offline aus dem Cache ≈ 1 s; Spitzen-Arbeitsspeicher des Renderer-Prozesses
  ≈ 320 MB (vorher ≈ 100 MB). Auf einem iPhone ist mit einem Mehrfachen der Zeit zu rechnen.
- Nach 60 Sekunden ohne Aufgabe wird der Worker beendet, um Arbeitsspeicher freizugeben.

### Erkennungsqualität

Gemessen mit Tesseract.js und dem verwendeten Modell (Testbilder in `tests/fixtures`, simulierte
Kamerabilder 1080 × 1920 mit A4-Brief in 11-pt-Schrift, leicht gedreht, unscharf und verrauscht):

| Aufnahme | Fläche des Blatts im Bild | Prüfwörter erkannt | Konfidenz |
| --- | --- | --- | --- |
| Testbrief (Foto/Mediathek) | – | 10/10 inkl. ä, ö, ü, Ä, Ö, Ü, ß | 95 |
| Kamerabild, Blatt füllt 83 % der Breite | 55 % | 13/13 | 94 |
| Kamerabild, 65 % der Breite | 34 % | 10/13 | 82 |
| Kamerabild, 48 % der Breite | 19 % | 0/13 | 0 |

Deshalb sagt der Scanner „Zu weit weg“, bis das Blatt mindestens 45 % des Bildes einnimmt.

### Einschränkungen

- **Nicht auf einem echten iPhone getestet.** Getestet in Node (echte Erkennung) und Chromium (kompletter
  Browser-Ablauf inkl. Worker, Cache, offline). WebKit stand in der Testumgebung nicht zur Verfügung.
  Laufzeit und Speicherverbrauch auf dem iPhone sind nicht gemessen.
- **Arbeitsspeicher:** Reicht er nicht, kann iOS die Seite neu laden, ohne dass VoxDoc eine Fehlermeldung
  zeigen kann; die Erkennung muss dann neu gestartet werden. Fotos sind deshalb auf 2400 Pixel begrenzt.
- **Hintergrund:** Wechselt man die App, kann iOS die Erkennung anhalten oder den Worker beenden. Antwortet
  er nicht mehr, bricht VoxDoc nach 3 Minuten je Seite mit einer Meldung ab; dann neu starten.
- **Keine Seitenausrichtung:** Ohne Legacy-Engine gibt es keine Erkennung von auf dem Kopf stehenden oder
  um 90° gedrehten Seiten; leichte Schräglage wird ausgeglichen (`rotateAuto`).
- **Layout:** Spalten, Tabellen und Formulare werden als fortlaufender Text ausgegeben; Handschrift und
  Frakturschrift werden kaum erkannt.
- **Tesseract.js 7.0.0 hat einen Fehler** beim Übergeben von Sprachdaten als `{ code, data }` (beim
  Initialisieren wird `data` statt `code` als Sprachname verwendet). `src/ocr/engine.ts` korrigiert
  im Startskript des Workers gezielt nur diese eine Nachricht; bei einem Update von Tesseract.js prüfen,
  ob das noch nötig ist.

## Vorlesefunktion

Das Vorlesen nutzt die Web Speech API (`speechSynthesis`), die in Safari auf die
iOS-Sprachausgabe (AVSpeechSynthesizer) und die auf dem iPhone installierten Stimmen zugreift.

### Bedienung

| Knopf                 | Wirkung                                                                 |
| --------------------- | ----------------------------------------------------------------------- |
| Vorlesen / Pause / Fortsetzen | Ein Knopf, Beschriftung folgt dem Zustand. Fortsetzen beginnt beim zuletzt gesprochenen Wort. |
| Vorheriger Absatz     | Liest sofort den vorherigen Absatz (im ersten Absatz: von vorn + tiefer Ton). |
| Absatz wiederholen    | Liest den aktuellen Absatz noch einmal von Anfang an.                   |
| Nächster Absatz       | Liest sofort den nächsten Absatz (am Ende: tiefer Ton bzw. Ansage).     |
| Langsamer / Schneller | Tempo in Schritten von 0,1 (0,5- bis 2-fach), gespeichert für alle Dokumente. |
| Vorlesen beenden      | Stoppt; der nächste Start beginnt am Anfang. Nur sichtbar, solange gelesen wird oder pausiert ist. |

Der Status („Liest Absatz 2 von 5.“) steht über den Knöpfen und ist per `aria-describedby`
mit dem Hauptknopf verbunden; VoiceOver liest ihn also beim Fokussieren mit vor. Der aktuelle
Absatz wird für Menschen mit Sehrest farbig hervorgehoben.

### Technische Umsetzung (Safari-Kompatibilität)

- **Kein `speechSynthesis.pause()`/`resume()`.** Beides ist in iOS Safari unzuverlässig
  (Fortsetzen bleibt stumm oder beginnt von vorn). Stattdessen merkt sich der Leser über
  `boundary`-Ereignisse das aktuelle Wort, bricht mit `cancel()` ab und spricht beim Fortsetzen
  ab diesem Wort neu.
- **Kurze Äußerungen.** Absätze werden in Sätze bzw. Stücke von höchstens 220 Zeichen zerlegt
  (`src/reader/text.ts`), weil WebKit sehr lange Äußerungen abbrechen kann.
- **Generationszähler.** WebKit meldet `end` einer abgebrochenen Äußerung teils erst, nachdem die
  nächste begonnen hat. Ereignisse veralteter Äußerungen werden verworfen.
- **Watchdog.** Bleibt `end` aus und spricht die Engine nicht mehr, geht es nach einer aus
  Textlänge und Tempo geschätzten Zeit trotzdem weiter.
- **Start-Überwachung.** Startet eine Äußerung nicht innerhalb von 3 Sekunden, wird sie einmal
  wiederholt; danach pausiert der Leser mit einer Fehlermeldung.
- **Kurze Pause nach `cancel()`.** Safari verwirft `speak()` direkt nach `cancel()` gelegentlich,
  deshalb wird in diesem Fall 80 ms gewartet.
- **Freigabe durch Berührung.** iOS erlaubt Sprachausgabe erst nach einer Benutzeraktion; die erste
  Berührung der Seite gibt sie frei.
- **Hintergrund.** Wird die App verlassen oder das iPhone gesperrt, pausiert der Leser sauber
  (`visibilitychange`) und kann an derselben Stelle fortgesetzt werden.
- `utterance.lang` ist immer `de-DE`; die in den Einstellungen gewählte Stimme wird verwendet, sonst
  die Standardstimme.

### Zusammenspiel mit VoiceOver

VoiceOver und `speechSynthesis` sind getrennte Sprachausgaben, die gleichzeitig sprechen können.
Eine Webseite kann weder erkennen, ob VoiceOver läuft, noch VoiceOver stummschalten. VoxDoc
verringert Überschneidungen so:

- Während des Vorlesens gibt es **keine Ansagen über die Live-Region**. Rückmeldungen kommen als
  Signalton oder werden von der Vorlesestimme selbst gesprochen („Absatz 3 von 5.“, „Tempo 1,2-fach.“).
- Ansagen über VoiceOver erfolgen erst, wenn das Vorlesen ruht (Pause, Ende, Tempo im Ruhezustand).
- „Statusmeldungen vorlesen“ ist während des Vorlesens gesperrt, damit nichts in die Warteschlange gerät.
- Der Fokus bleibt beim Bedienen auf dem jeweiligen Knopf; nach „Vorlesen beenden“ springt er auf
  den Hauptknopf.
- Die Hilfe empfiehlt, während des Vorlesens nur die Knöpfe zu bedienen, und nennt als Alternative
  das Lesen mit VoiceOver selbst (zwei Finger nach unten wischen).

### Einschränkungen

- **Nicht auf einem echten iPhone getestet.** Die Logik ist mit Unit-Tests und einem Browser-Test
  gegen eine nachgebildete Sprachausgabe geprüft, die das bekannte WebKit-Verhalten nachahmt.
  Verhalten und Timing auf echten Geräten können abweichen.
- **Gleichzeitiges Sprechen mit VoiceOver** lässt sich nicht vollständig verhindern: Wischt man
  während des Vorlesens über Elemente, sprechen beide Stimmen.
- **Fortsetzen am Wort** setzt `boundary`-Ereignisse voraus. Liefert eine Stimme keine, geht es am
  Anfang des aktuellen Satzes bzw. Abschnitts weiter.
- **Kein Vorlesen im Hintergrund oder bei gesperrtem Bildschirm.** iOS hält Web-Sprachausgabe dann an;
  es gibt auch keine Steuerung im Sperrbildschirm oder Kontrollzentrum.
- **Stimmenauswahl:** Safari bietet nur auf dem Gerät installierte Stimmen an; Siri-Stimmen sind für
  Webseiten in der Regel nicht verfügbar. Bessere Stimmen lassen sich unter *Einstellungen ›
  Bedienungshilfen › Gesprochene Inhalte › Stimmen* laden. Die Stimmenliste kann verzögert erscheinen.
- **Tempo:** Die Wirkung von `rate` unterscheidet sich je nach Stimme; 2-fach kann sehr schnell sein.
  Ein Tempowechsel während des Vorlesens beginnt die Äußerung ab dem aktuellen Wort neu.
- **Stummschalter:** Je nach iOS-Version kann der Stummschalter auch die Sprachausgabe stummschalten;
  die Signaltöne sind dann sicher nicht hörbar.
- **Lange Sätze ohne Satzzeichen** werden an Kommas oder Leerzeichen geteilt; dabei kann die
  Betonung an der Trennstelle leicht abweichen.
- **Absätze** entsprechen den Zeilen des Dokumenttexts. Mit der späteren Texterkennung hängt die
  Qualität der Absätze vom OCR-Ergebnis ab.

## Nächste Schritte

- Zuschneiden und Entzerren der Seiten, Schärfeprüfung
- Seiten zu einem gespeicherten Dokument hinzufügen oder einzeln entfernen
- Sicherung einzelner Dokumente
- Automatisierte Ende-zu-Ende- und Barrierefreiheitstests (z. B. Playwright + axe-core) im Repository

## Lizenz

Noch nicht festgelegt.
