# VoxDoc – Prüfprotokoll

Stand: 20. Oktober 2026, Gesamtprüfung auf Basis von Commit `f21215e` (die Korrekturen dieser Prüfung sind im
nachfolgenden Commit enthalten).

**Wichtig:** Alle Tests liefen in einer Linux-Testumgebung mit **Chromium** (headless, iPhone-Bildschirmgröße und
iPhone-Kennung). **Safari/WebKit, iOS und VoiceOver wurden nicht getestet** – WebKit war in der Umgebung nicht
verfügbar. Wo von „VoiceOver-Beschriftungen“ die Rede ist, wurde der Barrierefreiheitsbaum von Chromium geprüft,
nicht die Ausgabe von VoiceOver. Kamera, Sprachausgabe und Spracherkennung wurden in Teilen nachgebildet (siehe
jeweils „Wie geprüft“).

## Prüfumgebung

| Werkzeug | Version |
| --- | --- |
| Node.js | 22.22.0 |
| Chromium (Playwright) | Build 1194, `playwright-core` 1.64.1 |
| axe-core | 4.14.0 (Regeln WCAG 2.0/2.1/2.2 A und AA sowie Best Practices) |
| veraPDF | 1.30.3, Profil PDF/UA-1 |
| W3C Nu Html Checker | 26.10.12 |
| poppler (`pdfinfo`, `pdffonts`, `pdftotext`) | 24.02.0 |
| pypdf / Pillow | 6.17.0 / 12.3.0 |
| TypeScript / Vitest | 7.0.2 / 5.0.5 |

## 1. In dieser Prüfung gefundene und behobene Fehler

| # | Fehler | Auswirkung | Behebung | Nachweis |
| --- | --- | --- | --- | --- |
| 1 | Bei 320 px Breite und doppelter Schriftgröße waren **alle Ansichten** 9–129 px zu breit (lange deutsche Wörter, mitwachsende Seitenabstände, Tab-Leiste) | Bei großen Bedienungshilfen-Schriftgrößen auf kleinen iPhones waagerechtes Scrollen bzw. Verkleinern | Silbentrennung und Notumbruch, seitliche Abstände mit Obergrenze, schrumpfbare Tab-Spalten, begrenzt wachsende Tab-Symbole | `audit`: alle 8 Ansichten ohne Überbreite |
| 2 | Service Worker lud die Seite bei einem Update **ungefragt neu** (`registerType: 'autoUpdate'`) | Abbruch mitten im Vorlesen, Verlust nicht gespeicherter Eingaben, Orientierungsverlust (WCAG 3.2.5) | Update wird angesagt und angeboten („Jetzt aktualisieren“), neu geladen wird erst nach dem Tippen | `fixes`: Hinweis erscheint und wird angesagt, Seite bleibt bestehen, Neuladen erst nach Tippen |
| 3 | Löschen eines Dokuments während seiner Texterkennung führte danach zu einer verwirrenden Fehlermeldung | Falsche Fehleransage nach erfolgreichem Löschen | Erkennung wird vor dem Löschen abgebrochen (auch bei „Alle Dokumente löschen“) | `fixes`: „Texterkennung abgebrochen“, „gelöscht“, keine Fehlermeldung |
| 4 | Knopf „Befehl“ wuchs bei großer Schrift auf 165 px Breite und verdeckte den Knopf „Dokument scannen“; fokussierte Elemente konnten unter Tab-Leiste oder Befehlsknopf liegen | Verdeckter Inhalt und Fokus (WCAG 2.4.11) | Größe des Befehlsknopfs begrenzt, `scroll-padding-bottom` hält fokussierte Elemente frei | `obscured`: kein verdeckter Fokus in 4 Ansichten bei 100 % und 200 %; Knopf bleibt kompakt |
| 5 | Drei Stellen konnten eine nicht abgefangene Promise-Ablehnung erzeugen (`AudioContext.resume`, Aufräumen alter OCR-Dateien, Ausführen eines Befehls) | Mögliche Konsolenfehler, beim Befehl fehlende Rückmeldung | Fehler abgefangen, beim Befehl mit Ansage | Code-Durchsicht und Typprüfung; die Fehlerfälle selbst wurden **nicht** gezielt ausgelöst |
| 6 | Kein Abstand zwischen „Sprachausgabe testen“ und dem Schalter darunter | Rein optisch | Abstand ergänzt | Sichtprüfung per Bildschirmfoto |

