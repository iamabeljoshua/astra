// Accessibility scan of each state, Slow 3G load inside the new limit, and fonts on Sessions.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { BASE, launch, openPage, setMode, waitForLoadedHome, getTextBox } from './lib.mjs';

const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const browser = await launch();

async function scan(page, name) {
  await page.evaluate(axeSource);
  const result = await page.evaluate(() => window.axe.run(document, { resultTypes: ['violations'] }));
  console.log(`axe ${name}: ${result.violations.length} violations`, result.violations.map((violation) => `${violation.id} (${violation.nodes.length})`).join(', '));
}

for (const [width, height] of [[1280, 800], [390, 844]]) {
  for (const theme of ['light', 'dark']) {
    await setMode({ home: 'real' });
    const { context, page } = await openPage(browser, { width, height, theme });
    await waitForLoadedHome(page);
    await scan(page, `${width} ${theme} loaded`);
    await page.locator('input[type=file]').setInputFiles({ name: 'homework.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('x') });
    await getTextBox(page).fill('Why');
    await page.getByRole('button', { name: 'Start session' }).click();
    await page.waitForTimeout(350);
    await scan(page, `${width} ${theme} chip and notice`);
    await context.close();

    await setMode({ home: '500' });
    const failed = await openPage(browser, { width, height, theme });
    await failed.page.goto(`${BASE}/`);
    await failed.page.getByRole('button', { name: 'Try again' }).waitFor({ timeout: 8000 });
    await failed.page.waitForTimeout(350);
    await scan(failed.page, `${width} ${theme} failure`);
    await failed.context.close();

    await setMode({ home: 'wrong' });
    const crashed = await openPage(browser, { width, height, theme });
    await crashed.page.goto(`${BASE}/`);
    await crashed.page.getByRole('button', { name: 'Try again' }).waitFor({ timeout: 8000 });
    await crashed.page.waitForTimeout(350);
    await scan(crashed.page, `${width} ${theme} cards crash`);
    await crashed.context.close();
  }
}

await setMode({ home: 'real' });
const root = await openPage(browser, { width: 1280, height: 800 });
await root.page.addInitScript(() => { window.ResizeObserver = class { constructor() { throw new Error('forced'); } }; });
await root.page.goto(`${BASE}/`);
await root.page.getByRole('button', { name: 'Reload' }).waitFor();
await scan(root.page, 'root crash page');
await root.context.close();

for (const [name, conditions] of [
  ['Fast 3G', { latency: 562.5, downloadThroughput: (1.6e6 / 8) * 0.9, uploadThroughput: (750e3 / 8) * 0.9 }],
  ['Slow 3G', { latency: 2000, downloadThroughput: (400e3 / 8) * 0.8, uploadThroughput: (400e3 / 8) * 0.8 }],
]) {
  const { context, page } = await openPage(browser, { width: 390, height: 844 });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, ...conditions });
  const requests = [];
  page.on('requestfinished', async (request) => { if (request.url().endsWith('/api/home')) requests.push(request.timing().responseEnd); });
  page.on('requestfailed', (request) => { if (request.url().endsWith('/api/home')) requests.push(`failed ${request.failure()?.errorText}`); });
  const started = Date.now();
  await page.goto(`${BASE}/`, { timeout: 120000 });
  await page.getByRole('heading', { level: 1, name: /Maya/ }).waitFor({ timeout: 90000 }).catch(() => console.log(name, 'greeting never showed the name'));
  console.log(`${name}: greeting with the name after ${Date.now() - started} ms, /home attempts ${JSON.stringify(requests)}`);
  await context.close();
}

const sessions = await openPage(browser, { width: 1280, height: 800 });
const fonts = [];
sessions.page.on('request', (request) => { if (request.url().includes('/fonts/')) fonts.push(request.url().split('/').pop()); });
await sessions.page.goto(`${BASE}/sessions`);
await sessions.page.getByRole('heading', { level: 1 }).waitFor();
await sessions.page.evaluate(() => document.fonts.ready);
await sessions.page.waitForTimeout(500);
console.log('Sessions downloads', JSON.stringify(fonts));
const padding = await sessions.page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--dock-height'));
console.log('Sessions --dock-height', JSON.stringify(padding));
await sessions.context.close();
await browser.close();
