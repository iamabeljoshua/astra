#!/usr/bin/env node
// Usage: node live-proof.mjs <base-url> <shots-dir> [prototype-html]
// Runs from a folder where playwright-core resolves. Drives real Chrome against a running Astra web app.
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(join(process.cwd(), 'x.js'));
const { chromium } = require('playwright-core');

const [base, shotsDir, prototypeFile] = process.argv.slice(2);
mkdirSync(shotsDir, { recursive: true });

const DESIGN_TOKENS = {
  paper: ['#F6F1E6', '#000000'],
  panel: ['#EFE8DA', '#0E0D0B'],
  ink: ['#1B1815', '#FFFBF5'],
  'ink-2': ['#5F574C', '#A79F92'],
  line: ['#CFC6B5', '#2B2823'],
  accent: ['#1B1815', '#FFCC94'],
};
const LAPTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const PAGES = [['home', '/'], ['sessions', '/sessions']];
const THEMES = ['light', 'dark'];

let failures = 0;
function check(name, passed, detail = '') {
  if (!passed) failures += 1;
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
}
const section = (title) => console.log(`\n== ${title}`);

const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function openPage(contextOptions = {}, path = '/') {
  const context = await browser.newContext({ viewport: LAPTOP, ...contextOptions });
  const page = await context.newPage();
  const log = { console: [], bad: [], urls: [] };
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) log.console.push(`${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => log.console.push(`pageerror: ${error.message}`));
  page.on('response', (response) => {
    log.urls.push(response.url());
    if (response.status() >= 400) log.bad.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(base + path);
  return { context, page, log };
}

const getThemeAttribute = (page) => page.evaluate(() => document.documentElement.dataset.theme ?? null);
const getPaper = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const getSideways = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
// The production CSS minifier shortens #000000 to #000.
const expandHex = (hex) => (hex.length === 4 ? `#${[...hex.slice(1)].map((digit) => digit + digit).join('')}` : hex);
const hexToRgb = (hex) => `rgb(${[1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16)).join(', ')})`;

async function settle(page) {
  await page.waitForFunction(() => document.fonts.status === 'loaded');
  await page.waitForFunction(() => document.getAnimations().length === 0);
}

// Colors of every frame the browser really painted during one reload, under a slow network with no cache.
async function recordReloadFrames(page, { rewriteHtml } = {}) {
  const client = await page.context().newCDPSession(page);
  await client.send('Network.enable');
  await client.send('Network.setCacheDisabled', { cacheDisabled: true });
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 120,
    downloadThroughput: 200 * 1024,
    uploadThroughput: 100 * 1024,
  });
  if (rewriteHtml) {
    await page.route(`${base}/`, async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, body: rewriteHtml(await response.text()) });
    });
  }
  const frames = [];
  client.on('Page.screencastFrame', ({ data, sessionId }) => {
    frames.push(data);
    client.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await client.send('Page.enable');
  await client.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
  await page.reload();
  await page.waitForTimeout(2500);
  await client.send('Page.stopScreencast');
  await client.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  if (rewriteHtml) await page.unroute(`${base}/`);
  return frames;
}

// Decodes a painted frame and reads the top right corner, which only ever shows the page background.
async function getCornerColors(frames) {
  const decoder = await browser.newPage();
  const colors = [];
  for (const frame of frames) {
    colors.push(
      await decoder.evaluate(async (data) => {
        const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const drawing = canvas.getContext('2d');
        drawing.drawImage(bitmap, 0, 0);
        return [...drawing.getImageData(bitmap.width - 4, 4, 1, 1).data].slice(0, 3).join(',');
      }, frame),
    );
  }
  await decoder.close();
  return colors;
}

const isLightColor = (rgb) => rgb.split(',').map(Number).every((channel) => channel > 128);

section('Default theme');
{
  const { context, page, log } = await openPage({ colorScheme: 'dark' });
  await settle(page);
  check('light on first visit with the system set to dark', (await getPaper(page)) === hexToRgb('#F6F1E6'), await getPaper(page));
  check('Light shows as pressed', (await page.getByRole('button', { name: 'Light' }).getAttribute('aria-pressed')) === 'true');
  check('no console errors or warnings on load', log.console.length === 0, log.console.join(' | '));
  check('no failed responses on load, favicon included', log.bad.length === 0, log.bad.join(' | '));
  check('favicon loaded', log.urls.some((url) => url.endsWith('/favicon.svg')) || (await page.evaluate(async () => (await fetch('/favicon.svg')).ok)));
  check('every request stays on this origin', log.urls.every((url) => url.startsWith(base)), log.urls.filter((url) => !url.startsWith(base)).join(' | '));
  await context.close();
}

section('Tokens in the running page match docs/DESIGN.md');
{
  const { context, page } = await openPage();
  for (const [themeIndex, theme] of THEMES.entries()) {
    await page.getByRole('button', { name: theme === 'dark' ? 'Dark' : 'Light' }).click();
    for (const [token, values] of Object.entries(DESIGN_TOKENS)) {
      const actual = await page.evaluate(
        (name) => getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim(),
        token,
      );
      check(`${theme} ${token}`, hexToRgb(expandHex(actual)) === hexToRgb(values[themeIndex]), actual);
    }
  }
  await context.close();
}

section('Toggle survives reloads');
{
  const { context, page } = await openPage();
  await page.getByRole('button', { name: 'Dark' }).click();
  await page.waitForTimeout(400);
  check('one click turns the page dark', (await getPaper(page)) === hexToRgb('#000000'), await getPaper(page));
  await page.reload();
  check('dark after reload on Home', (await getThemeAttribute(page)) === 'dark' && (await page.getByRole('button', { name: 'Dark' }).getAttribute('aria-pressed')) === 'true');
  await page.goto(`${base}/sessions`);
  check('dark after loading Sessions directly', (await getThemeAttribute(page)) === 'dark');
  const secondTab = await context.newPage();
  await secondTab.goto(base);
  check('dark in a new tab', (await getThemeAttribute(secondTab)) === 'dark');
  await secondTab.close();
  await page.getByRole('button', { name: 'Light' }).click();
  await page.reload();
  check('back to light after reload', (await getThemeAttribute(page)) !== 'dark');
  await context.close();
}

section('No flash of the wrong theme, painted frames on a slow network with no cache');
{
  const { context, page } = await openPage();
  await page.getByRole('button', { name: 'Dark' }).click();
  await page.waitForTimeout(400);
  const darkFrames = await getCornerColors(await recordReloadFrames(page));
  check('saved dark paints no light frame', darkFrames.length > 0 && !darkFrames.some(isLightColor), `${darkFrames.length} frames: ${[...new Set(darkFrames)].join(' ')}`);

  const lateScript = (html) =>
    html.replace(
      /<script>[\s\S]*?<\/script>/,
      `<script type="module">await new Promise((done) => setTimeout(done, 700)); document.documentElement.dataset.theme = localStorage.getItem('theme') ?? 'light';</script>`,
    );
  const controlFrames = await getCornerColors(await recordReloadFrames(page, { rewriteHtml: lateScript }));
  check('control: with the script made late, the instrument sees the flash', controlFrames.some(isLightColor) && controlFrames.some((frame) => !isLightColor(frame)), `${controlFrames.length} frames: ${[...new Set(controlFrames)].join(' ')}`);
  await context.close();

  const lightVisit = await openPage({ colorScheme: 'dark' });
  await lightVisit.page.getByRole('button', { name: 'Dark' }).click();
  await lightVisit.page.getByRole('button', { name: 'Light' }).click();
  await lightVisit.page.waitForTimeout(400);
  const lightFrames = await getCornerColors(await recordReloadFrames(lightVisit.page));
  check('saved light with a dark system paints no dark frame', lightFrames.length > 0 && lightFrames.every(isLightColor), `${lightFrames.length} frames: ${[...new Set(lightFrames)].join(' ')}`);
  await lightVisit.context.close();
}

section('Fonts');
{
  const { context, page, log } = await openPage();
  await settle(page);
  const loaded = await page.evaluate(() => [...document.fonts].filter((font) => font.status === 'loaded').map((font) => `${font.family} ${font.weight}`));
  check('Barlow 400, 500, and 600 loaded', ['400', '500', '600'].every((weight) => loaded.some((font) => font.includes('Barlow') && font.endsWith(weight))), [...new Set(loaded)].join(', '));
  check('Newsreader loaded for the greeting', loaded.some((font) => font.includes('Newsreader')));
  const fontUrls = log.urls.filter((url) => url.endsWith('.woff2'));
  check('font files come from /fonts on this origin', fontUrls.length > 0 && fontUrls.every((url) => url.startsWith(`${base}/fonts/`)), fontUrls.map((url) => url.split('/').pop()).join(', '));
  check('Latin Extended and Vietnamese files stay unloaded on an English page', !fontUrls.some((url) => /latin-ext|vietnamese/.test(url)));
  const vietnamese = await page.evaluate(async () => (await document.fonts.load('500 15px Barlow', 'Ọlá')).length);
  check('a Yoruba name loads the subset that holds its letters', vietnamese > 0, `${vietnamese} faces`);
  await context.close();
}

if (prototypeFile) {
  section('Sizes against the prototype, in pixels with its 32px strip removed');
  const measure = (selectors) =>
    Object.fromEntries(
      Object.entries(selectors).map(([label, finder]) => {
        // eslint-disable-next-line no-new-func
        const element = new Function(finder)();
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return [label, [box.x, box.y, box.width, box.height, style.fontSize, style.fontWeight, style.letterSpacing, style.lineHeight, style.color, style.backgroundColor].join(' / ')];
      }),
    );
  const prototypeFinders = {
    sidebar: "return document.querySelector('.rail')",
    mark: "return document.querySelector('.rail .mark')",
    nav: "return document.querySelector('.rail nav')",
    'current row': "return document.querySelector('.rail nav [aria-current]')",
    'other row': "return document.querySelector('.rail nav button:not([aria-current])')",
    'recent label': "return document.querySelector('.recent .label')",
    account: "return document.querySelector('.account')",
    'account name': "return document.querySelector('.account b')",
    toggle: "return document.querySelector('.account .toggle')",
    'toggle button': "return document.querySelector('.account .toggle button')",
    column: "return document.querySelector('.column')",
    greeting: "return document.querySelector('.hello')",
  };
  const appFinders = {
    sidebar: "return document.querySelector('aside')",
    mark: "return document.querySelector('aside').children[0]",
    nav: "return document.querySelector('aside nav')",
    'current row': "return document.querySelector('aside nav [aria-current]')",
    'other row': "return document.querySelector('aside nav a:not([aria-current])')",
    'recent label': 'return document.querySelector("aside").children[2].children[0]',
    account: 'return document.querySelector("aside").children[3]',
    'account name': 'return document.querySelector("aside").children[3].children[0].children[0]',
    toggle: "return document.querySelector('aside [role=group]')",
    'toggle button': "return document.querySelector('aside [role=group] button')",
    column: "return document.querySelector('main > div')",
    greeting: "return document.querySelector('h1')",
  };
  // The strip takes 32px from the prototype's sidebar, so the sidebar compares at a taller window, while the page padding uses vh and compares at the same window.
  const prototypePage = await browser.newPage({ viewport: { width: LAPTOP.width, height: LAPTOP.height + 32 } });
  await prototypePage.goto(`file://${prototypeFile}#home-bottom-still-light`);
  await prototypePage.waitForTimeout(800);
  const prototypeSizes = await prototypePage.evaluate(measure, prototypeFinders);
  await prototypePage.setViewportSize(LAPTOP);
  await prototypePage.waitForTimeout(200);
  Object.assign(prototypeSizes, await prototypePage.evaluate(measure, { column: prototypeFinders.column, greeting: prototypeFinders.greeting }));
  const { context, page } = await openPage();
  await settle(page);
  const appSizes = await page.evaluate(measure, appFinders);
  for (const label of Object.keys(prototypeFinders)) {
    const [x, y, width, height, ...style] = prototypeSizes[label].split(' / ');
    const prototypeLine = [x, Number(y) - 32, width, height, ...style].join(' / ');
    const appParts = appSizes[label].split(' / ');
    const prototypeParts = prototypeLine.split(' / ');
    // The column is as tall as its content, the name's width follows the placeholder text, and the toggle's type sits on its buttons.
    const ignoredParts = { column: [3], 'account name': [2], toggle: [4, 5, 6, 7] }[label] ?? [];
    const same = appParts.every((part, index) => ignoredParts.includes(index) || part === prototypeParts[index]);
    check(label, same, same ? appSizes[label] : `prototype ${prototypeLine}, app ${appSizes[label]}`);
  }
  await prototypePage.close();
  await context.close();
}

section('Phone width, 390px');
for (const theme of THEMES) {
  const { context, page, log } = await openPage({ viewport: PHONE });
  if (theme === 'dark') {
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('button', { name: 'Dark' }).click();
    await page.getByRole('button', { name: 'Menu' }).click();
  }
  for (const [pageName, path] of PAGES) {
    await page.goto(base + path);
    await settle(page);
    check(`${theme} ${pageName}: no sideways scroll`, (await getSideways(page)) <= 0, `${await getSideways(page)}px`);
    check(`${theme} ${pageName}: sidebar hidden behind a Menu button`, !(await page.locator('aside').isVisible()) && (await page.getByRole('button', { name: 'Menu' }).isVisible()));
    await page.getByRole('button', { name: 'Menu' }).click();
    check(`${theme} ${pageName}: Menu opens the sidebar and hides the page`, (await page.locator('aside').isVisible()) && !(await page.locator('main').isVisible()));
    check(`${theme} ${pageName}: no sideways scroll with the Menu open`, (await getSideways(page)) <= 0, `${await getSideways(page)}px`);
    await page.getByRole('button', { name: 'Menu' }).click();
    check(`${theme} ${pageName}: Menu closes it again`, !(await page.locator('aside').isVisible()) && (await page.locator('main').isVisible()));
  }
  check(`${theme}: no console errors or failed responses`, log.console.length === 0 && log.bad.length === 0, [...log.console, ...log.bad].join(' | '));
  await context.close();
}
{
  const { context, page } = await openPage({ viewport: { width: 320, height: 640 } });
  await settle(page);
  check('320px also has no sideways scroll', (await getSideways(page)) <= 0, `${await getSideways(page)}px`);
  await page.getByRole('button', { name: 'Menu' }).click();
  check('320px with the Menu open also has no sideways scroll', (await getSideways(page)) <= 0, `${await getSideways(page)}px`);
  await context.close();
}

section('Breakpoint, as in the prototype');
{
  const { context, page } = await openPage({ viewport: { width: 760, height: 800 } });
  check('760px shows the Menu button', (await page.getByRole('button', { name: 'Menu' }).isVisible()) && !(await page.locator('aside').isVisible()));
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.setViewportSize({ width: 761, height: 800 });
  check('761px shows the sidebar and the page, even with the Menu left open', (await page.locator('aside').isVisible()) && (await page.locator('main').isVisible()) && !(await page.getByRole('button', { name: 'Menu' }).isVisible()));
  check('761px sidebar is 216px wide', (await page.locator('aside').boundingBox()).width === 216);
  await context.close();
}

section('Letters in Yoruba and Igbo names use our fonts, not a fallback');
{
  const { context, page } = await openPage();
  const widths = await page.evaluate(async (letters) => {
    const measure = (font, text) => {
      const drawing = new OffscreenCanvas(10, 10).getContext('2d');
      drawing.font = font;
      return drawing.measureText(text).width;
    };
    const results = {};
    for (const [family, weight] of [['Barlow', 500], ['Newsreader', 400]]) {
      await document.fonts.load(`${weight} 40px ${family}`, letters);
      results[family] = [...letters].map((letter) => measure(`${weight} 40px ${family}, monospace`, letter) !== measure(`${weight} 40px monospace`, letter));
    }
    return results;
  }, 'ỌẸỊỤọẹịụ');
  check('Barlow has every letter', widths.Barlow.every(Boolean), widths.Barlow.join());
  check('Newsreader has every letter', widths.Newsreader.every(Boolean), widths.Newsreader.join());
  await context.close();
}
{
  const { context, page } = await openPage();
  await settle(page);
  await page.evaluate(() => {
    for (const weight of [400, 500]) {
      const name = document.createElement('span');
      name.className = 'probe-name';
      name.style.fontWeight = String(weight);
      name.textContent = 'Ṣade';
      document.querySelector('aside').append(name);
    }
  });
  await page.waitForTimeout(600);
  const client = await context.newCDPSession(page);
  await client.send('DOM.enable');
  await client.send('CSS.enable');
  const { root } = await client.send('DOM.getDocument', { depth: 0 });
  const { nodeIds } = await client.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '.probe-name' });
  const drawnWith = [];
  for (const nodeId of nodeIds) {
    const { fonts } = await client.send('CSS.getPlatformFontsForNode', { nodeId });
    drawnWith.push(fonts.map((font) => font.postScriptName).join(' + '));
  }
  check('a regular name with a letter the fonts lack has no bold letter', !drawnWith[0].includes('Bold'), drawnWith[0]);
  check('a medium name with a letter the fonts lack has no bold letter', !drawnWith[1].includes('Bold'), drawnWith[1]);
  await context.close();
}