Nicht umgebaut wurden funktionierende Bereiche; alle Änderungen sind auf die genannten Stellen beschränkt.

## 2. Bestandene Tests (in dieser Prüfung ausgeführt)

Alle Zahlen stammen aus dem letzten vollständigen Lauf nach den Korrekturen.

### Build und Code

| Test | Ergebnis |
| --- | --- |
| Neuinstallation (`npm ci`) | erfolgreich |
| `npm audit` | 0 Schwachstellen |
| TypeScript-Typprüfung (strict) | fehlerfrei |
| Produktions-Build (`npm run build`) | erfolgreich, Service-Worker-Precache 18 Einträge (≈ 585 KB) |
| Unit-Tests (`npm test`, mit `VERAPDF=…`) | **163 von 163** bestanden in 17 Dateien |
| Code-Durchsicht | kein `innerHTML`/`outerHTML`/`document.write`, keine `console.log`-Reste; alle `catch`-Blöcke melden den Fehler, wandeln ihn um oder fallen begründet auf einen Standard zurück; `void`-Aufrufe geprüft (3 ergänzt, siehe Fehler 5) |

### Browser-Testreihen (`npm run test:browser`)

**462 von 462 Prüfungen** in 11 Reihen bestanden, jeweils gegen den Produktions-Build:

| Reihe | Prüfungen | Wie geprüft |
| --- | --- | --- |
| `e2e` – Grundoberfläche | 39 | alle Ansichten, Scan über Dateiauswahl, Umbenennen, Text bearbeiten, Bibliothek sortieren, Suche, Einstellungen, Hilfe, Offline-Start, Löschen |
| `reader` – Vorlesen | 38 | **nachgebildete Sprachausgabe** mit WebKit-typischen Ereignissen; Pause/Fortsetzen am Wort, Absatz vor/zurück/wiederholen, Tempo, Ende, Hintergrund, keine Ansagen während des Vorlesens |
| `scanner` – Kamera | 61 | **echtes `getUserMedia`** mit Chromium-Kamerasimulation aus Videodateien; Sprachführung, Auto-Auslösung, Neuaufnahme, Entfernen, Berechtigung verweigert / offen, Kamera belegt, keine Kamera, Kamera-App und Mediathek als Alternative |
| `ocr` – Texterkennung | 45 | **echtes Tesseract.js** im Browser; Umlaute/ß, Fortschritt, Abbrechen, bearbeiteter Text bleibt, leere Seite, offline aus dem Cache, Fehler ohne Internet |
| `docs` – Speicherung | 48 | **echtes IndexedDB** in Chromium; Umbenennen, Suchen, Leseposition nach Neuladen, Seitenreihenfolge, Löschen, voller Speicher (simuliert), Sicherung/Wiederherstellung, Scan-Entwurf nach Abbruch, Update in anderem Tab, Speicher nicht verfügbar, keine Anfragen an fremde Server |
| `voice` – Sprachbefehle | 42 | **nachgebildete Spracherkennung**; Zustimmung, alle Befehle, Fehlercodes, Befehlsfeld, kein Angebot ohne Unterstützung bzw. in der installierten App |
| `export` – TXT/HTML/PDF | 34 | Formatauswahl per Tastatur, Dateien heruntergeladen und geprüft: W3C-Validator (0 Fehler, 0 Warnungen), axe auf der HTML-Datei (hell/dunkel), veraPDF, `pdfinfo`/`pdffonts`/`pdftotext`, Strukturbaum per pypdf, PDF-Export offline |
| `audit` – Gesamtprüfung | 123 | alle 8 Ansichten: axe dunkel, hell und bei 320 px mit doppelter Schrift; genau eine h1, keine übersprungene Überschriftenebene, keine doppelten IDs, gültige ARIA-Verweise, Namen aller Bedienelemente im Barrierefreiheitsbaum, eine Live-Region, keine Überbreite; Fokus auf h1 nach jedem Tab-Wechsel, eigene Fenstertitel, Tab-Reihenfolge, sichtbarer Fokus, Befehlsfenster (axe, Escape, Fokus zurück), Manifest und Icons, alle Ansichten offline |
| `fixes` – Korrekturen | 8 | Update-Hinweis statt Neuladen; Löschen während der Texterkennung |
| `contrast` – Systemeinstellungen | 15 | „Kontrast erhöhen“ (`prefers-contrast: more`) in 6 Ansichten hell/dunkel, „Bewegung reduzieren“ |
| `obscured` – Fokus nicht verdeckt | 9 | Tab durch 4 Ansichten bei 390 px/100 % und 320 px/200 %, Größe des Befehlsknopfs |

