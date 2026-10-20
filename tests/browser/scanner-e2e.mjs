import { chromium } from 'playwright-core';
import fs from 'node:fs';
const axe = fs.readFileSync(process.env.AXE_PATH, 'utf8');
const URL = 'http://localhost:4173/';
const ok = (cond, msg) => { console.log(cond ? 'OK  ' : 'FAIL', msg); if (!cond) process.exitCode = 1; };
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

const instrument = () => {
  window.__announced = []; window.__tones = []; window.__streams = [];
  new MutationObserver(() => {
    const el = document.getElementById('announcer');
    if (el && el.textContent && el.textContent !== window.__last) window.__announced.push(el.textContent);
    window.__last = el?.textContent;
  }).observe(document, { subtree: true, childList: true, characterData: true });
  const start = OscillatorNode.prototype.start;
  OscillatorNode.prototype.start = function (...args) { window.__tones.push(this.frequency.value); return start.apply(this, args); };
  if (navigator.mediaDevices?.getUserMedia) {
    const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (c) => { const s = await gum(c); window.__streams.push(s); return s; };
  }
};

async function launch(video, { fakeUi = true, deny = false } = {}) {
  const args = ['--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${video}`, '--autoplay-policy=no-user-gesture-required'];
  if (fakeUi) args.push('--use-fake-ui-for-media-stream');
  if (deny) args.push('--deny-permission-prompts');
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args });
  return browser;
}
async function newPage(browser, { grant = true, init } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA });
  if (grant) await ctx.grantPermissions(['camera'], { origin: 'http://localhost:4173' });
  await ctx.addInitScript(instrument);
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && page.errors.push(m.text()));
  page.on('dialog', (d) => d.accept());
  return page;
}
const announced = async (page) => { await page.waitForTimeout(250); return page.evaluate(() => window.__announced); };
const audit = async (page, name) => {
  await page.addScriptTag({ content: axe });
  const r = await page.evaluate(() => axe.run({ runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'] }));
  ok(r.violations.length === 0, `axe ${name}: ${JSON.stringify(r.violations.map((v) => [v.id, v.nodes.map((n) => n.target)]))}`);
};
const openScanner = async (page) => {
  await page.goto(URL);
  await page.waitForSelector('h1');
  await page.click('a:has-text("Dokument scannen")'); // Tippen gibt auch Audio frei
  await page.waitForSelector('h1:has-text("Dokument scannen")');
};

// ===== 1. Live-Kamera mit Szenenfolge =====
{
  console.log('--- Live-Kamera, Szenenfolge');
  const browser = await launch(`${process.cwd()}/video/sequence.y4m`);
  const page = await newPage(browser);
  const t0 = Date.now();
  await openScanner(page);
  await page.waitForSelector('.camera:not([hidden])', { timeout: 10000 });
  ok(await page.evaluate(() => { const v = document.querySelector('video'); return v.videoWidth === 360 && v.videoHeight === 480 && !v.paused; }), 'Kamerabild läuft (360×480)');
  ok(await page.getAttribute('[data-tab=start]', 'aria-current') === 'page', 'Tab Start aktiv im Scanner');
  ok(await page.textContent('button.button-hero') === 'Seite 1 aufnehmen', 'Auslöser „Seite 1 aufnehmen“');
  await audit(page, 'Scanner live');
  await page.screenshot({ path: 'scan-live.png' });
  await page.waitForFunction(() => document.querySelectorAll('.page-item').length >= 2, null, { timeout: 25000 });
  console.log('     2 Seiten nach', Math.round((Date.now() - t0) / 1000), 's');
  await page.screenshot({ path: 'scan-pages.png', fullPage: true });
  const a = await announced(page);
  console.log('     Ansagen:', JSON.stringify(a));
  ok(a.some((m) => m.startsWith('Kamera bereit')), 'Ansage „Kamera bereit“');
  ok(a.some((m) => m.includes('Kein Dokument zu sehen')), 'Ansage „Kein Dokument zu sehen“');
  ok(a.some((m) => m.includes('nach links')), 'Ansage „nach links“ bei links herausragendem Blatt');
  ok(a.some((m) => m.startsWith('Seite 1 aufgenommen')), 'Seite 1 automatisch aufgenommen');
  ok(a.some((m) => m.startsWith('Seite 2 aufgenommen')), 'Seite 2 automatisch aufgenommen');
  ok(a.some((m) => m.includes('Lege die nächste Seite hin')), 'Hinweis auf nächste Seite');
  ok(!a.some((m) => m.startsWith('Zu dunkel')), 'Dunkler Tisch ohne Blatt ist nicht „zu dunkel“');
  ok(a.filter((m) => m === 'Lege die nächste Seite hin.').length <= 1, '„Nächste Seite“ höchstens einmal');
  const tones = await page.evaluate(() => window.__tones);
  ok(tones.filter((f) => f === 990).length >= 4, `Takt-Töne gespielt (${tones.filter((f) => f === 990).length})`);
  ok(tones.filter((f) => f === 1320).length === 2, `Auslöse-Ton je Seite (${tones.filter((f) => f === 1320).length})`);
  ok(await page.textContent('button:has-text("Dokument speichern")') === 'Dokument speichern (2 Seiten)', 'Speichern-Knopf mit Seitenzahl');
  ok(await page.$eval('.page-item img', (i) => i.naturalWidth === 360 && i.alt === 'Foto von Seite 1'), 'Seite in Kameraauflösung mit Alternativtext');
  await page.waitForTimeout(3000);
  ok((await page.$$('.page-item')).length === 2, 'Keine doppelte Aufnahme bei leerem Tisch');

  // Neu aufnehmen
  const before = await page.$eval('.page-item:first-child img', (i) => i.src);
  await page.click('button:has-text("Seite 1 neu aufnehmen")');
  ok(await page.evaluate(() => document.activeElement?.textContent) === 'Seite 1 neu aufnehmen', 'Fokus springt auf Auslöser für Neuaufnahme');
  await page.waitForTimeout(300);
  ok((await announced(page)).some((m) => m.includes('Neuaufnahme von Seite 1. Richte die Kamera')), 'Neuaufnahme angesagt');
  await page.click('button.button-hero');
  await page.waitForTimeout(500);
  ok((await page.$$('.page-item')).length === 2, 'Neuaufnahme ersetzt Seite');
  ok(await page.$eval('.page-item:first-child img', (i) => i.src) !== before, 'Bild von Seite 1 ausgetauscht');
  ok((await announced(page)).some((m) => m.includes('Seite 1 neu aufgenommen.')), 'Ansage „Seite 1 neu aufgenommen“');
  ok(await page.textContent('button.button-hero') === 'Seite 3 aufnehmen', 'Auslöser zurück auf nächste Seite');

  // Entfernen
  await page.click('button:has-text("Seite 2 entfernen")');
  await page.waitForTimeout(300);
  ok((await page.$$('.page-item')).length === 1, 'Seite 2 entfernt');
  ok((await announced(page)).some((m) => m.includes('Seite 2 entfernt. Noch 1 Seite')), 'Entfernen angesagt');
  ok(await page.evaluate(() => document.activeElement?.id) === 'pages-heading', 'Fokus auf „Erfasste Seiten“');

  // Verlassen stoppt Kamera, Seiten bleiben
  await page.click('[data-tab=help]');
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => window.__streams.every((s) => s.getTracks().every((t) => t.readyState === 'ended'))), 'Kamera beim Verlassen beendet');
  await page.goto(URL + '#/scannen');
  await page.waitForSelector('.page-item');
  ok((await page.$$('.page-item')).length === 1, 'Seiten bleiben beim Tab-Wechsel erhalten');

  // Alternative: Mediathek (Mehrfachauswahl) über den echten Knopf
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('button:has-text("Fotos aus der Mediathek wählen")')]);
  ok(chooser.isMultiple(), 'Mediathek erlaubt Mehrfachauswahl');
  await chooser.setFiles(['page.jpg', 'page.jpg']);
  await page.waitForFunction(() => document.querySelectorAll('.page-item').length === 3);
  ok((await announced(page)).some((m) => m.includes('Seiten 2 bis 3 hinzugefügt.')), 'Fotos als Seiten 2 und 3 hinzugefügt');

  // Speichern
  await page.click('button:has-text("Dokument speichern")');
  await page.waitForURL(/#\/dokument\//);
  await page.waitForSelector('#photo-heading');
  ok(await page.textContent('#photo-heading') === 'Fotos (3 Seiten)', 'Dokument mit 3 Seiten gespeichert');
  ok((await page.$$eval('.doc-photo figcaption', (f) => f.map((x) => x.textContent))).join('|') === 'Seite 1 von 3|Seite 2 von 3|Seite 3 von 3', 'Bildunterschriften der Seiten');
  ok((await announced(page)).some((m) => m.includes('Dokument mit 3 Seiten gespeichert.')), 'Speichern angesagt');
  await audit(page, 'Dokument mit Seiten');
  await page.goto(URL + '#/scannen');
  await page.waitForSelector('#pages-heading');
  ok(await page.textContent('#pages-heading + p') === 'Noch keine Seite aufgenommen.', 'Scan nach Speichern geleert');
  await page.goto(URL + '#/bibliothek');
  await page.waitForSelector('.doc-meta');
  ok((await page.textContent('.doc-meta')).includes('3 Seiten'), 'Bibliothek zeigt Seitenzahl');
  ok(page.errors.length === 0, 'Keine Konsolenfehler: ' + JSON.stringify(page.errors));
  await browser.close();
}

