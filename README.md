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
- **Suche** – durchsucht Titel und Text, zeigt einen Textausschnitt und sagt die Trefferzahl an.
- **Einstellungen** – Stimme, Sprechtempo, Signaltöne, Statusmeldungen vorlesen,
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
│   ├── views/              Ansichten: Start, Bibliothek, Dokument, Suche, Einstellungen, Hilfe
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
4. „Dokument scannen“ aktivieren, ein Foto aufnehmen – nach dem Speichern ertönt ein
   aufsteigender Ton, VoiceOver sagt „Dokument gespeichert“ an und liest die Überschrift des Dokuments.
5. Über die Tab-Leiste zwischen den Bereichen wechseln und prüfen, dass jeweils die neue
   Überschrift angesagt wird.

## Nächste Schritte

- Texterkennung (OCR) im Browser, Ergebnis landet im Textfeld des Dokuments
- Live-Kamera (`getUserMedia`) mit gesprochener Ausrichtungshilfe
- Automatisierte Ende-zu-Ende- und Barrierefreiheitstests (z. B. Playwright + axe-core) im Repository

## Lizenz

Noch nicht festgelegt.