### Ergebnisse nach Bereich

| Bereich | Bestanden (Chromium) |
| --- | --- |
| Build | Neuinstallation, Typprüfung, Build, 163 Unit-Tests, keine Schwachstellen |
| Navigation | Tab-Leiste mit `aria-current`, Fokus auf die neue Überschrift, eigene Fenstertitel, „Zum Inhalt springen“, Tastatur ohne Fokusfalle, modales Befehlsfenster |
| Beschriftungen | keine unbenannten Bedienelemente (Barrierefreiheitsbaum), sichtbarer Text im Namen (wichtig für die iOS-Sprachsteuerung), axe in allen Ansichten ohne Befund, Formatauswahl mit kurzen Namen und getrennten Beschreibungen |
| Vorlesen | alle Bedienfunktionen mit nachgebildeter Sprachausgabe; Leseposition wird gespeichert und nach Neuladen fortgesetzt |
| Kamera | Bildanalyse, Hinweise, Töne und Auslösung mit echtem Kamera-Stream aus Videodateien; alle Fehler- und Berechtigungsfälle |
| OCR | echte Erkennung deutscher Testbilder (Node und Chromium), offline |
| Speicherung | IndexedDB-Version 3 inkl. Migration von 1 und 2, atomare Schreibvorgänge, Fehlermeldungen, Sicherung |
| Export | TXT, valides HTML, getaggtes PDF (veraPDF PDF/UA-1: 105 von 106 Regeln; einziger Befund ist die bewusst fehlende PDF/UA-Kennung) |
| Offline | alle 8 Ansichten, Dokumenttext, Texterkennung und PDF-Export ohne Netz |

Gemessen in Chromium (Desktop-Rechner, **nicht** iPhone): erste Texterkennung inklusive Laden ≈ 2,0 s, weitere
Seite ≈ 0,9 s, Kaltstart offline ≈ 1,1 s; Spitzen-Arbeitsspeicher des Renderer-Prozesses ≈ 317 MB.

## 3. Offene Probleme und bekannte Einschränkungen

Nicht behoben, weil nicht ohne größeren Umbau lösbar oder außerhalb von VoxDoc:

| Problem | Bewertung |
| --- | --- |
| **Keine Prüfung in Safari/WebKit, auf iOS oder mit VoiceOver** | größtes Restrisiko – siehe Abschnitt 4 |
| Tab-Beschriftungen werden bei sehr großer Schrift gekürzt („Biblioth…“) | sichtbar gekürzt; der zugängliche Name bleibt vollständig, Sprachsteuerung funktioniert mit dem vollen Namen |
| Dynamic Type nur nachgestellt (Schriftgröße 200 %); `font: -apple-system-body` wirkt nur in Safari | auf dem Gerät prüfen |
| PDF nicht als PDF/UA gekennzeichnet; Prüfungen durch Menschen (Matterhorn-Protokoll) nicht erfolgt | bewusst, siehe README |
| Spracherkennung nur nachgebildet; in der installierten App laut WebKit nicht verfügbar | auf dem Gerät in Safari prüfen |
| Scanner-Schwellwerte beruhen auf nachgestellten Kamerabildern | mit echten Dokumenten und Licht prüfen |
| Arbeitsspeicher und Laufzeit der Texterkennung auf dem iPhone unbekannt | auf älteren Geräten prüfen |
| Löschen der Website-Daten durch Safari (7 Tage) lässt sich nicht erkennen | nur Installation und Sicherung schützen |
| Mikrofon kann eine VoiceOver-Ansage kurz vor dem Zuhören mit aufnehmen | auf dem Gerät prüfen |
| Sicherung entsteht vollständig im Arbeitsspeicher | bei sehr vielen Dokumenten auf älteren Geräten riskant |
| Seiten gespeicherter Dokumente lassen sich nur umsortieren, nicht entfernen oder ergänzen | Funktionslücke |
| Abgefangene Fehlerfälle aus Fehler 5 wurden nicht gezielt ausgelöst | Restrisiko gering |

