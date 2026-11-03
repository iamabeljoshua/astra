import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
import fs from 'node:fs';

export const BASE = process.env.BASE ?? 'http://localhost:5442';
export const OUT = process.env.OUT ?? '/tmp/swarm-m1.3/worker-2';
export const PHONE = { width: 390, height: 844 };
export const LAPTOP = { width: 1440, height: 900 };

export async function launch() {
  return chromium.launch({ channel: 'chrome', headless: true });
}

export async function open(browser, { viewport, reducedMotion = 'no-preference', mobile = false, recordVideoDir } = {}) {
  const context = await browser.newContext({
    viewport,
    reducedMotion,
    colorScheme: 'light',
    ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : { deviceScaleFactor: 2 }),
    ...(recordVideoDir ? { recordVideo: { dir: recordVideoDir, size: viewport } } : {}),
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push('pageerror: ' + error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push('console: ' + message.text());
  });
  page.errors = errors;
  return { context, page };
}

export async function settle(page) {
  await page.waitForFunction(() => document.getAnimations().length === 0, null, { timeout: 5000 });
  await page.evaluate(() => document.fonts.ready.then(() => true));
}

export async function goto(page, path) {
  await page.goto(BASE + path, { waitUntil: 'load' });
  await page.getByRole('heading', { level: 1 }).waitFor();
  await page.waitForFunction(
    () => !document.body.innerText.includes('Checking the API'),
    null,
    { timeout: 8000 },
  );
  await settle(page);
}

export async function sideways(page) {
  const wheelBefore = await page.evaluate(() => window.scrollX);
  await page.mouse.move(100, 100);
  await page.mouse.wheel(300, 0);
  await page.waitForTimeout(80);
  const wheelAfter = await page.evaluate(() => window.scrollX);
  return page.evaluate(({ wheelBefore, wheelAfter }) => {
    const root = document.documentElement;
    window.scrollTo(300, window.scrollY);
    const scriptedTo = window.scrollX;
    window.scrollTo(0, window.scrollY);
    const offenders = [...document.querySelectorAll('body *')]
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return box.width > 0 && (box.right > root.clientWidth + 0.5 || box.left < -0.5);
      })
      .map((element) => `${element.tagName}:${(element.textContent ?? '').slice(0, 24)}`);
    return {
      innerWidth,
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      scriptedTo,
      wheelBefore,
      wheelAfter,
      offenders,
    };
  }, { wheelBefore, wheelAfter });
}

export function describeSideways(result) {
  const ok = result.scrollWidth <= result.clientWidth && result.scriptedTo === 0 && result.wheelAfter === 0 && result.offenders.length === 0;
  return { ok, ...result };
}

// Describes whichever element holds focus, with its computed ring.
export async function describeFocus(page) {
  return page.evaluate(() => {
    const element = document.activeElement;
    if (!element || element === document.body) return { tag: 'BODY' };
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return {
      tag: element.tagName,
      text: element.textContent,
      current: element.getAttribute('aria-current'),
      pressed: element.getAttribute('aria-pressed'),
      expanded: element.getAttribute('aria-expanded'),
      focusVisible: element.matches(':focus-visible'),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineColor: style.outlineColor,
      outlineOffset: style.outlineOffset,
      box: { x: box.x, y: box.y, width: box.width, height: box.height },
      inViewport: box.top >= 0 && box.bottom <= innerHeight && box.left >= 0 && box.right <= innerWidth,
    };
  });
}

function decode(buffer) {
  return PNG.sync.read(buffer);
}

// Renders focus with and without its ring, then reports exactly which pixels the ring changed.
export async function measureRing(page, box, savePath) {
  const pad = 8;
  const clip = {
    x: Math.max(0, box.x - pad),
    y: Math.max(0, box.y - pad),
    width: box.width + pad * 2,
    height: box.height + pad * 2,
  };
  const viewport = page.viewportSize();
  clip.width = Math.min(clip.width, viewport.width - clip.x);
  clip.height = Math.min(clip.height, viewport.height - clip.y);
  const withRingBuffer = await page.screenshot({ clip, animations: 'disabled' });
  const styleHandle = await page.addStyleTag({ content: '*:focus-visible{outline:none !important}' });
  const withoutRingBuffer = await page.screenshot({ clip, animations: 'disabled' });
  await styleHandle.evaluate((node) => node.remove());
  const withRing = decode(withRingBuffer);
  const withoutRing = decode(withoutRingBuffer);
  const scale = withRing.width / clip.width;
  let changed = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < withRing.height; y += 1) {
    for (let x = 0; x < withRing.width; x += 1) {
      const index = (y * withRing.width + x) * 4;
      const differs =
        Math.abs(withRing.data[index] - withoutRing.data[index]) +
          Math.abs(withRing.data[index + 1] - withoutRing.data[index + 1]) +
          Math.abs(withRing.data[index + 2] - withoutRing.data[index + 2]) >
        30;
      if (differs) {
        changed += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (savePath) fs.writeFileSync(savePath, withRingBuffer);
  const elementLeft = (box.x - clip.x) * scale;
  const elementTop = (box.y - clip.y) * scale;
  const elementRight = elementLeft + box.width * scale;
  const elementBottom = elementTop + box.height * scale;
  return {
    changedPixels: changed,
    ringSides: {
      left: minX < elementLeft,
      top: minY < elementTop,
      right: maxX >= elementRight,
      bottom: maxY >= elementBottom,
    },
    ringBoxCssPx: changed
      ? {
          x: clip.x + minX / scale,
          y: clip.y + minY / scale,
          width: (maxX - minX + 1) / scale,
          height: (maxY - minY + 1) / scale,
        }
      : null,
  };
}

export async function composeSheet(browser, { images, columns, outPath, width = 1500, background = '#808080' }) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const cells = images
    .map(({ path, label }) => {
      const data = fs.readFileSync(path).toString('base64');
      return `<figure style="margin:0"><figcaption style="font:14px sans-serif;color:#fff;padding:4px 0">${label}</figcaption><img src="data:image/png;base64,${data}" style="width:100%;display:block;border:1px solid #000"/></figure>`;
    })
    .join('');
  await page.setContent(
    `<!doctype html><body style="margin:0;background:${background};padding:12px"><div style="display:grid;grid-template-columns:repeat(${columns},1fr);gap:12px">${cells}</div></body>`,
  );
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: outPath, fullPage: true });
  await context.close();
}
