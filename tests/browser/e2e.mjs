import { chromium } from 'playwright-core';
import fs from 'node:fs';
const axe = fs.readFileSync(process.env.AXE_PATH, 'utf8');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => m.type()==='error' && errors.push(m.text()));
page.on('dialog', d => d.accept());
const ok = (cond, msg) => { console.log(cond ? 'OK  ' : 'FAIL', msg); if (!cond) process.exitCode = 1; };
const announced = async () => { await page.waitForTimeout(250); return page.textContent('#announcer'); };
const audit = async (name) => {
  await page.addScriptTag({ content: axe });
  const r = await page.evaluate(() => axe.run({ runOnly: ['wcag2a','wcag2aa','wcag21aa','wcag22aa','best-practice'] }));
  ok(r.violations.length === 0, `axe ${name}: ${JSON.stringify(r.violations.map(v => [v.id, v.nodes.map(n=>n.target)]))}`);
};
const shot = (n) => page.screenshot({ path: `${n}.png`, fullPage: true });

await page.goto('http://localhost:4173/');
await page.waitForSelector('h1');
ok(await page.textContent('h1') === 'VoxDoc', 'Startseite h1');
ok(await page.getAttribute('[data-tab=start]', 'aria-current') === 'page', 'Tab Start aktiv');
ok(await page.isVisible('text=Als App installieren'), 'Installationshinweis auf iOS');
await audit('start-leer'); await shot('01-start-leer');

// Scan
await (async () => { const [c] = await Promise.all([page.waitForEvent('filechooser'), page.click('button:has-text("Fotos aus der Mediathek wählen")')]); await c.setFiles('page.jpg'); })();
await page.waitForURL(/#\/dokument\//);
await page.waitForSelector('text=Gescannt am');
ok((await announced()).includes('Dokument mit 1 Seite gespeichert'), 'Scan angesagt: ' + await page.textContent('#announcer'));
ok(await page.evaluate(() => document.activeElement?.tagName) === 'H1', 'Fokus auf h1 nach Navigation');
ok(await page.getAttribute('[data-tab=library]', 'aria-current') === 'page', 'Tab Bibliothek aktiv im Dokument');
const dims = await page.evaluate(() => { const i = document.querySelector('.doc-photo img'); return [i.naturalWidth, i.naturalHeight]; });
ok(Math.max(...dims) === 2400, 'Bild verkleinert: ' + dims);
await audit('dokument'); 

// Umbenennen
await page.click('button:has-text("Umbenennen")');
ok(await page.evaluate(() => document.activeElement?.id) === 'edit-field', 'Fokus im Umbenennen-Feld');
await page.fill('#edit-field', 'Stromrechnung Oktober');
await page.click('button[type=submit]');
await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Stromrechnung Oktober');
ok(await page.title() === 'Stromrechnung Oktober – VoxDoc', 'Umbenannt inkl. Seitentitel');
ok((await announced()).includes('Umbenannt'), 'Umbenennen angesagt');
ok(await page.evaluate(() => document.activeElement?.textContent) === 'Umbenennen', 'Fokus zurück auf Umbenennen');

// Text
await page.click('button:has-text("Text bearbeiten")');
await page.fill('#edit-field', 'Bitte überweisen Sie 84,20 Euro.\nVielen Dank.');
await page.click('button[type=submit]');
await page.waitForSelector('.doc-text p:nth-child(2)');
ok((await page.$$eval('.doc-text p', ps => ps.length)) === 2, 'Text als Absätze');
await audit('dokument-mit-text'); await shot('02-dokument');

// Zweites Dokument über Fotos
await page.click('[data-tab=start]'); await page.waitForSelector('h1:has-text("VoxDoc")');
await (async () => { const [c] = await Promise.all([page.waitForEvent('filechooser'), page.click('button:has-text("Fotos aus der Mediathek wählen")')]); await c.setFiles('page.jpg'); })();
await page.waitForFunction(() => document.querySelector('h1')?.textContent?.startsWith('Dokument vom'));

// Bibliothek
await page.click('[data-tab=library]');
await page.waitForSelector('.doc-list');
ok((await page.$$('.doc-list li')).length === 2, 'Bibliothek zeigt 2 Dokumente');
ok(await page.title() === 'Bibliothek – VoxDoc', 'Seitentitel Bibliothek');
await page.selectOption('#library-sort', 'title');
ok((await page.textContent('.doc-list li:first-child .doc-title')).startsWith('Dokument vom'), 'Sortiert nach Name');
ok((await announced()).includes('Name'), 'Sortierung angesagt');
await audit('bibliothek'); await shot('03-bibliothek');

// Suche
await page.click('[data-tab=search]');
await page.fill('#search-input', 'euro');
await page.waitForTimeout(900);
ok((await page.$$('.doc-list li')).length === 1, 'Suche findet 1 Treffer');
ok((await page.textContent('#announcer')).includes('1 Treffer'), 'Treffer angesagt');
ok((await page.textContent('.doc-snippet')).includes('84,20'), 'Ausschnitt angezeigt');
await audit('suche'); await shot('04-suche');
await page.click('[data-tab=help]'); await page.click('[data-tab=search]');
ok(await page.inputValue('#search-input') === 'euro', 'Suchbegriff bleibt erhalten');

// Einstellungen
await page.click('[data-tab=settings]');
await page.waitForSelector('#tones-toggle');
await audit('einstellungen'); await shot('05-einstellungen');
await page.click('label:has-text("Hell")');
ok(await page.getAttribute('html', 'data-theme') === 'light', 'Helles Farbschema');
await shot('06-einstellungen-hell');
await page.click('label:has-text("Dunkel")');
await page.uncheck('#tones-toggle');
ok((await announced()).includes('Signaltöne aus'), 'Signaltöne-Schalter angesagt');
await page.reload(); await page.waitForSelector('#tones-toggle');
ok(!(await page.isChecked('#tones-toggle')), 'Einstellung bleibt nach Neuladen');
ok((await page.textContent('#storage-heading + * + p')).includes('2 Dokumente'), 'Speicheranzeige');
ok(await page.textContent('[data-connection-state]') === 'Online', 'Verbindungsstatus');

// Hilfe
await page.click('[data-tab=help]');
await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Hilfe');
ok((await page.$$('h2')).length >= 6, 'Hilfe-Abschnitte');
await audit('hilfe'); await shot('07-hilfe');

// Offline
await ctx.setOffline(true);
await page.waitForTimeout(300);
ok(await page.isVisible('#offline-banner'), 'Offline-Hinweis sichtbar');
ok((await page.textContent('#announcer')).includes('Keine Internetverbindung'), 'Offline angesagt');
await page.reload(); await page.waitForSelector('h1');
ok(await page.textContent('h1') === 'Hilfe', 'App lädt offline (Service Worker)');
await ctx.setOffline(false);

// Löschen
await page.click('[data-tab=library]');
await page.click('.doc-list li:first-child a');
await page.waitForSelector('text=Dokument löschen');
await page.click('button:has-text("Dokument löschen")');
await page.waitForURL(/#\/bibliothek$/);
await page.waitForSelector('.doc-list');
ok((await page.$$('.doc-list li')).length === 1, 'Dokument gelöscht');

// Unbekannte Seite und Start mit Dokumenten
await page.goto('http://localhost:4173/#/gibtsnicht');
await page.waitForSelector('text=Nicht gefunden');
await audit('nicht-gefunden');
await page.click('[data-tab=start]');
await page.waitForSelector('.doc-list');
await shot('08-start');

ok(errors.length === 0, 'Keine Konsolenfehler: ' + JSON.stringify(errors));
await browser.close();