## 4. Notwendige Praxistests auf einem echten iPhone mit VoiceOver

Empfehlung: ein aktuelles und ein älteres iPhone, jeweils in Safari **und** als installierte App
(`npm run build && npm run preview:https`, Zertifikat bestätigen). VoiceOver an, Sprache Deutsch.

### Installation, Start, Offline

- [ ] In Safari öffnen; Startseite wird vorgelesen, Überschrift „VoxDoc“, Hinweis „Als App installieren“
- [ ] „Zum Home-Bildschirm“ hinzufügen; App startet ohne Safari-Leiste
- [ ] Flugmodus an: App startet, Bibliothek und Dokumente sind da, Texterkennung und PDF-Export funktionieren (nach einmaliger Nutzung online)
- [ ] Neue Version bereitstellen: Hinweis „Eine neue Version …“ wird angesagt, die Seite lädt **nicht** von selbst neu

### Navigation und Beschriftungen

- [ ] Mit Wischen alle Elemente der Startseite erreichen; Reihenfolge logisch, keine unbeschrifteten Elemente
- [ ] Rotor „Überschriften“ in jeder Ansicht: eine Überschrift 1, sinnvolle Abschnitte
- [ ] Tab-Leiste: „Bibliothek, ausgewählt“ o. Ä. für den aktiven Tab; nach Tab-Wechsel liest VoiceOver die neue Überschrift
- [ ] Befehlsfenster: VoiceOver bleibt im Fenster, „Schließen“ bzw. Zwei-Finger-Z-Geste schließt es
- [ ] Schalter (Signaltöne usw.) werden als Schalter mit Zustand angesagt (iOS 17.4+)
- [ ] Sprechtempo-Regler: Wischen nach oben/unten ändert den Wert, Ansage „1,1-fach“
- [ ] Dynamic Type auf die größte Bedienungshilfen-Größe: kein waagerechtes Scrollen, nichts verdeckt
- [ ] „Kontrast erhöhen“ und „Bewegung reduzieren“ an: alles lesbar
- [ ] iOS-Sprachsteuerung: „Tippe auf Dokument scannen“, „Tippe auf Vorlesen“, „Tippe auf Nächste Seite“ funktionieren

### Scanner und Kamera

- [ ] Erstes Öffnen: Kamera-Abfrage erscheint; bei längerem Zögern wird „Bitte erlaube VoxDoc den Zugriff …“ angesagt
- [ ] Ablehnen: verständliche Meldung mit Weg in die Einstellungen; Kamera-App und Mediathek funktionieren
- [ ] Blatt auf dunklem Tisch: Hinweise („nach links“, „zu weit weg“, „Dokument erkannt“) sind verständlich und nicht zu häufig
- [ ] Takt-Töne und Auslösegeräusch hörbar (Stummschalter aus); Seite wird automatisch aufgenommen
- [ ] Nächste Seite hinlegen: keine Doppelaufnahme; „Seite 1 neu aufnehmen“, „entfernen“, „nach vorn verschieben“ mit VoiceOver bedienbar
- [ ] App während des Scans beenden und neu öffnen: „Ein unvollständiger Scan … wurde wiederhergestellt“
- [ ] Bei schlechtem Licht: „Zu dunkel“; Knopf „Licht“ erscheint nur, wenn das Gerät eine Taschenlampe meldet

### Texterkennung

