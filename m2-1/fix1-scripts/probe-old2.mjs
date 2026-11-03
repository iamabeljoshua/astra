import { PROTO, launch, openPage, waitForLoadedHome, getTextBox } from './lib.mjs';
// Prototype's behaviour with its placeholder at narrow widths, and the threshold in the app.
const browser = await launch();
for (const width of []) {
  const { context, page } = await openPage(browser, { width, height: 800 });
  await page.goto(`${PROTO}#home-light-still`);
  await page.waitForSelector('.hello');
  await page.addStyleTag({ content: ':root{--strip:0px !important}.strip{display:none !important}' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  const read = () => page.evaluate(() => { const t = document.querySelector('.composer textarea'); return { h: t.getBoundingClientRect().height, sh: t.scrollHeight, style: t.style.height, form: document.querySelector('.composer').getBoundingClientRect().height }; });
  const rest = await read();
  await page.locator('.composer textarea').focus();
  await page.keyboard.type('a');
  const typed = await read();
  const { context: c2, page: p2 } = await openPage(browser, { width, height: 800 });
  await waitForLoadedHome(p2);
  const app = await p2.evaluate(() => { const t = document.querySelector('textarea'); return { h: t.getBoundingClientRect().height, form: document.querySelector('form').getBoundingClientRect().height }; });
  console.log(width, 'proto rest', JSON.stringify(rest), 'typed', typed.h, '| app rest', JSON.stringify(app));
  await context.close(); await c2.close();
}
// Does focusing or typing in the box move the page on the old build?
for (const kind of ['chromium', 'webkit']) {
  const b = kind === 'chromium' ? browser : await launch('webkit');
  const { context, page } = await openPage(b, { width: 390, height: 844 });
  await waitForLoadedHome(page);
  await getTextBox(page).focus();
  const a = await page.evaluate(() => scrollY);
  await page.keyboard.type('hello there');
  const c = await page.evaluate(() => scrollY);
  console.log(kind, 'old build scrollY after focus', a, 'after typing', c);
  await context.close();
}
await browser.close();
