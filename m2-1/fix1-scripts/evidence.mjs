import { SCRATCH, getTextBox, launch, openPage, waitForLoadedHome } from './lib.mjs';
const OUT = `${SCRATCH}/shots/head`;
const browser = await launch();
for (const [width, height, deviceScaleFactor] of [[390, 844, 2], [640, 400, 2]]) {
  const { context, page } = await openPage(browser, { width, height, deviceScaleFactor });
  await waitForLoadedHome(page);
  for (let step = 0; step < 12; step += 1) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(40);
    if ((await page.evaluate(() => document.activeElement.textContent)).includes('DNA')) break;
  }
  await page.screenshot({ path: `${OUT}/focus-biology-${width}x${height}.png` });
  console.log(width, height, await page.evaluate(() => { const b = document.activeElement.getBoundingClientRect(); const d = document.querySelector('[data-dock]').getBoundingClientRect(); return { card: document.activeElement.textContent.slice(0, 20), cardBottom: b.bottom, dockTop: d.top, padding: getComputedStyle(document.documentElement).scrollPaddingBottom }; }));
  await context.close();
}
const { context, page } = await openPage(browser, { width: 390, height: 844, deviceScaleFactor: 2 });
await waitForLoadedHome(page);
await page.locator('input[type=file]').setInputFiles({ name: 'homework.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('x') });
await getTextBox(page).fill('Why does a ball follow a curve?');
await page.locator('main form').screenshot({ path: `${OUT}/chip-390.png` });
await browser.close();
