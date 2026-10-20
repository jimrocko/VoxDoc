import { chromium } from 'playwright-core';
import fs from 'node:fs';
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
  // Sprachausgabe nachbilden (wie in WebKit: start, boundary je Wort, end)
  window.__spoken = []; window.__wordMs = 300;
  class U extends EventTarget { constructor(t) { super(); this.text = t; this.rate = 1; this.lang = ''; this.voice = null; this.volume = 1; } }
  const synth = {
    speaking: false, paused: false, queue: [],
    speak(u) { if (u.text) window.__spoken.push(u.text); this.queue.push(u); if (this.queue.length === 1) this._begin(); },
    _begin() {
      const u = this.queue[0]; if (!u) { this.speaking = false; return; }
      this.speaking = true;
      setTimeout(() => {
        if (this.queue[0] !== u) return;
        u.dispatchEvent(new Event('start'));
        const words = [...u.text.matchAll(/\S+/g)]; let i = 0;
        const step = () => { if (this.queue[0] !== u) return;
          if (i < words.length) { u.dispatchEvent(Object.assign(new Event('boundary'), { charIndex: words[i].index, name: 'word' })); i++; setTimeout(step, window.__wordMs); }
          else { this.queue.shift(); u.dispatchEvent(new Event('end')); this._begin(); } };
        step();
      }, 10);
    },
    cancel() { const q = this.queue; this.queue = []; this.speaking = false; q.forEach((u) => u.dispatchEvent(new Event('end'))); },
    pause() {}, resume() {}, getVoices() { return []; }, addEventListener() {}, removeEventListener() {},
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = U;
  // Schreibfehler auf Wunsch simulieren (voller Speicher)
  for (const m of ['put', 'add']) {
    const orig = IDBObjectStore.prototype[m];
    IDBObjectStore.prototype[m] = function (...a) { if (window.__failWrites && this.name === 'documents') throw new DOMException('Speicher voll', 'QuotaExceededError'); return orig.apply(this, a); };
  }
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA, acceptDownloads: true });
await ctx.addInitScript(instrument);
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const hosts = new Set(); ctx.on('request', (r) => { const u = new globalThis.URL(r.url()); if (u.protocol.startsWith('http')) hosts.add(u.host); });
page.on('dialog', (d) => d.accept());
const announced = async () => { await page.waitForTimeout(250); return page.evaluate(() => window.__announced); };
const said = async (text) => (await announced()).some((m) => m.includes(text));
const focused = () => page.evaluate(() => document.activeElement?.textContent?.trim());
const toggle = '.reader-controls > button.button-hero';
const audit = async (name) => {
  await page.addScriptTag({ content: axe });
  const r = await page.evaluate(() => axe.run({ runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'] }));
  ok(r.violations.length === 0, `axe ${name}: ${JSON.stringify(r.violations.map((v) => [v.id, v.nodes.map((n) => n.target)]))}`);
};
const importPhotos = async (files) => {
  await page.goto(URL); await page.waitForSelector('h1:has-text("VoxDoc")');
  const [c] = await Promise.all([page.waitForEvent('filechooser'), page.click('button:has-text("Fotos aus der Mediathek wählen")')]);
  await c.setFiles(files);
  await page.waitForURL(/#\/dokument\//);
  await page.waitForFunction(() => document.querySelector('#ocr-status')?.textContent.startsWith('Erkannt am'), null, { timeout: 120000 });
  return page.url();
};

// ===== Speichern, Umbenennen, Suchen =====
console.log('--- Speichern, Umbenennen, Suchen');
const docUrl = await importPhotos('brief.jpg');
await page.click('button:has-text("Umbenennen")');
ok(await page.evaluate(() => document.activeElement?.id) === 'edit-field', 'Fokus im Namensfeld');
await page.fill('#edit-field', 'Stromrechnung Oktober');
await page.click('button[type=submit]');
await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Stromrechnung Oktober');
ok(await said('Umbenannt in „Stromrechnung Oktober“'), 'Umbenennen angesagt');
await page.goto(URL + '#/suche');
await page.fill('#search-input', 'stromrechnung');
await page.waitForTimeout(900);
ok((await page.textContent('.doc-list')).includes('Stromrechnung Oktober'), 'Suche findet neuen Namen');
await page.fill('#search-input', 'Grüßen');
await page.waitForTimeout(900);
ok((await page.$$('.doc-list li')).length === 1, 'Suche findet erkannten Text mit ß');

// ===== Leseposition =====
console.log('--- Leseposition');
await page.goto(docUrl);
await page.waitForSelector(toggle);
ok(await page.textContent(toggle) === 'Vorlesen', 'Noch nie gelesen: „Vorlesen“');
await page.click(toggle);
await page.waitForTimeout(400);
await page.click('button:has-text("Nächster Absatz")');
await page.waitForTimeout(800);
await page.click(toggle); // Pause
ok(await page.textContent(toggle) === 'Fortsetzen', 'Pause');
await page.click('[data-tab=library]');
await page.waitForSelector('.doc-meta');
const meta = await page.textContent('.doc-meta');
ok(/weiterlesen ab Absatz 2 von \d+/.test(meta), 'Bibliothek zeigt Lesefortschritt: ' + meta);
await page.click('[data-tab=start]');
await page.waitForSelector('#continue-heading');
ok((await page.textContent('#continue-heading + .doc-list')).includes('Stromrechnung Oktober'), 'Startseite: „Weiterlesen“');
await page.reload();
await page.goto(docUrl);
await page.waitForSelector(toggle);
ok(await page.textContent(toggle) === 'Weiterlesen', 'Nach Neuladen: „Weiterlesen“');
ok((await page.textContent('#reader-status')).startsWith('Zuletzt gelesen bis Absatz 2 von'), 'Status nennt die Position: ' + await page.textContent('#reader-status'));
ok(await page.isVisible('button:has-text("Von vorn vorlesen")'), '„Von vorn vorlesen“ angeboten');
const before = await page.evaluate(() => window.__spoken.length);
await page.click(toggle);
await page.waitForTimeout(300);
const resumed = await page.evaluate(() => window.__spoken.at(-1));
ok(await page.evaluate(() => window.__spoken.length) === before + 1 && resumed.startsWith('Sehr geehrte Frau Schäfer'), 'Weiterlesen ab Absatz 2: ' + resumed);
await page.click(toggle);
await page.click('button:has-text("Von vorn vorlesen")');
await page.waitForTimeout(300);
ok((await page.evaluate(() => window.__spoken.at(-1))).includes('Stadtwerke Müllheim'), 'Von vorn vorlesen');
ok(await focused() === 'Pause', 'Fokus auf „Pause“ nach „Von vorn“');
await page.evaluate(() => { window.__wordMs = 2; });
await page.waitForFunction(() => document.querySelector('#reader-status')?.textContent === 'Fertig vorgelesen.', null, { timeout: 15000 });
await page.reload(); await page.waitForSelector(toggle);
ok((await page.textContent('#reader-status')).startsWith('Bereits ganz vorgelesen'), 'Nach dem Ende: „Bereits ganz vorgelesen“');
ok(await page.textContent(toggle) === 'Vorlesen', 'Erneut vorlesen möglich');
await page.evaluate(() => { window.__wordMs = 300; });
await audit('Dokument');

// ===== Seitenreihenfolge =====
console.log('--- Seitenreihenfolge');
const twoUrl = await importPhotos(['brief.jpg', 'seite2.jpg']);
ok((await page.textContent('.doc-text p')).startsWith('Stadtwerke'), 'Text beginnt mit Seite 1');
await page.click('button:has-text("Seite 2 nach vorn verschieben")');
await page.waitForFunction(() => document.querySelector('.doc-text p')?.textContent.startsWith('Seite zwei'));
ok(await said('Seite 2 ist jetzt Seite 1. Der erkannte Text wurde neu geordnet.'), 'Verschieben angesagt');
ok(await focused() === 'Seite 1 nach hinten verschieben', 'Fokus bleibt bei der verschobenen Seite');
await page.reload(); await page.waitForSelector('.doc-text p');
ok((await page.textContent('.doc-text p')).startsWith('Seite zwei'), 'Reihenfolge gespeichert');
const alts = await page.$$eval('.doc-photo img', (i) => i.map((x) => x.alt));
ok(alts.join('|') === 'Foto von Seite 1|Foto von Seite 2', 'Alternativtexte: ' + alts);
await audit('Dokument mit Seiten');

// ===== Löschen =====
console.log('--- Löschen');
await page.click('button:has-text("Dokument löschen")');
await page.waitForURL(/#\/bibliothek$/);
ok(await said('gelöscht.'), 'Löschen angesagt');
ok((await page.$$('.doc-list li')).length === 1, 'Ein Dokument übrig');

// ===== Speicher voll =====
console.log('--- Speicher voll');
await page.goto(docUrl); await page.waitForSelector('h1');
await page.evaluate(() => { window.__failWrites = true; });
await page.click('button:has-text("Umbenennen")');
await page.fill('#edit-field', 'Darf nicht gespeichert werden');
await page.click('button[type=submit]');
await page.waitForTimeout(400);
ok(await said('Der Speicher ist voll, die Änderung wurde nicht gespeichert. Bereits gespeicherte Dokumente bleiben erhalten.'), 'Volle Platte verständlich angesagt');
ok(await page.isVisible('#edit-field'), 'Formular bleibt offen (Eingabe nicht verloren)');
await page.evaluate(() => { window.__failWrites = false; });
await page.reload(); await page.waitForSelector('h1');
ok(await page.textContent('h1') === 'Stromrechnung Oktober', 'Daten unverändert');

// ===== Sicherung =====
console.log('--- Sicherung');
await page.goto(URL + '#/einstellungen');
await page.waitForSelector('#backup-heading');
ok((await page.textContent('#storage-persistence')).includes('sieben Tage'), 'Hinweis auf Löschen durch Safari: ' + await page.textContent('#storage-persistence'));
await audit('Einstellungen');
const [download] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Sicherung erstellen")')]);
const file = 'backup.json';
await download.saveAs(file);
ok(/^VoxDoc-Sicherung-\d{4}-\d{2}-\d{2}\.json$/.test(download.suggestedFilename()), 'Dateiname: ' + download.suggestedFilename());
ok(await said('Sicherung mit 1 Dokument'), 'Sicherung angesagt');
ok(await focused() === 'Sicherung erstellen', 'Fokus zurück');
const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
ok(backup.documents[0].title === 'Stromrechnung Oktober' && backup.documents[0].pages.length === 1 && backup.documents[0].text.includes('Grüßen'), 'Sicherung enthält Titel, Foto, Text');
await page.click('button:has-text("Alle Dokumente löschen")');
await page.waitForTimeout(300);
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('button:has-text("Sicherung wiederherstellen")')]);
await chooser.setFiles(file);
await page.waitForTimeout(800);
ok(await said('1 Dokument wiederhergestellt.'), 'Wiederherstellen angesagt');
const [chooser2] = await Promise.all([page.waitForEvent('filechooser'), page.click('button:has-text("Sicherung wiederherstellen")')]);
await chooser2.setFiles(file);
await page.waitForTimeout(800);
ok(await said('1 Dokument war schon vorhanden und blieb unverändert.'), 'Doppeltes Wiederherstellen erkannt');
fs.writeFileSync('kaputt.json', '{"format":"etwas"}');
const [chooser3] = await Promise.all([page.waitForEvent('filechooser'), page.click('button:has-text("Sicherung wiederherstellen")')]);
await chooser3.setFiles('kaputt.json');
await page.waitForTimeout(500);
ok(await said('Diese Datei ist keine gültige VoxDoc-Sicherung.'), 'Ungültige Sicherung abgelehnt');
await page.goto(docUrl); await page.waitForSelector(toggle);
ok(await page.textContent(toggle) === 'Vorlesen' && (await page.textContent('.doc-text')).includes('Müllheim'), 'Wiederhergestelltes Dokument vollständig');

// ===== Scan-Entwurf =====
console.log('--- Scan-Entwurf');
await page.goto(URL + '#/scannen');
await page.waitForSelector('#pages-heading');
const [c4] = await Promise.all([page.waitForEvent('filechooser'), page.click('button:has-text("Fotos aus der Mediathek wählen")')]);
await c4.setFiles(['brief.jpg', 'seite2.jpg']);
await page.waitForFunction(() => document.querySelectorAll('.page-item').length === 2);
await page.click('button:has-text("Seite 2 nach vorn verschieben")');
ok(await focused() === 'Seite 1 nach hinten verschieben', 'Scanner: Fokus bei verschobener Seite');
await page.waitForTimeout(300);
// App „abstürzen“ lassen: neue Seite, gleicher Speicher
const page2 = await ctx.newPage();
await page.close();
await page2.goto(URL + '#/scannen');
await page2.waitForSelector('.page-item', { timeout: 10000 });
await page2.waitForTimeout(400);
ok((await page2.evaluate(() => window.__announced)).some((m) => m.includes('Ein unvollständiger Scan mit 2 Seiten wurde wiederhergestellt.')), 'Entwurf nach Neustart wiederhergestellt');
ok((await page2.$$('.page-item')).length === 2, 'Beide Seiten da');

// ===== Datenbank in anderem Tab aktualisiert =====
console.log('--- Anderer Tab');
const page3 = await ctx.newPage();
await page3.goto(URL + '#/hilfe');
await page3.evaluate(() => new Promise((resolve) => { const r = indexedDB.open('voxdoc', 99); r.onsuccess = () => { r.result.close(); resolve(); }; r.onupgradeneeded = () => {}; }));
await page2.waitForSelector('#storage-banner:not([hidden])', { timeout: 5000 });
ok((await page2.textContent('#storage-banner-text')).includes('in einem anderen Tab aktualisiert'), 'Hinweis bei Update im anderen Tab');
ok(await page2.isVisible('#storage-banner-reload'), '„Seite neu laden“ angeboten');
await browser.close();

// ===== Speicher nicht verfügbar =====
console.log('--- Speicher nicht verfügbar');
{
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM });
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, userAgent: UA });
  await c.addInitScript(instrument);
  await c.addInitScript(() => { IDBFactory.prototype.open = () => { throw new DOMException('privat', 'InvalidStateError'); }; });
  const p = await c.newPage();
  await p.goto(URL);
  await p.waitForSelector('#storage-banner:not([hidden])');
  ok((await p.textContent('#storage-banner-text')).includes('nicht verfügbar'), 'Banner: Speicher nicht verfügbar');
  ok((await p.textContent('main')).includes('nicht verfügbar'), 'Ansicht erklärt das Problem statt leer zu bleiben');
  await p.waitForTimeout(300);
  ok((await p.evaluate(() => window.__announced)).some((m) => m.includes('nicht verfügbar')), 'Angesagt');
  await b.close();
}
ok([...hosts].every((h) => h === 'localhost:4173'), 'Keine Anfragen an fremde Server: ' + [...hosts].join(', '));
ok(errors.filter((e) => !/QuotaExceeded|Speicher voll|Failed to load resource/.test(e)).length === 0, 'Keine unerwarteten Konsolenfehler: ' + JSON.stringify(errors));