// ===== 2. Zu dunkel =====
{
  console.log('--- Zu dunkel');
  const browser = await launch(`${process.cwd()}/video/dark.y4m`);
  const page = await newPage(browser);
  await openScanner(page);
  await page.waitForFunction(() => window.__announced.some((m) => m.startsWith('Zu dunkel')), null, { timeout: 8000 }).catch(() => {});
  ok((await announced(page)).some((m) => m.startsWith('Zu dunkel')), 'Ansage „Zu dunkel“');
  ok((await page.$$('.page-item')).length === 0, 'Keine Aufnahme im Dunkeln');
  await browser.close();
}

// ===== 3. Manuell auslösen =====
{
  console.log('--- Manuelles Auslösen');
  const browser = await launch(`${process.cwd()}/video/still.y4m`);
  const page = await newPage(browser);
  await openScanner(page);
  await page.waitForSelector('.camera:not([hidden])');
  await page.uncheck('#auto-capture-toggle');
  await page.waitForFunction(() => window.__announced.some((m) => m === 'Dokument erkannt. Jetzt aufnehmen.'), null, { timeout: 8000 }).catch(() => {});
  ok((await announced(page)).includes('Dokument erkannt. Jetzt aufnehmen.'), 'Ansage „Dokument erkannt. Jetzt aufnehmen.“');
  await page.waitForTimeout(3000);
  ok((await page.$$('.page-item')).length === 0, 'Ohne Auto-Auslösung keine Aufnahme');
  ok(await page.$eval('.camera-outline', (o) => !o.hidden && parseFloat(o.style.width) > 60), 'Rahmen um erkanntes Blatt');
  await page.click('button.button-hero');
  await page.waitForSelector('.page-item');
  ok((await announced(page)).some((m) => m.includes('Seite 1 aufgenommen. Nimm die nächste Seite auf')), 'Manuelle Aufnahme angesagt');
  await page.goto(URL + '#/einstellungen');
  await page.waitForSelector('#settings-auto-capture');
  ok(!(await page.isChecked('#settings-auto-capture')), 'Auto-Auslösung gespeichert');
  await browser.close();
}

