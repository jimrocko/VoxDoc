import { chromium } from 'playwright-core';
const ok = (cond, msg, d = '') => { console.log(cond ? 'OK  ' : 'FAIL', msg, cond ? '' : d); if (!cond) process.exitCode = 1; };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
for (const [w, h, size] of [[390, 844, ''], [320, 640, '200%']]) {
  const page = await (await browser.newContext({ viewport: { width: w, height: h }, isMobile: true })).newPage();
  for (const hash of ['#/', '#/einstellungen', '#/hilfe', '#/scannen']) {
    await page.goto('http://localhost:4173/' + hash); await page.waitForSelector('main h1');
    await page.evaluate((s) => { document.documentElement.style.fontSize = s; }, size);
    await page.waitForTimeout(150);
    const hidden = [];
    for (let i = 0; i < 45; i++) {
      await page.keyboard.press('Tab');
      const r = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || !el.closest('main')) return null;
        const box = el.getBoundingClientRect();
        // Liegt der Mittelpunkt des fokussierten Elements unter einem festen Element?
        const top = document.elementFromPoint(box.left + box.width / 2, Math.min(box.top + box.height / 2, innerHeight - 1));
        return top && !el.contains(top) && top.closest('.tab-bar, .voice-fab') ? (el.textContent || el.id).trim().slice(0, 30) : null;
      });
      if (r) hidden.push(r);
    }
    ok(hidden.length === 0, `Fokus nicht verdeckt: ${hash} ${w}px ${size || '100%'}`, [...new Set(hidden)].join(' | '));
  }
  if (size) {
    await page.goto('http://localhost:4173/'); await page.waitForSelector('main h1');
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    const fab = await page.evaluate(() => { const r = document.querySelector('.voice-fab').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
    ok(fab[1] <= 60 && fab[0] <= 150, 'Knopf „Befehl“ bleibt bei großer Schrift kompakt', fab.join('×'));
    await page.screenshot({ path: 'final-large2.png' });
  }
}
await browser.close();
