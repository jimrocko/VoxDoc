import { chromium } from 'playwright-core';
import fs from 'node:fs';
const axe = fs.readFileSync(process.env.AXE_PATH, 'utf8');
const ok = (cond, msg, d = '') => { console.log(cond ? 'OK  ' : 'FAIL', msg, cond ? '' : d); if (!cond) process.exitCode = 1; };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, contrast: 'more', reducedMotion: 'reduce' });
const page = await ctx.newPage();
await page.goto('http://localhost:4173/'); await page.waitForSelector('main h1');
ok(await page.evaluate(() => matchMedia('(prefers-contrast: more)').matches && matchMedia('(prefers-reduced-motion: reduce)').matches), 'Emulation aktiv: Kontrast erhöhen, Bewegung reduzieren');
for (const hash of ['#/', '#/bibliothek', '#/suche', '#/einstellungen', '#/hilfe', '#/scannen']) {
  for (const theme of ['dark', 'light']) {
    await page.goto('http://localhost:4173/' + hash); await page.waitForSelector('main h1');
    await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
    await page.addScriptTag({ content: axe });
    const r = await page.evaluate(() => axe.run({ runOnly: ['wcag2aa', 'wcag21aa', 'wcag22aa'] }));
    ok(r.violations.length === 0, `Kontrast erhöht ${hash} ${theme}`, JSON.stringify(r.violations.map((v) => [v.id, v.nodes.slice(0, 2).map((n) => n.target)])));
  }
}
const border = await page.evaluate(() => getComputedStyle(document.querySelector('.button')).borderColor);
ok(border !== 'rgba(0, 0, 0, 0)', 'Knöpfe bekommen bei erhöhtem Kontrast einen Rahmen: ' + border);
const animated = await page.evaluate(() => [...document.querySelectorAll('*')].filter((e) => parseFloat(getComputedStyle(e).animationDuration) > 0.01 || parseFloat(getComputedStyle(e).transitionDuration) > 0.01).length);
ok(animated === 0, 'Keine Animationen bei „Bewegung reduzieren“');
await browser.close();
