import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const SP = process.cwd(); // Arbeitsordner mit Testdaten und Ausgaben
const axe = fs.readFileSync(process.env.AXE_PATH, 'utf8');
const URL = 'http://localhost:4173/';
const ok = (cond, msg) => { console.log(cond ? 'OK  ' : 'FAIL', msg); if (!cond) process.exitCode = 1; };
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const run = (cmd, args) => { try { return execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString(); } catch (e) { return (e.stdout?.toString() ?? '') + (e.stderr?.toString() ?? ''); } };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA, acceptDownloads: true });
await ctx.addInitScript(() => {
  window.__announced = [];
  new MutationObserver(() => { const el = document.getElementById('announcer'); if (el && el.textContent && el.textContent !== window.__last) window.__announced.push(el.textContent); window.__last = el?.textContent; }).observe(document, { subtree: true, childList: true, characterData: true });
});
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const said = async (t) => { await page.waitForTimeout(250); return (await page.evaluate(() => window.__announced)).some((m) => m.includes(t)); };
const audit = async (p, name) => {
  await p.addScriptTag({ content: axe });
  const r = await p.evaluate(() => axe.run({ runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'] }));
  ok(r.violations.length === 0, `axe ${name}: ${JSON.stringify(r.violations.map((v) => [v.id, v.nodes.map((n) => n.target)]))}`);
};

// Dokument mit zwei Seiten und OCR
await page.goto(URL); await page.waitForSelector('h1');
const [c] = await Promise.all([page.waitForEvent('filechooser'), page.click('button:has-text("Fotos aus der Mediathek wählen")')]);
await c.setFiles(['brief.jpg', 'seite2.jpg']);
await page.waitForURL(/#\/dokument\//);
await page.waitForFunction(() => document.querySelector('#ocr-status')?.textContent.startsWith('Erkannt am'), null, { timeout: 120000 });
await page.click('button:has-text("Umbenennen")');
await page.fill('#edit-field', 'Stromrechnung Oktober');
await page.click('button[type=submit]');
await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Stromrechnung Oktober');

console.log('--- Formatauswahl');
ok(await page.isVisible('#export-heading'), 'Bereich „Exportieren“ mit Überschrift');
const legend = await page.textContent('#export-heading ~ fieldset legend');
ok(legend === 'Format', 'Optionsgruppe mit Legende „Format“');
ok(await page.isChecked('input[name=export-format][value=pdf]'), 'PDF vorausgewählt');
const radioNames = await page.$$eval('input[name=export-format]', (inputs) => inputs.map((i) => i.closest('label').textContent));
ok(JSON.stringify(radioNames) === JSON.stringify(['PDF', 'HTML-Webseite', 'Text (TXT)']), 'Namen kurz und eindeutig: ' + radioNames.join(' | '));
const described = await page.$eval('input[value=pdf]', (i) => document.getElementById(i.getAttribute('aria-describedby')).textContent);
ok(described.startsWith('Getaggtes PDF'), 'Beschreibung per aria-describedby: ' + described);
// Tastatur (wie Schaltersteuerung/Bluetooth-Tastatur): Pfeiltasten wechseln das Format
await page.focus('input[name=export-format][value=pdf]');
await page.keyboard.press('ArrowDown');
ok(await page.isChecked('input[name=export-format][value=html]'), 'Pfeiltaste wählt HTML');
await page.keyboard.press('ArrowDown');
ok(await page.isChecked('input[name=export-format][value=txt]'), 'Pfeiltaste wählt TXT');
ok(await page.isHidden('#export-photos'), 'TXT: Schalter „Fotos einschließen“ ausgeblendet');
await audit(page, 'Dokument mit Export');

// ===== TXT =====
console.log('--- TXT');
const [txtDl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Exportieren")')]);
await txtDl.saveAs('export.txt');
ok(txtDl.suggestedFilename() === 'Stromrechnung Oktober.txt', 'Dateiname ' + txtDl.suggestedFilename());
ok(await said('Textdatei heruntergeladen als „Stromrechnung Oktober.txt“'), 'Export angesagt');
const txt = fs.readFileSync('export.txt', 'utf8');
ok(txt.startsWith('﻿Stromrechnung Oktober\n=====') && /\nSeite 1\n-------\n\nStadtwerke Müllheim\n\nSehr geehrte Frau Schäfer,/.test(txt) && /\nSeite 2\n-------\n\nSeite zwei: Öffnungszeiten/.test(txt), 'TXT: Überschriften, Absätze, Reihenfolge');
ok(txt.includes('Größere Änderungen') && txt.includes('Straße'), 'TXT: Umlaute erhalten');

// ===== HTML =====
console.log('--- HTML');
await page.check('input[name=export-format][value=html]');
ok(await page.isVisible('#export-photos') && await page.isChecked('#export-photos'), 'HTML: Fotos einschließen angeboten und an');
const [htmlDl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Exportieren")')]);
await htmlDl.saveAs('export.html');
ok(await said('HTML-Datei mit 2 Fotos heruntergeladen'), 'HTML-Export angesagt');
const vnu = run('java', ['-jar', process.env.VNU_JAR, '--stdout', '--format', 'json', '--also-check-css', 'export.html']);
const messages = JSON.parse(vnu.slice(vnu.indexOf('{'))).messages;
ok(messages.filter((m) => m.type === 'error').length === 0, 'W3C Nu Html Checker: keine Fehler ' + JSON.stringify(messages.slice(0, 3)));
ok(messages.length === 0, 'W3C Nu Html Checker: auch keine Warnungen ' + JSON.stringify(messages.map((m) => m.message).slice(0, 3)));
const htmlPage = await ctx.newPage();
await htmlPage.goto('file://' + SP + '/export.html');
await audit(htmlPage, 'exportierte HTML-Datei (hell)');
await htmlPage.emulateMedia({ colorScheme: 'dark' });
await audit(htmlPage, 'exportierte HTML-Datei (dunkel)');
const outline = await htmlPage.$$eval('h1, h2', (hs) => hs.map((h) => `${h.tagName}:${h.textContent}`));
ok(JSON.stringify(outline) === JSON.stringify(['H1:Stromrechnung Oktober', 'H2:Seite 1', 'H2:Seite 2', 'H2:Fotos der Seiten']), 'HTML-Gliederung: ' + outline.join(', '));
ok(await htmlPage.$$eval('img', (imgs) => imgs.every((i) => i.alt.startsWith('Foto von Seite') && i.naturalWidth > 0)), 'HTML: Fotos sichtbar, mit Alternativtext');
await htmlPage.close();

// ===== PDF (Tippen) =====
console.log('--- PDF');
await page.check('input[name=export-format][value=pdf]');
const [pdfDl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Exportieren")')]);
await pdfDl.saveAs('export.pdf');
ok(await said('PDF mit'), 'PDF-Export angesagt');
const info = run('pdfinfo', ['export.pdf']);
ok(/Tagged:\s+yes/.test(info) && /Title:\s+Stromrechnung Oktober/.test(info), 'pdfinfo: getaggt, Titel');
const fonts = run('pdffonts', ['export.pdf']);
ok(/LiberationSans\s+TrueType\s+WinAnsi\s+yes\s+no\s+yes/.test(fonts), 'pdffonts: eingebettet, mit ToUnicode');
const ptext = run('pdftotext', ['-enc', 'UTF-8', 'export.pdf', '-']);
const order = ['Stromrechnung Oktober', 'Gescannt am', 'Seite 1', 'Stadtwerke Müllheim', 'Mit freundlichen Grüßen', 'Seite 2', 'Seite zwei: Öffnungszeiten', 'Fotos der Seiten', 'Foto von Seite 1 von 2'];
ok(order.every((part, i) => ptext.indexOf(part) > (i === 0 ? -1 : ptext.indexOf(order[i - 1]))), 'pdftotext: Text auswählbar, Lesereihenfolge stimmt');
const struct = run('python3', ['-I', `${process.env.SCRIPTS}/pdf_structure.py`, 'export.pdf']);
ok(/^H1 P P H2 P( P)+ H2 P( P)* H2 P Figure:ALT P Figure:ALT\n/.test(struct), 'Strukturbaum: ' + struct.split('\n')[0]);
ok(struct.includes('LANG de-DE MARKED True OUTLINES 4'), 'Sprache, Markierung, 4 Lesezeichen: ' + struct.split('\n')[1]);
const vera = run(process.env.VERAPDF, ['--flavour', 'ua1', '--format', 'mrr', 'export.pdf']);
const failed = [...vera.matchAll(/<rule [^>]*clause="([^"]+)"[^>]*testNumber="(\d+)"[^>]*status="failed"/g)].map((m) => `${m[1]}-${m[2]}`);
const details = /<details passedRules="(\d+)" failedRules="(\d+)" passedChecks="(\d+)" failedChecks="(\d+)"/.exec(vera);
console.log(`     veraPDF PDF/UA-1: ${details[1]} Regeln bestanden, ${details[2]} nicht (${details[3]} Prüfungen bestanden, ${details[4]} nicht)`);
ok(JSON.stringify(failed) === '["5-1"]', 'veraPDF: nur die bewusst fehlende PDF/UA-Kennung: ' + failed.join(','));

// ===== Sprachbefehl: Tippen nötig =====
console.log('--- Export per Befehl');
await page.click('#voice-button');
await page.fill('#voice-input', 'Als Text exportieren');
// Erst nach Ablauf der Benutzeraktion ausführen – wie nach einem Sprachbefehl.
await page.evaluate(() => { setTimeout(() => document.querySelector('#voice-dialog form').requestSubmit(), 6000); });
await page.waitForTimeout(6500);
await page.waitForSelector('button:has-text("Datei speichern"):visible', { timeout: 10000 });
ok(await page.isChecked('input[name=export-format][value=txt]'), 'Befehl wählt TXT');
ok(await said('Textdatei ist fertig. Tippe auf „Datei speichern“'), 'Ehrlich: Tippen nötig');
ok(await page.evaluate(() => document.activeElement?.textContent) === 'Datei speichern', 'Fokus auf „Datei speichern“');
const [voiceDl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Datei speichern")')]);
ok(voiceDl.suggestedFilename().endsWith('.txt'), 'Nach Tippen gespeichert');
ok(errors.length === 0, 'Keine Konsolenfehler: ' + JSON.stringify(errors));

// ===== Offline =====
console.log('--- Offline');
await page.evaluate(() => navigator.serviceWorker.ready);
await ctx.setOffline(true);
await page.reload(); await page.waitForSelector('#export-heading');
await page.check('input[name=export-format][value=pdf]');
const [offDl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('button:has-text("Exportieren")')]);
await offDl.saveAs('offline.pdf');
ok(/Tagged:\s+yes/.test(run('pdfinfo', ['offline.pdf'])), 'PDF-Export offline (Schrift aus dem Cache)');
await ctx.setOffline(false);
await browser.close();
