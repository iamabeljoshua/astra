// Puts two images one above the other, labelled, for the before and after of a name.
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
const [before, after, out, topLabel, bottomLabel] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1000, height: 100 } });
const cell = (path, label) => `<figure style="margin:0 0 12px"><figcaption style="font:16px sans-serif;padding:4px 0">${label}</figcaption><img style="width:100%;display:block;border:1px solid #888" src="data:image/png;base64,${readFileSync(path).toString('base64')}"></figure>`;
await page.setContent(`<!doctype html><body style="margin:0;padding:12px;background:#fff">${cell(before, topLabel)}${cell(after, bottomLabel)}</body>`);
await page.waitForLoadState('networkidle');
await page.screenshot({ path: out, fullPage: true });
await browser.close();