section('Phone menu behavior');
{
  const { context, page } = await openPage({ viewport: PHONE });
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('link', { name: 'Sessions' }).click();
  await page.getByRole('heading', { name: 'Sessions' }).waitFor();
  check('choosing a row opens that page and closes the menu', !(await page.locator('aside').isVisible()));
  await page.getByRole('button', { name: 'Menu' }).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Escape');
  check('Escape closes it and returns focus to the Menu button', !(await page.locator('aside').isVisible()) && (await page.evaluate(() => document.activeElement?.textContent)) === 'Menu');
  await context.close();
}
{
  const { context, page } = await openPage({ viewport: PHONE });
  const getFocusName = () => page.evaluate(() => (document.activeElement === document.body ? 'BODY' : document.activeElement?.textContent));
  const countKeydownListeners = async () => {
    const client = await context.newCDPSession(page);
    const { result } = await client.send('Runtime.evaluate', { expression: 'document' });
    const { listeners } = await client.send('DOMDebugger.getEventListeners', { objectId: result.objectId });
    await client.detach();
    return listeners.filter((listener) => listener.type === 'keydown').length;
  };
  const menuButton = page.getByRole('button', { name: 'Menu' });
  check('no keydown listener on the document while the Menu is closed', (await countKeydownListeners()) === 0);
  await menuButton.click();
  check('one keydown listener on the document while the Menu is open', (await countKeydownListeners()) === 1);
  await page.mouse.click(200, 500);
  check('clicking a blank part of the Menu puts focus on the page body', (await getFocusName()) === 'BODY');
  await page.keyboard.press('Escape');
  check('Escape with focus on the page body closes it and returns focus to the Menu button', !(await page.locator('aside').isVisible()) && (await getFocusName()) === 'Menu');
  check('no keydown listener on the document after it closes', (await countKeydownListeners()) === 0);

  await page.goto(`${base}/`);
  await menuButton.click();
  await page.getByRole('link', { name: 'Sessions' }).click();
  await page.getByRole('heading', { name: 'Sessions' }).waitFor();
  await menuButton.click();
  await page.goBack();
  await page.getByRole('heading', { level: 1, name: 'Welcome.' }).waitFor();
  check('Back with the Menu open closes it and shows the page', !(await page.locator('aside').isVisible()) && (await page.locator('main').isVisible()));
  check('Back returns focus to the Menu button', (await getFocusName()) === 'Menu');
  await page.goForward();
  await page.getByRole('heading', { name: 'Sessions' }).waitFor();
  check('Forward leaves it closed', !(await page.locator('aside').isVisible()));
  await context.close();
}

