import { chromium } from 'playwright-core';
import fs from 'node:fs';
const axe = fs.readFileSync(process.env.AXE_PATH, 'utf8');
const URL = 'http://localhost:4173/';
const findings = [];
const ok = (cond, msg, detail = '') => { console.log(cond ? 'OK  ' : 'FAIL', msg, cond ? '' : detail); if (!cond) { process.exitCode = 1; findings.push(`${msg} ${detail}`); } };
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('dialog', (d) => d.accept());

// Testdaten
await page.goto(URL); await page.waitForSelector('h1');
const [c] = await Promise.all([page.waitForEvent('filechooser'), page.click('button:has-text("Fotos aus der Mediathek wählen")')]);
await c.setFiles(['brief.jpg', 'seite2.jpg']);
await page.waitForURL(/#\/dokument\//);
await page.waitForFunction(() => document.querySelector('#ocr-status')?.textContent.startsWith('Erkannt am'), null, { timeout: 120000 });
const docHash = new globalThis.URL(page.url()).hash;
const views = [
  ['Start', '#/'], ['Bibliothek', '#/bibliothek'], ['Dokument', docHash], ['Suche', '#/suche'],
  ['Einstellungen', '#/einstellungen'], ['Hilfe', '#/hilfe'], ['Scanner', '#/scannen'], ['Nicht gefunden', '#/gibtsnicht'],
];

async function axeRun(label) {
  await page.addScriptTag({ content: axe });
  const r = await page.evaluate(() => axe.run({ runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }));
  ok(r.violations.length === 0, `axe ${label}`, JSON.stringify(r.violations.map((v) => [v.id, v.nodes.slice(0, 3).map((n) => n.target)])));
}

async function structure(label) {
  const s = await page.evaluate(() => {
    const main = document.querySelector('main');
    const headings = [...main.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter((h) => !h.closest('[hidden]')).map((h) => Number(h.tagName[1]));
    let skip = null;
    headings.forEach((level, i) => { if (i > 0 && level > headings[i - 1] + 1) skip = `${headings[i - 1]}→${level}`; });
    const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    const broken = [...document.querySelectorAll('[aria-describedby],[aria-labelledby],label[for]')].flatMap((e) =>
      (e.getAttribute('aria-describedby') ?? e.getAttribute('aria-labelledby') ?? e.getAttribute('for')).split(/\s+/).filter((id) => id && !document.getElementById(id)));
    const visible = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
    const small = [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea')]
      .filter(visible)
      .filter((e) => !(e.tagName === 'INPUT' && ['checkbox', 'radio'].includes(e.type) && e.closest('label, .field-toggle')))
      .map((e) => [e, e.getBoundingClientRect()])
      .filter(([, r]) => r.height < 44 || r.width < 44)
      .map(([e, r]) => `${e.tagName.toLowerCase()}「${(e.textContent || e.getAttribute('aria-label') || e.id || '').trim().slice(0, 30)}」${Math.round(r.width)}×${Math.round(r.height)}`);
    return {
      h1: headings.filter((l) => l === 1).length, first: headings[0], skip, dupes, broken, small,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      title: document.title, lang: document.documentElement.lang,
      live: document.querySelectorAll('[aria-live],[role=status],[role=alert]').length,
    };
  });
  ok(s.h1 === 1 && s.first === 1, `${label}: genau eine h1 am Anfang`, JSON.stringify(s));
  ok(!s.skip, `${label}: keine übersprungene Überschriftenebene`, s.skip);
  ok(s.dupes.length === 0, `${label}: keine doppelten IDs`, s.dupes.join(','));
  ok(s.broken.length === 0, `${label}: alle ARIA-/label-Verweise gültig`, s.broken.join(','));
  ok(s.overflow <= 0, `${label}: keine horizontale Überbreite`, `${s.overflow}px`);
  ok(s.lang === 'de' && s.live === 1, `${label}: lang=de, genau eine Live-Region`, JSON.stringify([s.lang, s.live]));
  return s;
}

async function names(label) {
  const cdp = await ctx.newCDPSession(page);
  const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  const roles = new Set(['button', 'link', 'textbox', 'searchbox', 'checkbox', 'radio', 'combobox', 'slider', 'switch', 'spinbutton']);
  const unnamed = nodes.filter((n) => !n.ignored && roles.has(n.role?.value) && !(n.name?.value ?? '').trim()).map((n) => n.role.value);
  ok(unnamed.length === 0, `${label}: alle Bedienelemente haben einen Namen`, unnamed.join(','));
  // Namen, die mit dem sichtbaren Text beginnen (WCAG 2.5.3, wichtig für die iOS-Sprachsteuerung)
  const mismatch = await page.evaluate(() => [...document.querySelectorAll('button[aria-label], a[aria-label]')].filter((e) => e.textContent.trim() && !e.getAttribute('aria-label').startsWith(e.textContent.trim())).map((e) => e.getAttribute('aria-label')));
  ok(mismatch.length === 0, `${label}: sichtbarer Text im Namen enthalten`, mismatch.join(','));
  await cdp.detach();
}

const smallTargets = new Map();
for (const [label, hash] of views) {
  console.log(`--- ${label}`);
  await page.goto(URL + hash); await page.waitForSelector('main h1');
  await page.waitForTimeout(400);
  await axeRun(`${label} (dunkel)`);
  const s = await structure(label);
  s.small.forEach((t) => smallTargets.set(t.replace(/\d+×\d+/, ''), `${label}: ${t}`));
  await names(label);
  // Hell
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  await axeRun(`${label} (hell)`);
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  // Große Schrift und schmales Display
  await page.setViewportSize({ width: 320, height: 640 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await page.waitForTimeout(150);
  const over = await page.evaluate(() => ({ page: document.documentElement.scrollWidth - document.documentElement.clientWidth, wide: [...document.querySelectorAll('main *')].filter((e) => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1).slice(0, 3).map((e) => e.tagName + '.' + e.className) }));
  ok(over.page <= 0, `${label}: 320 px + doppelte Schrift ohne Überbreite`, JSON.stringify(over));
  await axeRun(`${label} (320 px, große Schrift)`);
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  await page.setViewportSize({ width: 390, height: 844 });
}
console.log('--- Zielgrößen unter 44 × 44 px (Apple-Empfehlung):', smallTargets.size ? '\n     ' + [...smallTargets.values()].join('\n     ') : 'keine');

console.log('--- Fokus und Tastatur');
for (const tab of ['library', 'search', 'settings', 'help', 'start']) {
  await page.click(`[data-tab=${tab}]`);
  await page.waitForTimeout(300);
  const f = await page.evaluate(() => [document.activeElement?.tagName, document.activeElement?.textContent]);
  ok(f[0] === 'H1', `Tab ${tab}: Fokus auf h1 („${f[1]}“)`);
}
const titles = [];
for (const [label, hash] of views) { await page.goto(URL + hash); await page.waitForSelector('main h1'); titles.push(await page.title()); }
ok(new Set(titles).size === titles.length, 'Jede Ansicht hat einen eigenen Fenstertitel', titles.join(' | '));
// Tastatur: alle fokussierbaren Elemente der Startseite erreichbar, keine Falle
await page.goto(URL); await page.waitForSelector('main h1');
const reached = new Set();
for (let i = 0; i < 40; i++) { await page.keyboard.press('Tab'); reached.add(await page.evaluate(() => document.activeElement?.textContent?.trim().slice(0, 25) || document.activeElement?.tagName)); }
ok(reached.has('Dokument scannen') && reached.has('Befehl') && reached.has('Bibliothek') && reached.has('Zum Inhalt springen'), 'Tab-Reihenfolge erreicht Inhalt, „Befehl“ und Tab-Leiste', [...reached].join(' | '));
// Sichtbarer Fokus
await page.focus('[data-tab=library]');
await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
const outline = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return [s.outlineStyle, s.outlineWidth]; });
ok(outline[0] !== 'none' && parseFloat(outline[1]) >= 2, 'Tastaturfokus sichtbar (Umriss ≥ 2 px)', outline.join(' '));
// Befehlsfenster: Escape schließt, Fokus zurück
await page.click('#voice-button');
ok(await page.evaluate(() => document.querySelector('#voice-dialog').open), 'Befehlsfenster öffnet');
await audit2();
async function audit2() { await axeRun('Befehlsfenster offen'); }
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
ok(await page.evaluate(() => !document.querySelector('#voice-dialog').open && document.activeElement?.id === 'voice-button'), 'Escape schließt, Fokus zurück auf „Befehl“');
// Schieberegler mit Textwert
await page.goto(URL + '#/einstellungen'); await page.waitForSelector('#rate-input');
ok(/^(normal|\d,\d-fach)$/.test(await page.getAttribute('#rate-input', 'aria-valuetext')), 'Sprechtempo-Regler hat sprechenden Wert');

console.log('--- Manifest und Icons');
const manifest = await (await page.request.get(URL + 'manifest.json')).json();
ok(manifest.lang === 'de' && manifest.display === 'standalone' && manifest.icons.length >= 3, 'Manifest: Sprache, Anzeige, Icons');
for (const icon of [...manifest.icons.map((i) => i.src), 'icons/apple-touch-icon.png']) {
  const r = await page.request.get(URL + icon);
  ok(r.ok() && r.headers()['content-type'].startsWith('image/'), `Icon erreichbar: ${icon}`);
}

console.log('--- Offline');
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload(); await page.waitForSelector('main h1');
await ctx.setOffline(true);
for (const [label, hash] of views) {
  await page.goto(URL + hash, { waitUntil: 'domcontentloaded' }).catch(() => {});
  const okView = await page.waitForSelector('main h1', { timeout: 8000 }).then(() => true, () => false);
  ok(okView, `Offline: ${label} lädt`);
}
await page.goto(URL + docHash); await page.waitForSelector('main h1');
ok((await page.textContent('.doc-text')).includes('Müllheim'), 'Offline: Dokumenttext aus IndexedDB');
await ctx.setOffline(false);
ok(errors.filter((e) => !/Failed to load resource|ERR_INTERNET_DISCONNECTED|Permission|NotAllowedError|camera|video/i.test(e)).length === 0, 'Keine unerwarteten Konsolenfehler', JSON.stringify(errors));
fs.writeFileSync('audit-findings.json', JSON.stringify({ findings, smallTargets: [...smallTargets.values()] }, null, 1));
await browser.close();
