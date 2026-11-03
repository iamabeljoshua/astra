// Does a whole-number dock height stop the strip? Old build, no notice, fractional device scales, and the chip case.
import { PNG } from 'pngjs';
import { launch, openPage, waitForLoadedHome, getTextBox } from './lib.mjs';
for (const kind of ['chromium', 'webkit']) {
  const browser = await launch(kind);
  for (const [width, height, dpr, state] of [[390, 844, 1.25, 'rest'], [390, 844, 1.75, 'rest'], [390, 844, 1.5, 'chip'], [390, 844, 1.5, 'notice'], [390, 844, 1.25, 'notice'], [1280, 500, 1.25, 'notice']]) {
    const { context, page } = await openPage(browser, { width, height, deviceScaleFactor: dpr });
    await waitForLoadedHome(page);
    if (state === 'notice') { await getTextBox(page).fill('Why'); await page.getByRole('button', { name: 'Start session' }).click(); }
    if (state === 'chip') await page.locator('input[type=file]').setInputFiles({ name: 'homework.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('x') });
    const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    const mainLeft = await page.evaluate(() => Math.ceil(document.querySelector('main').getBoundingClientRect().left));
    let withStrip = 0; let checked = 0;
    for (let y = 0; y <= max; y += 7) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      await page.waitForTimeout(16);
      const png = PNG.sync.read(await page.screenshot());
      checked += 1;
      const startX = Math.ceil(mainLeft * dpr);
      const first = (png.width * (png.height - 1) + startX + 2) << 2;
      const paper = [png.data[first], png.data[first + 1], png.data[first + 2]];
      let odd = 0;
      for (let row = 0; row < 3; row += 1) for (let x = startX; x < png.width; x += 1) {
        const i = (png.width * (png.height - 1 - row) + x) << 2;
        if (Math.abs(png.data[i] - paper[0]) > 2 || Math.abs(png.data[i + 1] - paper[1]) > 2 || Math.abs(png.data[i + 2] - paper[2]) > 2) odd += 1;
      }
      if (odd) withStrip += 1;
    }
    const dockHeight = await page.evaluate(() => document.querySelector('[data-dock], form').closest('main > div > div, [data-dock]').getBoundingClientRect().height);
    console.log(kind, width, height, 'dpr', dpr, state, 'dock', dockHeight, 'stops', checked, 'with strip', withStrip);
    await context.close();
  }
  await browser.close();
}
