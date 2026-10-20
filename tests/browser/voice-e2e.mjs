import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const axe = fs.readFileSync(process.env.AXE_PATH, 'utf8');
const URL = 'http://localhost:4173/';
const ok = (cond, msg) => { console.log(cond ? 'OK  ' : 'FAIL', msg); if (!cond) process.exitCode = 1; };
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const instrument = () => {
  window.__announced = [];
  new MutationObserver(() => {
    const el = document.getElementById('announcer');
    if (el && el.textContent && el.textContent !== window.__last) window.__announced.push(el.textContent);
    window.__last = el?.textContent;
  }).observe(document, { subtree: true, childList: true, characterData: true });
  window.__spoken = []; window.__wordMs = 300;
  class U extends EventTarget { constructor(t) { super(); this.text = t; this.rate = 1; this.lang = ''; this.voice = null; this.volume = 1; } }
  const synth = {
    speaking: false, paused: false, queue: [],
    speak(u) { if (u.text) window.__spoken.push({ text: u.text, rate: u.rate }); this.queue.push(u); if (this.queue.length === 1) this._begin(); },
    _begin() { const u = this.queue[0]; if (!u) { this.speaking = false; return; } this.speaking = true;
      setTimeout(() => { if (this.queue[0] !== u) return; u.dispatchEvent(new Event('start'));
        const words = [...u.text.matchAll(/\S+/g)]; let i = 0;
        const step = () => { if (this.queue[0] !== u) return;
          if (i < words.length) { u.dispatchEvent(Object.assign(new Event('boundary'), { charIndex: words[i].index, name: 'word' })); i++; setTimeout(step, window.__wordMs); }
          else { this.queue.shift(); u.dispatchEvent(new Event('end')); this._begin(); } };
        step(); }, 10); },
    cancel() { const q = this.queue; this.queue = []; this.speaking = false; q.forEach((u) => u.dispatchEvent(new Event('end'))); },
    pause() {}, resume() {}, getVoices() { return []; }, addEventListener() {}, removeEventListener() {},
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = U;
  // Spracherkennung nachbilden: liefert window.__say (Alternativen) oder window.__fail (Fehlercode)
  window.__recognitions = [];
  class FakeRecognition extends EventTarget {
    start() {
      window.__recognitions.push({ lang: this.lang, continuous: this.continuous, maxAlternatives: this.maxAlternatives });
      setTimeout(() => {
        if (window.__fail) { this.dispatchEvent(Object.assign(new Event('error'), { error: window.__fail })); }
        else { this.dispatchEvent(Object.assign(new Event('result'), { results: [window.__say.map((transcript) => ({ transcript }))] })); }
        this.dispatchEvent(new Event('end'));
      }, window.__delay ?? 150);
    }
    stop() {} abort() {}
  }
  for (const name of ['webkitSpeechRecognition', 'SpeechRecognition']) {
    Object.defineProperty(window, name, { value: window.__noRecognition ? undefined : FakeRecognition, configurable: true, writable: true });
  }
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
async function makePage(extraInit) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA, acceptDownloads: true });
  if (extraInit) await ctx.addInitScript(extraInit);
  await ctx.addInitScript(instrument);
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && page.errors.push(m.text()));
  page.on('dialog', (d) => d.accept());
  return page;
}
let page = await makePage();
const announced = async () => { await page.waitForTimeout(250); return page.evaluate(() => window.__announced); };
const said = async (t) => (await announced()).some((m) => m.includes(t));
const lastSpoken = () => page.evaluate(() => window.__spoken.at(-1));
const voice = async (words, opts = {}) => {
  await page.evaluate(({ words, opts }) => { window.__say = words; window.__fail = opts.fail; window.__delay = opts.delay; }, { words, opts });
  await page.click('#voice-button');
  await page.waitForTimeout((opts.delay ?? 150) + 400);
};
const audit = async (name) => {
  await page.addScriptTag({ content: axe });
  const r = await page.evaluate(() => axe.run({ runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'] }));
  ok(r.violations.length === 0, `axe ${name}: ${JSON.stringify(r.violations.map((v) => [v.id, v.nodes.map((n) => n.target)]))}`);
};

// ===== Zustimmung und erster Befehl =====
console.log('--- Zustimmung, Dokument scannen');
await page.goto(URL); await page.waitForSelector('#voice-button');
ok(await page.textContent('#voice-button') === 'Befehl', 'Knopf „Befehl“ sichtbar beschriftet');
await page.click('#voice-button');
ok(await page.evaluate(() => document.querySelector('#voice-dialog').open), 'Befehlsfenster offen (modal)');
ok((await page.textContent('#voice-dialog')).includes('Diktierfunktion von Apple'), 'Hinweis zur Datenübertragung vor der Zustimmung');
ok(await page.evaluate(() => window.__recognitions.length) === 0, 'Ohne Zustimmung keine Spracherkennung');
await audit('Befehlsfenster');
await page.screenshot({ path: 'voice-consent.png' });
await page.evaluate(() => { window.__say = ['Dokument scannen']; });
await page.click('button:has-text("Spracherkennung erlauben und sprechen")');
await page.waitForURL(/#\/scannen$/, { timeout: 5000 });
const rec = await page.evaluate(() => window.__recognitions[0]);
ok(rec.lang === 'de-DE' && rec.continuous === false && rec.maxAlternatives === 5, 'Erkennung: Deutsch, ein Befehl, 5 Alternativen');
ok(await page.evaluate(() => !document.querySelector('#voice-dialog').open), 'Fenster nach Befehl geschlossen');

// Scanner-Befehle ohne Kamera
await voice(['Aufnehmen']);
ok(await said('Die Live-Kamera ist nicht aktiv.'), 'Scanner: „Aufnehmen“ ohne Kamera ehrlich beantwortet');
await voice(['Speichern']);
ok(await said('Es ist noch keine Seite aufgenommen.'), 'Scanner: „Speichern“ ohne Seiten');

// ===== Dokument vorbereiten =====
console.log('--- Vorlesen per Sprache');
await page.goto(URL); await page.waitForSelector('h1:has-text("VoxDoc")');
const [c] = await Promise.all([page.waitForEvent('filechooser'), page.click('button:has-text("Fotos aus der Mediathek wählen")')]);
await c.setFiles(['brief.jpg', 'seite2.jpg']);
await page.waitForURL(/#\/dokument\//);
await page.waitForFunction(() => document.querySelector('#ocr-status')?.textContent.startsWith('Erkannt am'), null, { timeout: 120000 });
const docUrl = page.url();
ok(await page.isVisible('button:has-text("Nächste Seite")'), 'Knopf „Nächste Seite“ als Alternative');
await voice(['Vorlesen']);
ok((await lastSpoken()).text.startsWith('Stadtwerke Müllheim'), '„Vorlesen“ liest Seite 1');
await voice(['Nächste Seite']);
ok((await lastSpoken()).text.startsWith('Seite 2 von 2. Seite zwei'), '„Nächste Seite“ springt zu Seite 2');
await voice(['Pause']);
ok(await page.textContent('.reader-controls > button.button-hero') === 'Fortsetzen', '„Pause“ hält an');
ok(await said('Pausiert bei Absatz'), 'Pause angesagt (statt „wird nicht vorgelesen“)');
await voice(['Weiterlesen']);
ok(await page.textContent('.reader-controls > button.button-hero') === 'Pause', '„Weiterlesen“ setzt fort');
await voice(['Schneller']);
const fast = await lastSpoken();
ok(fast.text.startsWith('Tempo 1,1-fach.') && fast.rate === 1.1, '„Schneller“ während des Lesens: Stimme sagt Tempo an');
await voice(['Wie wird das Wetter']);
ok(await said('„Wie wird das Wetter“ habe ich nicht als Befehl erkannt.'), 'Unbekannter Befehl ehrlich gemeldet');
await page.click('#voice-dialog button:has-text("Schließen")');
await page.waitForTimeout(300);
ok(await page.textContent('.reader-controls > button.button-hero') === 'Pause', 'Nach erfolglosem Zuhören wird weitergelesen');
await page.click('.reader-controls > button.button-hero');
await voice(['Speichern']);
ok(await said('Das Dokument ist bereits gespeichert.'), '„Speichern“ im Dokument: ehrliche Antwort');

// ===== PDF =====
console.log('--- PDF');
await voice(['Als PDF exportieren'], { delay: 6000 });
await page.waitForSelector('button:has-text("Datei speichern"):visible', { timeout: 10000 });
ok(await said('ist fertig. Tippe auf „Datei speichern“'), 'Per Sprache: PDF fertig, Tippen nötig (keine falsche Erfolgsmeldung)');
ok(await page.evaluate(() => document.activeElement?.textContent) === 'Datei speichern', 'Fokus auf „Datei speichern“');
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Datei speichern")')]);
await dl.saveAs('voice.pdf');
ok(dl.suggestedFilename().endsWith('.pdf'), 'Dateiname: ' + dl.suggestedFilename());
const info = execFileSync('pdfinfo', ['voice.pdf']).toString();
const pdfText = execFileSync('pdftotext', ['-enc', 'UTF-8', 'voice.pdf', '-']).toString();
ok(/Tagged:\s+yes/.test(info), 'PDF ist getaggt');
ok(['Stadtwerke Müllheim', 'Schäfer', 'Größere Änderungen', 'Straße', 'Öffnungszeiten', 'Texterkennung'].every((w) => pdfText.includes(w)), 'PDF-Text mit Umlauten lesbar');
await page.check('input[name=export-format][value=pdf]');
const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#export-heading ~ .button-stack button:has-text("Exportieren")')]);
await dl2.saveAs('tap.pdf');
ok(await said('heruntergeladen als'), 'Per Tippen: direkt gespeichert');
ok(fs.statSync('tap.pdf').size > 10000, 'PDF über Knopf erzeugt');

// ===== Navigation, Suche, Hilfe, Befehlsfeld =====
console.log('--- Suche, Hilfe, Befehlsfeld');
await voice(['Suche nach Grüßen']);
await page.waitForURL(/#\/suche$/);
await page.waitForTimeout(800);
ok(await page.inputValue('#search-input') === 'grüßen', 'Suchbegriff übernommen');
ok(await said('1 Treffer für „grüßen“'), 'Treffer angesagt');
await voice(['Hilfe']);
await page.waitForURL(/#\/hilfe$/);
ok(await page.isVisible('#help-voice'), 'Hilfe mit Abschnitt Sprachbefehle');
await page.evaluate(() => { window.__fail = 'not-allowed'; });
await page.click('#voice-button');
await page.waitForTimeout(600);
ok((await page.textContent('#voice-state')).includes('nicht erlaubt'), 'Mikrofon verweigert: Meldung sichtbar');
ok(await said('Der Zugriff auf das Mikrofon'), 'Mikrofon verweigert: angesagt');
await page.evaluate(() => { window.__fail = undefined; });
await page.fill('#voice-input', 'Bibliothek');
await page.press('#voice-input', 'Enter');
await page.waitForURL(/#\/bibliothek$/);
ok(true, 'Getippter Befehl „Bibliothek“');
await page.evaluate(() => { window.__fail = 'no-speech'; });
await page.click('#voice-button'); await page.waitForTimeout(500);
ok((await page.textContent('#voice-state')).includes('keinen Befehl gehört'), '„Nichts gehört“ gemeldet, Fenster bleibt offen');
await page.fill('#voice-input', 'Was kann ich sagen');
await page.press('#voice-input', 'Enter');
ok(await page.evaluate(() => document.activeElement?.id) === 'voice-list-heading', '„Was kann ich sagen“ springt zur Liste');
ok(page.errors.length === 0, 'Keine Konsolenfehler: ' + JSON.stringify(page.errors));

// ===== Ohne Spracherkennung / installierte App =====
console.log('--- Ohne Spracherkennung');
page = await makePage(() => { window.__noRecognition = true; });
await page.goto(docUrl.replace(/#.*/, '') + '#/einstellungen'); await page.waitForSelector('#voice-settings-heading');
ok((await page.textContent('#voice-settings-heading + *')).length > 0, 'Einstellungen: Abschnitt Sprachbefehle');
await page.click('#voice-button');
await page.waitForTimeout(300);
ok((await page.textContent('#voice-dialog')).includes('keine Spracherkennung für Webseiten'), 'Nicht unterstützt: ehrliche Erklärung');
ok(!(await page.isVisible('#voice-dialog button:has-text("Sprechen")')), 'Kein „Sprechen“-Knopf ohne Unterstützung');
ok(await page.evaluate(() => document.activeElement?.id) === 'voice-input', 'Fokus im Befehlsfeld');
await page.fill('#voice-input', 'Dokument scannen');
await page.press('#voice-input', 'Enter');
await page.waitForURL(/#\/scannen$/);
ok(true, 'Befehlsfeld als Alternative funktioniert');
page = await makePage(() => { Object.defineProperty(navigator, 'standalone', { value: true }); });
await page.goto(URL); await page.waitForSelector('#voice-button');
await page.click('#voice-button');
await page.waitForTimeout(300);
ok((await page.textContent('#voice-dialog')).includes('In der installierten App erlaubt iOS keine Spracherkennung'), 'Installierte App: Hinweis, keine Spracherkennung angeboten');
ok(await page.evaluate(() => window.__recognitions.length) === 0, 'Installierte App: Erkennung wird nicht gestartet');
await browser.close();
