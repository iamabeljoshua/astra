import { PNG } from 'pngjs';
import { writeFileSync } from 'node:fs';
import { SCRATCH, launch, openPage, waitForLoadedHome, getTextBox } from './lib.mjs';
const browser = await launch();
const dpr = 1.25;
const { context, page } = await openPage(browser, { width: 1280, height: 500, deviceScaleFactor: dpr });
await waitForLoadedHome(page);
await getTextBox(page).fill('Why');
await page.getByRole('button', { name: 'Start session' }).click();
const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
const mainLeft = await page.evaluate(() => Math.ceil(document.querySelector('main').getBoundingClientRect().left));
let saved = false;
for (let y = 0; y <= max; y += 7) {
  await page.evaluate((top) => window.scrollTo(0, top), y);
  await page.waitForTimeout(16);
  const png = PNG.sync.read(await page.screenshot());
  const startX = Math.ceil(mainLeft * dpr);
  const first = (png.width * (png.height - 1) + startX + 2) << 2;
  const paper = [png.data[first], png.data[first + 1], png.data[first + 2]];
  const hits = [];
  for (let row = 0; row < 3; row += 1) for (let x = startX; x < png.width; x += 1) {
    const i = (png.width * (png.height - 1 - row) + x) << 2;
    if (Math.abs(png.data[i] - paper[0]) > 2 || Math.abs(png.data[i + 1] - paper[1]) > 2 || Math.abs(png.data[i + 2] - paper[2]) > 2) hits.push([x, row, png.data[i], png.data[i + 1], png.data[i + 2]]);
  }
  if (hits.length) {
    console.log('scroll', y, 'imgW', png.width, 'count', hits.length, 'first', JSON.stringify(hits[0]), 'last', JSON.stringify(hits.at(-1)), 'paper', JSON.stringify(paper));
    if (!saved) { writeFileSync(`${SCRATCH}/shots/strip4.png`, PNG.sync.write(png)); saved = true; }
  }
}
const geo = await page.evaluate(() => { const d = document.querySelector('[data-dock]').getBoundingClientRect(); const c = document.querySelector('main ul').getBoundingClientRect(); return { dock: [d.left, d.right, d.top, d.bottom], cards: [c.left, c.right], main: document.querySelector('main').getBoundingClientRect().left }; });
console.log(JSON.stringify(geo));
await browser.close();