// ===== 4. Zugriff verweigert =====
{
  console.log('--- Kamerazugriff verweigert');
  const browser = await launch(`${process.cwd()}/video/still.y4m`, { fakeUi: false, deny: true });
  const page = await newPage(browser, { grant: false });
  await openScanner(page);
  await page.waitForSelector('#camera-error-heading:not(:empty)', { timeout: 10000 });
  ok(await page.textContent('#camera-error-heading') === 'Kein Zugriff auf die Kamera', 'Fehler „Kein Zugriff“: ' + await page.textContent('#camera-error-heading'));
  ok((await page.textContent('.notice')).includes('Website-Einstellungen'), 'Erklärt, wie man den Zugriff erlaubt');
  ok((await announced(page)).some((m) => m.includes('Kein Zugriff auf die Kamera. VoxDoc darf')), 'Fehler angesagt');
  ok(await page.isHidden('button.button-hero') && await page.isHidden('.camera'), 'Kein Auslöser ohne Kamera');
  ok(await page.isVisible('button:has-text("Foto mit der Kamera-App aufnehmen")'), 'Alternative angeboten');
  await page.click('button:has-text("Kamera erneut versuchen")');
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => document.activeElement?.id) === 'camera-error-heading', 'Fokus auf Fehlermeldung nach erneutem Versuch');
  await audit(page, 'Scanner Fehler');
  await page.screenshot({ path: 'scan-denied.png', fullPage: true });
  // Kamera-App als Alternative über den echten Knopf
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('button:has-text("Foto mit der Kamera-App aufnehmen")')]);
  ok(!chooser.isMultiple() && await (await chooser.element()).getAttribute('capture') === 'environment', 'Kamera-App: Einzelbild mit Rückkamera');
  await chooser.setFiles('page.jpg');
  await page.waitForSelector('.page-item');
  ok((await announced(page)).some((m) => m.includes('Seite 1 hinzugefügt.')), 'Foto aus Kamera-App als Seite 1');
  ok(page.errors.filter((e) => !e.includes('Permission')).length === 0, 'Keine unerwarteten Fehler: ' + JSON.stringify(page.errors));
  await browser.close();
}

