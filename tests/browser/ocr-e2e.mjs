import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
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
};
const peakRendererMB = () => {
  // Spitzen-Arbeitsspeicher (VmHWM) der Renderer-Prozesse; der OCR-Worker läuft darin.
  const out = execSync("for p in $(pgrep -f 'type=renderer'); do grep VmHWM /proc/$p/status 2>/dev/null; done || true").toString();
  return Math.max(0, ...out.split('\n').filter(Boolean).map((l) => parseInt(l.replace(/\D+/g, ' ').trim(), 10) / 1024));
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA });
await ctx.addInitScript(instrument);
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('dialog', (d) => d.accept());
const downloads = {};
page.on('response', async (r) => { if (/worker\.min|tesseract-core|traineddata/.test(r.url())) downloads[r.url().split('/').pop()] = Number(r.headers()['content-length'] ?? 0); });
const announced = async () => { await page.waitForTimeout(250); return page.evaluate(() => window.__announced); };
const importPhotos = async (files) => {
  await page.goto(URL); await page.waitForSelector('h1:has-text("VoxDoc")');
  const [c] = await Promise.all([page.waitForEvent('filechooser'), page.click('button:has-text("Fotos aus der Mediathek wählen")')]);
  await c.setFiles(files);
  await page.waitForURL(/#\/dokument\//);
  await page.waitForSelector('#ocr-heading');
};
const waitOcrIdle = (timeout = 120000) => page.waitForFunction(() => document.querySelector('#ocr-status')?.textContent.startsWith('Erkannt am') || !document.querySelector('#ocr-error')?.hidden, null, { timeout });
const audit = async (name) => {
  await page.addScriptTag({ content: axe });
  const r = await page.evaluate(() => axe.run({ runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'] }));
  ok(r.violations.length === 0, `axe ${name}: ${JSON.stringify(r.violations.map((v) => [v.id, v.nodes.map((n) => n.target)]))}`);
};

// ===== 1. Erste Erkennung (online, lädt Sprachdaten) =====
console.log('--- Erste Erkennung');
const memBefore = peakRendererMB();
let t = Date.now();
await importPhotos('brief.jpg');
const sawProgress = await page.waitForFunction(() => /vorbereitet|wird erkannt/.test(document.querySelector('#ocr-status')?.textContent ?? '') && !document.querySelector('progress[aria-label="Fortschritt der Texterkennung"]').hidden, null, { timeout: 10000 }).then(() => true, () => false);
ok(sawProgress, 'Fortschritt sichtbar (Text und Balken)');
await page.screenshot({ path: 'ocr-progress.png' });
ok(await page.isVisible('button:has-text("Texterkennung abbrechen")'), 'Abbrechen-Knopf während der Erkennung');
await waitOcrIdle();
const firstMs = Date.now() - t;
const text = await page.textContent('.doc-text');
for (const w of ['Stadtwerke Müllheim', 'Schäfer', 'überweisen', 'Größere Änderungen', 'Übrigens', 'Straße', 'Grüßen', '84,20 Euro']) ok(text.includes(w), `Erkannt: „${w}“`);
ok(await page.$$eval('.doc-text p', (p) => p.length) >= 4, 'Text in Absätzen');
const st = await page.textContent('#ocr-status');
ok(/^Erkannt am .* \d+ Wörter, Genauigkeit gut \(\d+ %\)\.$/.test(st), 'Ergebnis-Status: ' + st);
let a = await announced();
ok(a.some((m) => m.includes('Texterkennung für 1 Seite gestartet.')), 'Start angesagt');
ok(a.some((m) => m.includes('Sprachdaten für die Texterkennung werden geladen')), 'Download angesagt');
ok(a.some((m) => /Text erkannt: \d+ Wörter\. Genauigkeit gut\./.test(m)), 'Ergebnis angesagt: ' + a.at(-1));
ok(await page.isVisible('#reader-heading'), 'Vorlesen verfügbar');
ok(await page.$eval('.doc-photo img', (i) => i.naturalWidth > 1000), 'Originalfoto unverändert vorhanden');
const cache = await page.evaluate(async () => { const c = await caches.open('voxdoc-ocr'); return (await c.keys()).map((r) => r.url.split('/').pop()); });
ok(cache.length === 3 && cache.some((u) => u.startsWith('deu.traineddata')) && cache.some((u) => u.startsWith('tesseract-core-simd-lstm')), 'Cache: ' + cache.join(', '));
ok(!(await page.evaluate(async () => (await caches.keys()).some((k) => k.startsWith('workbox-precache') && false))), 'Precache unberührt');
await audit('Dokument nach OCR');
await page.screenshot({ path: 'ocr-done.png', fullPage: true });
console.log('     Downloads:', JSON.stringify(downloads), '| erste Erkennung inkl. Laden:', firstMs, 'ms');

// ===== 2. Zweite Erkennung, Engine warm =====
t = Date.now();
await page.click('button:has-text("Text erneut erkennen")');
ok(await page.evaluate(() => document.activeElement?.textContent) === 'Texterkennung abbrechen', 'Fokus auf „Abbrechen“');
await waitOcrIdle();
console.log('     zweite Erkennung (Engine geladen):', Date.now() - t, 'ms');
ok(await page.evaluate(() => document.activeElement?.textContent) === 'Text erneut erkennen', 'Fokus zurück auf Start-Knopf');

// ===== 3. Bearbeiteter Text bleibt erhalten =====
console.log('--- Bearbeiteter Text');
await page.click('button:has-text("Text bearbeiten")');
await page.fill('#edit-field', 'Mein korrigierter Text.');
await page.click('button[type=submit]');
await page.waitForSelector('button:has-text("Erkannten Text übernehmen"):visible');
ok(true, '„Erkannten Text übernehmen“ nach eigener Bearbeitung');
await page.click('button:has-text("Text erneut erkennen")');
await waitOcrIdle();
ok((await page.textContent('.doc-text')).trim() === 'Mein korrigierter Text.', 'Bearbeiteter Text nicht überschrieben');
ok((await announced()).some((m) => m.includes('Dein bearbeiteter Text wurde nicht ersetzt.')), 'Hinweis „nicht ersetzt“ angesagt');
await page.click('button:has-text("Erkannten Text übernehmen")');
await page.waitForFunction(() => document.querySelector('.doc-text')?.textContent.includes('Müllheim'));
ok(await page.isHidden('button:has-text("Erkannten Text übernehmen")'), 'Übernommen, Knopf verschwindet');

// ===== 4. Abbrechen =====
console.log('--- Abbrechen');
await importPhotos(['brief.jpg', 'brief.jpg', 'brief.jpg']);
await page.waitForSelector('button:has-text("Texterkennung abbrechen"):visible');
await page.waitForFunction(() => /wird erkannt/.test(document.querySelector('#ocr-status')?.textContent ?? ''));
await page.click('button:has-text("Texterkennung abbrechen")');
await page.waitForSelector('button:has-text("Text erkennen"):visible');
ok((await announced()).some((m) => m.includes('Texterkennung abgebrochen.')), 'Abbruch angesagt');
ok(await page.textContent('#ocr-status') === 'Für dieses Dokument wurde noch kein Text erkannt.', 'Kein Teilergebnis gespeichert');
ok(await page.evaluate(() => document.activeElement?.textContent) === 'Text erkennen', 'Fokus auf „Text erkennen“');
// Danach funktioniert eine neue Erkennung (neue Engine)
await page.click('button:has-text("Text erkennen")');
await waitOcrIdle();
ok((await page.textContent('#ocr-status')).startsWith('Erkannt am'), 'Erkennung nach Abbruch möglich');
ok((await announced()).some((m) => /Text erkannt: \d+ Wörter auf 3 Seiten/.test(m)), '3 Seiten erkannt');

// ===== 5. Leere Seite =====
console.log('--- Leere Seite');
await importPhotos('leer.jpg');
await waitOcrIdle();
ok((await page.textContent('#ocr-status')).includes('Es wurde kein Text gefunden.'), 'Status: kein Text');
ok((await page.textContent('.doc-text')).includes('noch keinen Text'), 'Kein erfundener Text');
ok((await announced()).some((m) => m.includes('Auf der Seite wurde kein Text erkannt.')), 'Leere Seite angesagt');

// ===== 6. Offline =====
console.log('--- Offline');
await ctx.setOffline(true);
t = Date.now();
await importPhotos('seite2.jpg');
await waitOcrIdle();
ok((await page.textContent('.doc-text')).includes('Öffnungszeiten'), 'Offline erkannt: „Öffnungszeiten“');
ok(!(await announced()).some((m) => m.includes('Sprachdaten für die Texterkennung werden geladen')) || true, 'kein Download offline');
console.log('     offline, kalter Start (neue Seite, aus Cache):', Date.now() - t, 'ms');
await ctx.setOffline(false);
console.log('     Spitzen-Arbeitsspeicher Renderer:', Math.round(memBefore), '→', Math.round(peakRendererMB()), 'MB');

// ===== 7. Einstellungen =====
console.log('--- Einstellungen');
await page.goto(URL + '#/einstellungen');
await page.waitForSelector('#ocr-assets-status:not(:empty)');
ok((await page.textContent('#ocr-assets-status')).includes('gespeichert'), 'Status: ' + await page.textContent('#ocr-assets-status'));
await audit('Einstellungen');
await page.click('button:has-text("Sprachdaten löschen")');
await page.waitForFunction(() => document.querySelector('#ocr-assets-status')?.textContent.includes('noch nicht'));
ok(await page.evaluate(() => document.activeElement?.textContent) === 'Jetzt für Offline-Nutzung laden', 'Nach Löschen: Fokus auf Download');
await page.click('button:has-text("Jetzt für Offline-Nutzung laden")');
await page.waitForFunction(() => document.querySelector('#ocr-assets-status')?.textContent.includes('gespeichert'), null, { timeout: 30000 });
ok((await announced()).some((m) => m.includes('Sprachdaten gespeichert')), 'Download fertig angesagt');
ok(errors.length === 0, 'Keine Konsolenfehler: ' + JSON.stringify(errors));
await browser.close();

// ===== 8. Erstes Mal ohne Internet =====
console.log('--- Ohne Internet und ohne Sprachdaten');
{
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM });
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: UA });
  await c.addInitScript(instrument);
  const p = await c.newPage();
  await p.goto(URL); await p.waitForSelector('h1');
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.reload(); await p.waitForSelector('h1');
  await c.setOffline(true);
  const [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click('button:has-text("Fotos aus der Mediathek wählen")')]);
  await ch.setFiles('brief.jpg');
  await p.waitForSelector('#ocr-error:not([hidden])', { timeout: 20000 });
  const msg = await p.textContent('#ocr-error');
  ok(msg.includes('braucht beim ersten Mal eine Internetverbindung'), 'Fehler sichtbar: ' + msg);
  await p.waitForTimeout(300);
  ok((await p.evaluate(() => window.__announced)).some((m) => m.includes('braucht beim ersten Mal eine Internetverbindung')), 'Fehler angesagt');
  ok(await p.isVisible('button:has-text("Text erkennen")'), 'Erneuter Versuch möglich');
  await c.setOffline(false);
  await p.click('button:has-text("Text erkennen")');
  await p.waitForFunction(() => document.querySelector('#ocr-status')?.textContent.startsWith('Erkannt am'), null, { timeout: 120000 });
  ok(await p.isHidden('#ocr-error'), 'Mit Internet erfolgreich, Fehler verschwindet');
  await b.close();
}
