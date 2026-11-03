// Looks for card pixels below the dock: the bottom rows of the window must be plain paper at every scroll position.
import { PNG } from 'pngjs';
import { launch, openPage, waitForLoadedHome, getTextBox, SCRATCH } from './lib.mjs';
import { writeFileSync } from 'node:fs';
const label = process.argv[2] ?? 'run';
for (const kind of ['chromium', 'webkit']) {
  const browser = await launch(kind);
  for (const [width, height, dpr, withNotice, zoom] of [[390, 844, 1, false], [390, 844, 1, true], [390, 844, 2, true], [390, 844, 3, true], [390, 660, 2, true], [1280, 500, 1, true], [1280, 500, 2, true], [640, 400, 2, true], [390, 844, 1.5, true]]) {
    const { context, page } = await openPage(browser, { width, height, deviceScaleFactor: dpr });
    await waitForLoadedHome(page);
    if (withNotice) { await getTextBox(page).fill('Why'); await page.getByRole('button', { name: 'Start session' }).click(); }
    const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    const mainLeft = await page.evaluate(() => Math.ceil(document.querySelector('main').getBoundingClientRect().left));
    const found = [];
    let checked = 0;
    for (let y = 0; y <= max; y += 7) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      await page.waitForTimeout(16);
      const png = PNG.sync.read(await page.screenshot());
      checked += 1;
      const first = (png.width * (png.height - 1) + Math.ceil(mainLeft * dpr) + 2) << 2;
      const paper = [png.data[first], png.data[first + 1], png.data[first + 2]];
      for (let row = 0; row < 3 * dpr; row += 1) {
        const yPx = png.height - 1 - row;
        let odd = 0;
        for (let x = Math.ceil(mainLeft * dpr); x < png.width; x += 1) {
          const i = (png.width * yPx + x) << 2;
          if (png.data[i] !== paper[0] || png.data[i + 1] !== paper[1] || png.data[i + 2] !== paper[2]) odd += 1;
        }
        if (odd) { found.push({ y, row, odd }); if (found.length === 1) writeFileSync(`${SCRATCH}/shots/strip-${label}-${kind}-${width}x${height}-${dpr}.png`, PNG.sync.write(png)); break; }
      }
    }
    const geometry = await page.evaluate(() => { const b = document.querySelector('form').parentElement.getBoundingClientRect(); return [b.top, b.bottom, b.height, innerHeight]; });
    console.log(kind, width, height, 'dpr', dpr, 'notice', withNotice, 'checked', checked, 'stops with strip', found.length, JSON.stringify(found.slice(0, 3)), 'dock', JSON.stringify(geometry));
    await context.close();
  }
  await browser.close();
}
