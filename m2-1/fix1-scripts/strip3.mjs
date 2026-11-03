import { PNG } from 'pngjs';
import { launch, openPage, waitForLoadedHome } from './lib.mjs';
const label = process.argv[2];
for (const kind of ['chromium', 'webkit']) {
  const browser = await launch(kind);
  for (const dpr of [1.25, 1.75, 1.5]) {
    const { context, page } = await openPage(browser, { width: 390, height: 844, deviceScaleFactor: dpr });
    await waitForLoadedHome(page);
    for (const y of [0, 7, 70, 140]) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      await page.waitForTimeout(30);
      const png = PNG.sync.read(await page.screenshot());
      const rows = [];
      for (let row = 0; row < 3; row += 1) {
        const counts = {};
        for (let x = 0; x < png.width; x += 1) {
          const i = (png.width * (png.height - 1 - row) + x) << 2;
          const key = `${png.data[i]},${png.data[i + 1]},${png.data[i + 2]}`;
          counts[key] = (counts[key] ?? 0) + 1;
        }
        rows.push(counts);
      }
      const geometry = await page.evaluate(() => { const b = document.querySelector('form').parentElement.getBoundingClientRect(); return [b.top, b.bottom, scrollY]; });
      console.log(label, kind, 'dpr', dpr, 'scroll', y, 'imgH', png.height, JSON.stringify(rows), JSON.stringify(geometry));
    }
    await context.close();
  }
  await browser.close();
}
