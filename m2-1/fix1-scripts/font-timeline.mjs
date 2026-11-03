import { BASE, launch, openPage, setMode } from './lib.mjs';
await setMode({ fontDelayMs: 1200 });
for (const [kind, width] of [['webkit', 390], ['webkit', 400], ['chromium', 390], ['chromium', 400]]) { console.log(kind, width); const browser = await launch(kind);
const { context, page } = await openPage(browser, { width, height: 800 });
await page.addInitScript(() => {
  window.__log = [];
  const now = () => Math.round(performance.now());
  const measure = () => { const t = document.querySelector('textarea'); if (!t) return null; const s = t.style.height; t.style.height = 'auto'; const v = t.scrollHeight; t.style.height = s; return v; };
  document.addEventListener('DOMContentLoaded', () => {
    for (const name of ['loading', 'loadingdone', 'loadingerror']) document.fonts.addEventListener(name, (event) => window.__log.push([now(), name, event.fontfaces.map((face) => face.family + face.weight + ':' + face.status).join(','), measure()]));
    document.fonts.ready.then(() => window.__log.push([now(), 'ready', measure()]));
  });
  let last = null;
  const tick = () => { const v = measure(); if (v !== last) { window.__log.push([now(), 'frame content', v, document.querySelector('textarea')?.style.height]); last = v; } const h = document.querySelector('textarea')?.style.height; if (h !== window.__h) { window.__log.push([now(), 'style', h]); window.__h = h; } if (performance.now() < 5000) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
});
await page.goto(`${BASE}/`);
await page.waitForTimeout(5000);
console.log((await page.evaluate(() => window.__log)).map((row) => JSON.stringify(row)).join('\n'));
await browser.close(); }
await setMode({ fontDelayMs: 0 });