// ===== 4b. Erlaubnis-Abfrage bleibt offen =====
{
  console.log('--- Erlaubnis-Abfrage offen');
  const browser = await launch(`${process.cwd()}/video/still.y4m`, { fakeUi: false });
  const page = await newPage(browser, { grant: false });
  await openScanner(page);
  await page.waitForTimeout(2500);
  ok((await page.textContent('#scan-guidance')).startsWith('Bitte erlaube VoxDoc den Zugriff'), 'Hinweis, die Abfrage zu bestätigen');
  ok((await announced(page)).some((m) => m.includes('Bitte erlaube VoxDoc den Zugriff')), 'Hinweis angesagt');
  await browser.close();
}

// ===== 5. Kamera belegt / nicht unterstützt =====
{
  console.log('--- Kamera belegt, nicht unterstützt');
  const browser = await launch(`${process.cwd()}/video/still.y4m`);
  let page = await newPage(browser, { init: () => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('busy', 'NotReadableError')); } });
  await openScanner(page);
  await page.waitForSelector('#camera-error-heading:not(:empty)');
  ok(await page.textContent('#camera-error-heading') === 'Kamera ist belegt', 'Fehler „Kamera ist belegt“');
  ok(await page.isVisible('button:has-text("Kamera erneut versuchen")'), 'Erneut versuchen angeboten');
  page = await newPage(browser, { init: () => { Object.defineProperty(navigator, 'mediaDevices', { value: undefined }); } });
  await openScanner(page);
  await page.waitForSelector('#camera-error-heading:not(:empty)');
  ok(await page.textContent('#camera-error-heading') === 'Live-Kamera nicht verfügbar', 'Fehler „nicht verfügbar“');
  ok(await page.isHidden('button:has-text("Kamera erneut versuchen")'), 'Kein sinnloses „Erneut versuchen“');
  await browser.close();
}

// ===== 6. Start: Mediathek direkt als Dokument =====
{
  console.log('--- Mediathek von der Startseite');
  const browser = await launch(`${process.cwd()}/video/still.y4m`);
  const page = await newPage(browser);
  await page.goto(URL);
  await page.waitForSelector('h1');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('button:has-text("Fotos aus der Mediathek wählen")')]);
  await chooser.setFiles(['page.jpg', 'page.jpg']);
  await page.waitForURL(/#\/dokument\//);
  await page.waitForSelector('#photo-heading');
  ok(await page.textContent('#photo-heading') === 'Fotos (2 Seiten)', 'Zwei Fotos als ein Dokument');
  await browser.close();
}
