// For one letter at a time, which font file the browser fetches and which font it draws the letter with.
import { chromium } from 'playwright-core';
const BASE = process.env.BASE;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
for (const letter of ['Ṣ', 'ṣ', 'Ṅ', 'ṅ', 'Ǹ', 'ǹ', 'Ọ', 'Ẹ']) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE}/sessions`);
  await page.getByRole('heading', { level: 1 }).waitFor();
  await page.waitForTimeout(400);
  const fetched = [];
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith('/fonts/')) fetched.push(pathname.replace('/fonts/', ''));
  });
  await page.evaluate((text) => {
    const span = document.createElement('span');
    span.id = 'probe';
    span.textContent = text;
    span.style.fontWeight = '400';
    document.querySelector('aside').append(span);
  }, letter);
  await page.waitForTimeout(700);
  const client = await context.newCDPSession(page);
  await client.send('DOM.enable');
  await client.send('CSS.enable');
  const { root } = await client.send('DOM.getDocument', { depth: 0 });
  const { nodeId } = await client.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#probe' });
  const { fonts } = await client.send('CSS.getPlatformFontsForNode', { nodeId });
  console.log(`${letter} U+${letter.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')} fetched ${JSON.stringify(fetched)} drawn with ${fonts.map((font) => `${font.isCustomFont ? 'WEB' : 'SYS'} ${font.postScriptName}`).join(', ')}`);
  await context.close();
}
await browser.close();