- [ ] Erste Erkennung lädt die Sprachdaten (Ansage), Fortschritt per VoiceOver abrufbar
- [ ] Dauer pro Seite auf neuem und älterem iPhone notieren; kein Absturz bei 5+ Seiten
- [ ] Ergebnis mit echten Briefen: Umlaute und ß korrekt, Genauigkeit wird angesagt
- [ ] App während der Erkennung in den Hintergrund: Verhalten beim Zurückkehren notieren

### Vorlesen

- [ ] „Vorlesen“, „Pause“, „Fortsetzen“: Fortsetzen beginnt beim richtigen Wort (WebKit-`boundary`-Ereignisse)
- [ ] Absatz vor/zurück/wiederholen, „Nächste Seite“ bei mehrseitigen Dokumenten
- [ ] Tempo ändern während des Vorlesens; gewählte Stimme wird verwendet (Stimmen unter Einstellungen › Bedienungshilfen › Gesprochene Inhalte laden)
- [ ] Während des Vorlesens keine VoiceOver-Ansagen von VoxDoc; Überschneidung mit VoiceOver beim Bedienen der Knöpfe bewerten
- [ ] Dokument schließen und später öffnen: „Weiterlesen“ und „Zuletzt gelesen bis Absatz …“
- [ ] Bildschirm sperren: Vorlesen pausiert und lässt sich fortsetzen

### Sprachbefehle

- [ ] In Safari: Zustimmung, dann Mikrofon- und Spracherkennungs-Abfrage von iOS
- [ ] „Dokument scannen“, „Vorlesen“, „Pause“, „Weiterlesen“, „Nächste Seite“, „Suche nach …“, „Speichern“, „Als PDF exportieren“, „Hilfe“ werden erkannt
- [ ] Wird eine VoiceOver-Ansage mit aufgenommen? Nach dem Ton sprechen funktioniert zuverlässig?
- [ ] In der installierten App: Hinweis, dass iOS dort keine Spracherkennung erlaubt; Befehlsfeld mit Diktiertaste funktioniert

### Speicherung und Sicherung

- [ ] Einstellungen › Speicher: Angabe, ob dauerhafter Speicher gewährt wurde
- [ ] „Sicherung erstellen“ → „In Dateien sichern“; Datei in der Dateien-App vorhanden
- [ ] Alle Dokumente löschen, „Sicherung wiederherstellen“ aus der Dateien-App: Dokumente, Fotos, Text und Leseposition sind zurück
- [ ] Fast voller iPhone-Speicher: verständliche Meldung, nichts halb gespeichert

### Export

- [ ] Formatauswahl mit VoiceOver: „Format, Gruppe“, Optionen mit Beschreibung, Schalter „Fotos einschließen“
- [ ] PDF über das Teilen-Menü sichern; in der Dateien-App mit VoiceOver öffnen: Überschriften navigierbar, Text wird gelesen, Fotos mit Alternativtext, Seitenzahlen werden übersprungen
- [ ] HTML in Safari öffnen und mit VoiceOver lesen; TXT in der Dateien-App
- [ ] Export per Sprachbefehl: Knopf „Datei speichern“ erscheint und funktioniert

### Töne und Hardware

- [ ] Stummschalter an: Verhalten von Signaltönen und Sprachausgabe notieren
- [ ] Bluetooth-Tastatur: Tab-Reihenfolge, sichtbarer Fokus, Pfeiltasten in der Formatauswahl
- [ ] Braillezeile (falls verfügbar): Beschriftungen und Statusmeldungen lesbar

## 5. Tests wiederholen

```bash
npm ci
npm test                                   # Unit-Tests (veraPDF-Test wird ohne VERAPDF übersprungen)
VERAPDF=/pfad/zu/verapdf npm test          # inkl. PDF/UA-1-Prüfung
VERAPDF=/pfad/zu/verapdf VNU_JAR=/pfad/zu/vnu.jar npm run test:browser
```

`npm run test:browser` baut die App, startet die Vorschau, erzeugt Testbilder und Kameravideos (braucht Python mit
Pillow) und meldet Reihen, deren Werkzeuge fehlen, als **übersprungen** – nicht als bestanden.