section('Keyboard focus is always visible');
for (const [sizeName, viewport, openMenu] of [['laptop', LAPTOP, false], ['phone', PHONE, true]]) {
  for (const theme of THEMES) {
    for (const [pageName, path] of PAGES) {
      const { context, page } = await openPage({ viewport }, path);
      await page.evaluate((value) => localStorage.setItem('theme', value), theme);
      await page.reload();
      await settle(page);
      const seen = [];
      if (openMenu) {
        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');
        const nextWithMenuClosed = await page.evaluate(() => document.activeElement?.textContent ?? '');
        check(`${sizeName} ${theme} ${pageName}: with the Menu closed, tab skips the hidden sidebar`, !['Home', 'Sessions', 'Light', 'Dark'].includes(nextWithMenuClosed));
        await page.reload();
        await settle(page);
      }
      for (let step = 0; step < 12; step += 1) {
        await page.keyboard.press(openMenu && step === 1 ? 'Enter' : 'Tab');
        if (openMenu && step === 1) await page.keyboard.press('Tab');
        const focused = await page.evaluate(() => {
          const element = document.activeElement;
          if (!element || element === document.body) return null;
          const style = getComputedStyle(element);
          const box = element.getBoundingClientRect();
          return {
            name: element.textContent,
            ring: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`,
            visible: box.width > 0 && box.height > 0,
            matches: element.matches(':focus-visible'),
          };
        });
        if (!focused) break;
        if (seen.some((item) => item.name === focused.name)) break;
        seen.push(focused);
        if (step === 0 && sizeName === 'phone' && theme === 'dark' && pageName === 'home') {
          await page.screenshot({ path: join(shotsDir, 'm1-3-phone-dark-focus.png') });
        }
        if (focused.name === 'Dark' && sizeName === 'laptop' && pageName === 'home') {
          await page.screenshot({ path: join(shotsDir, `m1-3-laptop-${theme}-focus.png`) });
        }
      }
      const accent = hexToRgb(DESIGN_TOKENS.accent[THEMES.indexOf(theme)]);
      const expected = openMenu ? ['Menu', 'Home', 'Sessions', 'Light', 'Dark'] : ['Home', 'Sessions', 'Light', 'Dark'];
      check(`${sizeName} ${theme} ${pageName}: tab reaches every control in order`, seen.map((item) => item.name).join() === expected.join(), seen.map((item) => item.name).join());
      check(`${sizeName} ${theme} ${pageName}: every focused control shows a 2px accent ring`, seen.every((item) => item.visible && item.matches && item.ring === `solid 2px ${accent}`), [...new Set(seen.map((item) => item.ring))].join(' | '));
      await context.close();
    }
  }
}

section('Motion');
{
  const reduced = await openPage({ reducedMotion: 'reduce' });
  const reducedMotion = await reduced.page.evaluate(() => {
    const body = getComputedStyle(document.body);
    const column = getComputedStyle(document.querySelector('main > div'));
    return { transition: body.transitionDuration, animation: column.animationName, running: document.getAnimations().length };
  });
  check('reduced motion removes the theme fade and the page fade', reducedMotion.transition === '0s' && reducedMotion.animation === 'none' && reducedMotion.running === 0, JSON.stringify(reducedMotion));
  await reduced.context.close();

  const normal = await openPage();
  const normalMotion = await normal.page.evaluate(() => {
    const body = getComputedStyle(document.body);
    const column = getComputedStyle(document.querySelector('main > div'));
    return { transition: body.transitionDuration, animation: column.animationName, duration: column.animationDuration, iterations: column.animationIterationCount };
  });
  check('normal motion is one quiet fade', normalMotion.animation === 'arrive' && normalMotion.duration === '0.5s' && normalMotion.iterations === '1', JSON.stringify(normalMotion));
  await normal.page.waitForTimeout(700);
  const atRest = await normal.page.evaluate(() => document.getAnimations().length);
  check('the page is still at rest, so nothing can flash', atRest === 0, `${atRest} running animations`);
  await normal.page.getByRole('link', { name: 'Sessions' }).click();
  await normal.page.getByRole('heading', { name: 'Sessions' }).waitFor();
  const fadeOnChange = await normal.page.evaluate(() => document.getAnimations().map((animation) => animation.animationName));
  check('changing the view runs one fade', fadeOnChange.join() === 'arrive', fadeOnChange.join());
  await normal.context.close();
}

section('Routes');
{
  const { context, page } = await openPage();
  await page.getByRole('link', { name: 'Sessions' }).click();
  await page.getByRole('heading', { name: 'Sessions' }).waitFor();
  check('Sessions has its own address', page.url() === `${base}/sessions`);
  check('Sessions shows the empty state', await page.getByRole('main').getByText('Your sessions will appear here.').isVisible());
  await page.reload();
  check('reload stays on Sessions', (await page.getByRole('heading', { name: 'Sessions' }).isVisible()) && (await page.getByRole('link', { name: 'Sessions' }).getAttribute('aria-current')) === 'page');
  await page.getByRole('link', { name: 'Home' }).click();
  await page.goBack();
  check('Back returns to Sessions', page.url() === `${base}/sessions`);
  await page.goto(`${base}/no-such-page`);
  await page.waitForURL(`${base}/`);
  check('an unknown address opens Home', await page.getByRole('heading', { level: 1 }).isVisible());
  await context.close();
}

section('API connection line on Home');
{
  const { context, page } = await openPage();
  await page.getByText('The API is connected.').waitFor({ timeout: 8000 });
  check('shows connected against the real API', true);
  await page.route('**/api/health', (route) => route.abort());
  await page.reload();
  await page.getByText('The API is not connected.').waitFor({ timeout: 8000 });
  check('shows not connected when the health check fails', true);
  await page.unroute('**/api/health');
  await page.getByText('The API is connected.').waitFor({ timeout: 8000 });
  check('recovers with no reload', true);
  await context.close();
}

await browser.close();
console.log(`\n${failures === 0 ? 'ALL PASSED' : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
