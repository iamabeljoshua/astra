// Usage: BASE=<url> OUT=<dir> PROTOTYPE=<preview.html> node capture.mjs
// Saves the shell at laptop and phone widths in light and dark, the prototype at the same sizes, and labelled comparisons.
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const { BASE, OUT, PROTOTYPE } = process.env;
mkdirSync(OUT, { recursive: true });

const STRIP_HEIGHT = 32;
const LAPTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const THEMES = ['light', 'dark'];
const PAGES = [['home', '/'], ['sessions', '/sessions']];

const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function settle(page) {
  await page.getByRole('heading', { level: 1 }).waitFor();
  await page.waitForFunction(() => document.fonts.status === 'loaded');
  await page.waitForFunction(() => !document.body.innerText.includes('Checking the API'));
  await page.waitForFunction(() => document.getAnimations().length === 0);
}

async function captureApp(theme) {
  for (const [sizeName, viewport] of [['laptop', LAPTOP], ['phone', PHONE]]) {
    const context = await browser.newContext({ viewport, colorScheme: 'light' });
    await context.addInitScript((value) => localStorage.setItem('theme', value), theme);
    const page = await context.newPage();
    for (const [pageName, path] of PAGES) {
      await page.goto(BASE + path);
      await settle(page);
      await page.screenshot({ path: `${OUT}/m1-3-${sizeName}-${theme}-${pageName}.png` });
      if (sizeName === 'phone') {
        await page.getByRole('button', { name: 'Menu' }).click();
        await page.waitForFunction(() => document.getAnimations().length === 0);
        await page.screenshot({ path: `${OUT}/m1-3-phone-${theme}-${pageName}-menu.png` });
      }
    }
    await context.close();
  }
}

async function captureProto(theme) {
  for (const [sizeName, viewport] of [['laptop', LAPTOP], ['phone', PHONE]]) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height + STRIP_HEIGHT } });
    await context.addInitScript((value) => localStorage.setItem('astra-theme', value), theme);
    const page = await context.newPage();
    for (const [pageName] of PAGES) {
      await page.goto(`file://${PROTOTYPE}#${pageName}-bottom-still`);
      await page.reload();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `${OUT}/proto-${sizeName}-${theme}-${pageName}.png` });
    }
    await context.close();
  }
}

async function compose({ left, leftLabel, right, rightLabel, out, width }) {
  const page = await browser.newPage({ viewport: { width, height: 100 } });
  const cell = (path, label) =>
    `<figure style="margin:0"><figcaption style="font:14px sans-serif;color:#111;padding:0 0 6px">${label}</figcaption><img style="width:100%;display:block;outline:1px solid #888" src="data:image/png;base64,${readFileSync(path).toString('base64')}"></figure>`;
  await page.setContent(
    `<!doctype html><body style="margin:0;padding:12px;background:#fff"><div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">${cell(left, leftLabel)}${cell(right, rightLabel)}</div></body>`,
  );
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: out, fullPage: true });
  await page.close();
}

for (const theme of THEMES) {
  await captureApp(theme);
  await captureProto(theme);
  for (const [pageName] of PAGES) {
    await compose({
      left: `${OUT}/proto-laptop-${theme}-${pageName}.png`,
      leftLabel: `Prototype, ${pageName}, ${theme}, with its 32px strip on top`,
      right: `${OUT}/m1-3-laptop-${theme}-${pageName}.png`,
      rightLabel: `App, ${pageName}, ${theme}`,
      out: `${OUT}/m1-3-compare-laptop-${theme}-${pageName}.png`,
      width: 1800,
    });
    await compose({
      left: `${OUT}/proto-phone-${theme}-${pageName}.png`,
      leftLabel: `Prototype, ${pageName}, ${theme}, with its 32px strip on top`,
      right: `${OUT}/m1-3-phone-${theme}-${pageName}.png`,
      rightLabel: `App, ${pageName}, ${theme}`,
      out: `${OUT}/m1-3-compare-phone-${theme}-${pageName}.png`,
      width: 820,
    });
  }
}
await browser.close();
