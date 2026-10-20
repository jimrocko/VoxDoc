# VoxDoc

Barrierefreie Dokumentenerkennung für blinde und sehbehinderte Menschen, gebaut als
Progressive Web App (PWA) für das iPhone. VoxDoc soll Dokumente mit der Kamera erfassen,
den Text erkennen und vorlesen.

> **Status:** Grundgerüst. Startseite, PWA-Einrichtung und Barrierefreiheits-Basis sind
> fertig. Kamera, Texterkennung und Sprachausgabe sind noch nicht umgesetzt.

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

## Projektstruktur

```
├── index.html            Startseite, iOS-Meta-Tags, Live-Region
├── public/icons/         App-Icons (SVG, Apple Touch Icon, PWA-Icons)
├── src/
│   ├── main.ts           Einstiegspunkt, Service-Worker-Registrierung
│   ├── platform.ts       Erkennung von iOS und Standalone-Modus
│   ├── a11y/announcer.ts Ansagen für VoiceOver über eine Live-Region
│   ├── styles.css        Minimalistisches, responsives Design
│   └── env.d.ts          Globale Typdeklarationen
├── vite.config.ts        Vite- und PWA-Konfiguration (Manifest)
└── tsconfig.json
```

## Barrierefreiheit

Barrierefreiheit ist die Grundlage von VoxDoc, nicht ein Zusatz. Bereits umgesetzt:

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
4. „Dokument scannen“ aktivieren – VoiceOver sollte die Statusmeldung ansagen.

## Nächste Schritte

- Kamerazugriff (`getUserMedia`) mit gesprochener Ausrichtungshilfe
- Texterkennung (OCR) im Browser
- Vorlesen über die Web Speech API (`speechSynthesis`)
- Automatisierte Barrierefreiheitstests (z. B. axe-core) und Unit-Tests

## Lizenz

Noch nicht festgelegt.
