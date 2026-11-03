import { BASE, launch, openPage, waitForLoadedHome, getTextBox } from './lib.mjs';
for (const kind of ['chromium', 'webkit']) {
  const browser = await launch(kind);
  console.log('=====', kind, browser.version());
  for (const width of [320, 340, 360, 375, 390, 400, 412, 430]) {
    const { context, page } = await openPage(browser, { width, height: 800 });
    await waitForLoadedHome(page);
    const read = () => page.evaluate(() => { const t = document.querySelector('textarea'); return { h: t.getBoundingClientRect().height, sh: t.scrollHeight, ch: t.clientHeight, style: t.style.height }; });
    const empty = await read();
    await getTextBox(page).focus();
    await page.keyboard.type('a');
    const typed = await read();
    await page.keyboard.press('Backspace');
    const back = await read();
    await page.getByRole('button', { name: 'Talk' }).click();
    const talk = await read();
    console.log(width, 'empty', JSON.stringify(empty), 'typed', typed.h, 'back', back.h, 'talk', JSON.stringify(talk));
    await context.close();
  }
  // strip under the dock at fractional heights
  for (const [width, height, dpr] of [[390, 844, 1], [390, 844, 2], [390, 660, 3], [1280, 650, 1]]) {
    const { context, page } = await openPage(browser, { width, height, deviceScaleFactor: dpr });
    await waitForLoadedHome(page);
    const rows = [];
    for (const step of ['rest', 'notice', 'scrolled']) {
      if (step === 'notice') { await getTextBox(page).fill('Why'); await page.getByRole('button', { name: 'Start session' }).click(); }
      if (step === 'scrolled') await page.evaluate(() => window.scrollTo(0, 37));
      await page.waitForTimeout(60);
      rows.push(await page.evaluate((s) => { const d = document.querySelector('form').parentElement; const b = d.getBoundingClientRect(); return [s, 'dock', +b.top.toFixed(3), +b.bottom.toFixed(3), +b.height.toFixed(3), 'inner', innerHeight, 'scrollY', scrollY, 'doc', document.documentElement.scrollHeight]; }, step));
    }
    console.log(width, height, dpr, JSON.stringify(rows));
    await context.close();
  }
  await browser.close();
}
