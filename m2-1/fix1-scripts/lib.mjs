import { chromium, webkit } from 'playwright';

export const SCRATCH = '/private/tmp/claude-501/-Users-abel-startup-einstain-ai/043bc9b9-6c62-4e41-9461-4fb93f368259/scratchpad/m2-1-fix1';
export const BASE = 'http://127.0.0.1:5511';
export const PROTO = `file://${SCRATCH}/proto/preview.html`;
const WEBKIT_PATH = `${SCRATCH}/browsers/webkit-2370/pw_run.sh`;

export function launch(kind = 'chromium') {
  return kind === 'webkit' ? webkit.launch({ executablePath: WEBKIT_PATH }) : chromium.launch();
}

export const setMode = (params) => fetch(`${BASE}/__mode?${new URLSearchParams(params)}`);

export async function openPage(browser, { width, height, theme, ...options }) {
  const context = await browser.newContext({ viewport: { width, height }, ...options });
  if (theme) await context.addInitScript((chosen) => { try { localStorage.setItem('theme', chosen); } catch {} }, theme);
  const page = await context.newPage();
  return { context, page };
}

export async function waitForLoadedHome(page) {
  await page.goto(`${BASE}/`);
  await page.getByRole('heading', { level: 1, name: /Maya/ }).waitFor();
  await page.waitForFunction(() => document.querySelectorAll('main ul li').length >= 6);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(650);
}

export const getTextBox = (page) => page.getByRole('textbox', { name: 'What do you want to learn next' });
