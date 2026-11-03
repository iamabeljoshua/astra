// Usage: BASE=http://localhost:5411 OUT=<dir> node repro.mjs
// Drives real Chrome through the defects the M1.3 verifiers found and prints each result.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const BASE = process.env.BASE;
const OUT = process.env.OUT;
mkdirSync(OUT, { recursive: true });

const PHONE = { width: 390, height: 844 };
const LAPTOP = { width: 1440, height: 900 };
const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function open(viewport, path = '/') {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(BASE + path);
  await page.getByRole('heading', { level: 1 }).waitFor();
  await page.waitForFunction(() => document.fonts.status === 'loaded');
  return { context, page, errors };
}

const getMenuState = (page) =>
  page.evaluate(() => ({
    path: location.pathname,
    expanded: document.querySelector('header button').getAttribute('aria-expanded'),
    sidebarShown: getComputedStyle(document.getElementById('sidebar')).display !== 'none',
    mainShown: getComputedStyle(document.querySelector('main')).display !== 'none',
    focus: document.activeElement === document.body ? 'BODY' : document.activeElement.textContent,
  }));

async function countDocumentKeydownListeners(page) {
  const client = await page.context().newCDPSession(page);
  const { result } = await client.send('Runtime.evaluate', { expression: 'document' });
  const { listeners } = await client.send('DOMDebugger.getEventListeners', { objectId: result.objectId });
  await client.detach();
  return listeners.filter((listener) => listener.type === 'keydown').length;
}

const print = (name, value) => console.log(`${name}: ${JSON.stringify(value)}`);

console.log('== Escape, phone');
{
  const { context, page, errors } = await open(PHONE);
  const menuButton = page.getByRole('button', { name: 'Menu' });
  print('keydown listeners on document, Menu closed', await countDocumentKeydownListeners(page));

  await menuButton.click();
  print('keydown listeners on document, Menu open', await countDocumentKeydownListeners(page));
  await page.mouse.click(200, 500);
  print('open, then clicked the blank part so focus is on body', await getMenuState(page));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  print('after Escape on body', await getMenuState(page));
  await page.screenshot({ path: `${OUT}/escape-on-body.png` });
  print('keydown listeners on document, after that Escape', await countDocumentKeydownListeners(page));

  await page.goto(`${BASE}/`);
  await page.getByRole('heading', { level: 1 }).waitFor();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  print('opened by keyboard, focus on a row', await getMenuState(page));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  print('after Escape on a row', await getMenuState(page));
  print('console errors', errors);
  await context.close();
}

console.log('== Back with the Menu open, phone');
{
  const { context, page, errors } = await open(PHONE);
  const menuButton = page.getByRole('button', { name: 'Menu' });
  await menuButton.click();
  await page.getByRole('link', { name: 'Sessions' }).click();
  await page.getByRole('heading', { name: 'Sessions' }).waitFor();
  print('chose Sessions', await getMenuState(page));

  await menuButton.click();
  print('opened on Sessions', await getMenuState(page));
  await page.goBack();
  await page.waitForTimeout(300);
  print('after Back', await getMenuState(page));
  await page.screenshot({ path: `${OUT}/back-with-menu-open.png` });

  await page.goForward();
  await page.waitForTimeout(300);
  print('after Forward, must stay closed', await getMenuState(page));

  await menuButton.click();
  await page.keyboard.press('Tab');
  print('opened again, focus inside the Menu', await getMenuState(page));
  await page.goBack();
  await page.waitForTimeout(300);
  print('after Back with focus inside the Menu', await getMenuState(page));
  print('console errors', errors);
  await context.close();
}

console.log('== Account row, 1440 by 900');
{
  const { context, page } = await open(LAPTOP, '/sessions');
  print(
    'account row',
    await page.evaluate(() => {
      const row = document.querySelector('aside').children[3];
      const toggle = row.children[1];
      const box = row.getBoundingClientRect();
      const toggleBox = toggle.getBoundingClientRect();
      return { height: box.height, ruleY: box.top, bottom: box.bottom, toggleY: toggleBox.top, toggleHeight: toggleBox.height };
    }),
  );
  await context.close();
}

await browser.close();
