import { chromium } from 'playwright-core';
import fs from 'node:fs';
const axe = fs.readFileSync(process.env.AXE_PATH, 'utf8');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
await ctx.addInitScript(() => {
  window.__spoken = []; window.__wordMs = 400;
  class U extends EventTarget { constructor(t) { super(); this.text = t; this.rate = 1; this.lang = ''; this.voice = null; this.volume = 1; } }
  const synth = {
    speaking: false, paused: false, pending: false, queue: [], cancels: 0,
    speak(u) { if (u.text) window.__spoken.push({ text: u.text, rate: u.rate, lang: u.lang, voice: u.voice?.voiceURI ?? null }); this.queue.push(u); if (this.queue.length === 1) this._begin(); },
    _begin() {
      const u = this.queue[0]; if (!u) { this.speaking = false; return; }
      this.speaking = true;
      setTimeout(() => {
        if (this.queue[0] !== u) return;
        u.dispatchEvent(new Event('start'));
        const words = [...u.text.matchAll(/\S+/g)]; let i = 0;
        const step = () => {
          if (this.queue[0] !== u) return;
          if (i < words.length) { u.dispatchEvent(Object.assign(new Event('boundary'), { charIndex: words[i].index, name: 'word' })); i++; setTimeout(step, window.__wordMs); }
          else { this.queue.shift(); u.dispatchEvent(new Event('end')); this._begin(); }
        };
        step();
      }, 20);
    },
    cancel() { this.cancels++; const q = this.queue; this.queue = []; this.speaking = false; q.forEach((u) => u.dispatchEvent(new Event('end'))); },
    pause() {}, resume() { this.paused = false; },
    getVoices() { return [{ name: 'Anna', lang: 'de-DE', voiceURI: 'anna', default: true, localService: true }]; },
    addEventListener() {}, removeEventListener() {},
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = U;
});
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const ok = (cond, msg) => { console.log(cond ? 'OK  ' : 'FAIL', msg); if (!cond) process.exitCode = 1; };
const toggle = '#reader-heading ~ .reader-controls > button.button-hero';
const label = () => page.textContent(toggle);
const spoken = () => page.evaluate(() => window.__spoken.map((s) => s.text));
const lastSpoken = async () => (await spoken()).at(-1);
const current = () => page.evaluate(() => [...document.querySelectorAll('.doc-text p')].findIndex((p) => p.classList.contains('is-reading')));
const live = () => page.textContent('#announcer');

await page.goto('http://localhost:4173/');
await page.waitForSelector('h1');
await (async () => { const [c] = await Promise.all([page.waitForEvent('filechooser'), page.click('button:has-text("Fotos aus der Mediathek wählen")')]); await c.setFiles('page.jpg'); })();
await page.waitForURL(/#\/dokument\//);
await page.waitForSelector('text=Gescannt am');
ok(!(await page.isVisible('#reader-heading')), 'Ohne Text kein Vorlese-Bereich');
await page.click('button:has-text("Text bearbeiten")');
await page.fill('#edit-field', 'Erster Absatz mit einigen Wörtern zum Testen.\n\nZweiter Absatz ist hier.\nDritter und letzter Absatz.');
await page.click('button[type=submit]');
await page.waitForSelector('#reader-heading');
ok(await label() === 'Vorlesen', 'Knopf „Vorlesen“');
ok(await page.textContent('#reader-status') === 'Bereit. 3 Absätze.', 'Status bereit');
ok(await page.isHidden('button:has-text("Vorlesen beenden")'), '„Vorlesen beenden“ im Ruhezustand verborgen');
const names = await page.$$eval('#reader-heading ~ .reader-controls button', (bs) => bs.filter((b) => !b.hidden).map((b) => b.textContent.trim()));
ok(JSON.stringify(names) === JSON.stringify(['Vorlesen', 'Vorheriger Absatz', 'Absatz wiederholen', 'Nächster Absatz', 'Langsamer', 'Schneller']), 'Knopfbeschriftungen: ' + names);
await page.addScriptTag({ content: axe });
let r = await page.evaluate(() => axe.run({ runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'] }));
ok(r.violations.length === 0, 'axe Vorlesen: ' + JSON.stringify(r.violations.map((v) => v.id)));

const width = () => page.evaluate(() => document.documentElement.scrollWidth);
ok(await width() === 390, 'Keine horizontale Überbreite');
await page.evaluate(() => { document.documentElement.style.fontSize = '28px'; });
ok(await width() === 390, 'Keine Überbreite bei großer Schrift (28 px)');
const stacked = await page.evaluate(() => getComputedStyle(document.querySelector('.reader-row')).gridTemplateColumns.split(' ').length);
ok(stacked === 1, 'Knöpfe bei großer Schrift untereinander');
await page.evaluate(() => document.querySelector('#reader-heading').scrollIntoView());
await page.screenshot({ path: 'reader-large.png' });
await page.evaluate(() => { document.documentElement.style.fontSize = ''; });

// Vorlesen
await page.evaluate(() => { document.getElementById('announcer').textContent = ''; });
await page.click(toggle);
await page.waitForTimeout(400);
ok(await label() === 'Pause', 'Knopf wird zu „Pause“');
ok(await lastSpoken() === 'Erster Absatz mit einigen Wörtern zum Testen.', 'Liest Absatz 1 ohne Titel/Ansage');
ok(await current() === 0, 'Absatz 1 hervorgehoben');
ok(await page.textContent('#reader-status') === 'Liest Absatz 1 von 3.', 'Status „Liest“');
ok((await page.$$eval('[data-tab]', (a) => a.length)) === 5, 'Tab-Leiste vorhanden');

// Pause / Fortsetzen
await page.waitForTimeout(900);
await page.click(toggle);
await page.waitForTimeout(250);
ok(await label() === 'Fortsetzen', 'Knopf wird zu „Fortsetzen“');
ok((await live()).startsWith('Pausiert bei Absatz 1 von 3'), 'Pause angesagt: ' + await live());
ok(await page.evaluate(() => speechSynthesis.speaking) === false, 'Sprachausgabe gestoppt');
const before = (await spoken()).length;
await page.click(toggle);
await page.waitForTimeout(300);
const resumed = await lastSpoken();
ok((await spoken()).length === before + 1 && resumed !== 'Erster Absatz mit einigen Wörtern zum Testen.' && 'Erster Absatz mit einigen Wörtern zum Testen.'.endsWith(resumed), 'Fortsetzen an der Wortposition: „' + resumed + '“');

// Navigation
await page.evaluate(() => { document.getElementById('announcer').textContent = ''; });
await page.click('button:has-text("Nächster Absatz")');
await page.waitForTimeout(300);
ok(await lastSpoken() === 'Absatz 2 von 3. Zweiter Absatz ist hier.', 'Nächster Absatz mit Ansage');
ok(await current() === 1, 'Absatz 2 hervorgehoben');
await page.click('button:has-text("Absatz wiederholen")');
await page.waitForTimeout(300);
ok(await lastSpoken() === 'Absatz 2 von 3. Zweiter Absatz ist hier.', 'Absatz wiederholen');
await page.click('button:has-text("Vorheriger Absatz")');
await page.waitForTimeout(300);
ok((await lastSpoken()).startsWith('Absatz 1 von 3. Erster'), 'Vorheriger Absatz');
await page.click('button:has-text("Schneller")');
await page.waitForTimeout(300);
const fast = await page.evaluate(() => window.__spoken.at(-1));
ok(fast.text.startsWith('Tempo 1,1-fach.') && fast.rate === 1.1, 'Tempo beim Vorlesen von der Stimme angesagt: ' + fast.text);
ok(await live() === '', 'Keine VoiceOver-Ansagen während des Vorlesens: „' + await live() + '“');
ok(await page.textContent('#reader-rate') === 'Tempo: 1,1-fach', 'Tempoanzeige');

// Bis zum Ende
await page.evaluate(() => { window.__wordMs = 5; });
await page.click('button:has-text("Nächster Absatz")');
await page.waitForFunction(() => document.querySelector('#reader-status')?.textContent === 'Fertig vorgelesen.', null, { timeout: 5000 });
ok(await label() === 'Erneut vorlesen', 'Ende: „Erneut vorlesen“');
await page.waitForTimeout(200);
ok((await live()).includes('Ende des Dokuments'), 'Ende angesagt');
await page.click('button:has-text("Nächster Absatz")');
await page.waitForTimeout(250);
ok((await live()).includes('letzte Absatz'), 'Letzter Absatz angesagt');

// Tempo im Ruhezustand + Speicherung
await page.click('button:has-text("Langsamer")');
await page.waitForTimeout(250);
ok((await live()).includes('Tempo normal'), 'Tempo im Ruhezustand angesagt: ' + await live());

// Hintergrund pausiert
await page.evaluate(() => { window.__wordMs = 400; });
await page.click(toggle);
await page.waitForTimeout(200);
await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
ok(await label() === 'Fortsetzen', 'Hintergrund pausiert das Vorlesen');
await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); });

// Beenden
await page.click(toggle);
await page.waitForTimeout(100);
await page.click('button:has-text("Vorlesen beenden")');
ok(await label() === 'Vorlesen' && await current() === -1, 'Beenden setzt zurück');
ok(await page.evaluate(() => document.activeElement?.textContent) === 'Vorlesen', 'Fokus zurück auf „Vorlesen“');

// Verlassen stoppt
await page.click(toggle);
await page.waitForTimeout(100);
await page.click('[data-tab=library]');
await page.waitForTimeout(200);
ok(await page.evaluate(() => speechSynthesis.speaking) === false, 'Verlassen der Seite stoppt das Vorlesen');

// Einstellungen: Tempo gespeichert, Absatzansage abschalten
await page.click('[data-tab=settings]');
await page.waitForSelector('#rate-input');
ok(await page.inputValue('#rate-input') === '1', 'Tempo in Einstellungen übernommen');
await page.uncheck('#announce-paragraphs-toggle');
ok(await page.isVisible('text=Absatznummer ansagen'), 'Einstellung „Absatznummer ansagen“');
await page.goBack(); await page.goBack();
await page.waitForSelector('#reader-heading');
await page.click('button:has-text("Nächster Absatz")');
await page.waitForTimeout(300);
ok(await lastSpoken() === 'Zweiter Absatz ist hier.', 'Ohne Absatzansage');
ok((await page.evaluate(() => window.__spoken.every((s) => s.lang === 'de-DE'))), 'Sprache immer de-DE');
await page.click(toggle);
await page.screenshot({ path: 'reader.png', fullPage: false });
await page.evaluate(() => document.querySelector('#reader-heading').scrollIntoView());
await page.screenshot({ path: 'reader-panel.png' });
ok(errors.length === 0, 'Keine Konsolenfehler: ' + JSON.stringify(errors));
await browser.close();
