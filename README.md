# VoxDoc

Barrierefreie Dokumentenerkennung für blinde und sehbehinderte Menschen, gebaut als
Progressive Web App (PWA) für das iPhone. VoxDoc soll Dokumente mit der Kamera erfassen,
den Text erkennen und vorlesen.

> **Status:** Grundoberfläche fertig – Scannen per Kamera, Bibliothek, Suche, Vorlesen,
> Einstellungen und Hilfe funktionieren. Die automatische Texterkennung (OCR) folgt; bis
> dahin kann der Text eines Dokuments eingegeben oder diktiert werden.

## Funktionen

- **Dokument scannen** – öffnet die Rückkamera des iPhones (oder die Mediathek). Fotos werden
  auf höchstens 2400 Pixel verkleinert und lokal gespeichert.
- **Bibliothek** – alle Dokumente, sortierbar nach Datum oder Name.
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
| `npm test`              | Unit-Tests mit Vitest                                |

## Projektstruktur

```
├── index.html              App-Hülle: Tab-Leiste, Live-Region, Kamera-Eingaben
├── public/icons/           App-Icons (SVG, Apple Touch Icon, PWA-Icons)
├── src/
│   ├── main.ts             Einstiegspunkt, Service Worker, Audio-Freigabe
│   ├── app.ts              Routing, Fokus-Steuerung, Farbschema, Online-Status
│   ├── router.ts           Hash-Router (#/, #/bibliothek, #/suche, …)
│   ├── views/              Ansichten: Start, Bibliothek, Dokument, Suche, Einstellungen, Hilfe;
│   │                       reader-panel.ts = Bedienfeld fürs Vorlesen
│   ├── reader/             Vorlese-Logik (reader.ts) und Text-Aufteilung (text.ts)
│   ├── scan/               Kamera-Aufnahme und Bildverkleinerung
│   ├── storage/            Dokumente (IndexedDB) und Einstellungen (localStorage)
│   ├── audio/              Sprachausgabe (Web Speech API) und Signaltöne (Web Audio)
│   ├── a11y/announcer.ts   Ansagen für VoiceOver über eine Live-Region
│   ├── feedback.ts         Statusmeldungen: Ansage + Ton + optionale Sprachausgabe
│   ├── search.ts           Volltextsuche
│   ├── dom.ts, format.ts   DOM-Helfer, deutsche Datums- und Zahlenformate
│   └── styles.css          Dunkles, minimalistisches Design
├── tests/                  Unit-Tests (Vitest)
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
5. „Dokument scannen“ aktivieren, ein Foto aufnehmen – nach dem Speichern ertönt ein
   aufsteigender Ton, VoiceOver sagt „Dokument gespeichert“ an und liest die Überschrift des Dokuments.
6. Über die Tab-Leiste zwischen den Bereichen wechseln und prüfen, dass jeweils die neue
   Überschrift angesagt wird.

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

- Texterkennung (OCR) im Browser, Ergebnis landet im Textfeld des Dokuments
- Live-Kamera (`getUserMedia`) mit gesprochener Ausrichtungshilfe
- Automatisierte Ende-zu-Ende- und Barrierefreiheitstests (z. B. Playwright + axe-core) im Repository

## Lizenz

Noch nicht festgelegt.
