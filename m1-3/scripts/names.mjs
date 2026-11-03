// Usage: BASE=http://localhost:5411 OUT=<file.png> node names.mjs
// Renders real Yoruba and Igbo names in the running app's own font stacks, and names the font Chrome drew each with.
import { chromium } from 'playwright-core';

const { BASE, OUT } = process.env;
const NAMES = ['Ṣade', 'Ọṣun', 'Ṅke', 'Aṅụ', 'Ǹnamdi', 'Adébáyọ̀'];
const SAMPLES = [
  ['--font-ui', 400],
  ['--font-ui', 500],
  ['--font-ui', 600],
  ['--font-voice', 400],
];

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1000, height: 330 }, deviceScaleFactor: 2 });
const page = await context.newPage();
await page.goto(`${BASE}/sessions`);
await page.getByRole('heading', { level: 1 }).waitFor();

const stack = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--font-ui'));
console.log(`--font-ui: ${stack}`);

await page.evaluate(
  ({ names, samples }) => {
    const host = document.createElement('div');
    host.id = 'probe';
    host.style.cssText = 'position:fixed;inset:0;z-index:99;background:var(--color-paper);color:var(--color-ink);padding:16px;';
    for (const [family, weight] of samples) {
      const row = document.createElement('div');
      row.style.cssText = `font-family:var(${family});font-weight:${weight};font-size:44px;line-height:1.5;white-space:nowrap`;
      for (const name of names) {
        const word = document.createElement('span');
        word.dataset.sample = `${family} ${weight}`;
        word.style.marginRight = '28px';
        word.textContent = name;
        row.append(word);
      }
      host.append(row);
    }
    document.body.append(host);
  },
  { names: NAMES, samples: SAMPLES },
);
await page.waitForFunction(() => document.fonts.status === 'loaded');
await page.waitForTimeout(500);

const client = await context.newCDPSession(page);
await client.send('DOM.enable');
await client.send('CSS.enable');
const { root } = await client.send('DOM.getDocument', { depth: 0 });
const { nodeIds } = await client.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '#probe span' });
const details = await page.evaluate(() =>
  [...document.querySelectorAll('#probe span')].map((word) => `${word.dataset.sample.padEnd(18)} ${word.textContent}`),
);
for (const [index, nodeId] of nodeIds.entries()) {
  const { fonts } = await client.send('CSS.getPlatformFontsForNode', { nodeId });
  const used = fonts.map((font) => `${font.isCustomFont ? 'WEB' : 'SYS'} ${font.postScriptName} x${font.glyphCount}`);
  console.log(`${details[index].padEnd(32)} ${used.join(' + ')}`);
}
await page.screenshot({ path: OUT });
await browser.close();
