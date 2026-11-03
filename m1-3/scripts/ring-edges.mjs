// Usage: BASE=<url> OUT=<dir> node ring-edges.mjs
// For each ring edge, the share of positions along it where the full 2px ring (4 device pixels) really paints.
// Each stop runs twice: as shipped, and with the lift removed by a style tag as a control.
import { PNG } from 'pngjs';
import { composeSheet, describeFocus, goto, LAPTOP, launch, open, OUT, PHONE, settle } from './lib.mjs';

const RING_DEVICE_PIXELS = 4;
const REMOVE_LIFT = '*:focus-visible{position:static !important;z-index:auto !important}';

const browser = await launch();

const parseRgb = (text) => text.match(/[\d.]+/g).map(Number).slice(0, 3);

function getEdgeCoverage(image, scale, box, ringColor) {
  const matches = (pixelX, pixelY) => {
    const index = (pixelY * image.width + pixelX) * 4;
    const distance = [0, 1, 2].reduce((sum, channel) => sum + Math.abs(image.data[index + channel] - ringColor[channel]), 0);
    return distance < 40;
  };
  const left = Math.ceil((box.x - 2) * scale);
  const right = Math.floor((box.x + box.width + 2) * scale);
  const top = Math.ceil((box.y - 2) * scale);
  const bottom = Math.floor((box.y + box.height + 2) * scale);

  const hasFullRun = (pixels) => {
    let run = 0;
    for (const isRing of pixels) {
      run = isRing ? run + 1 : 0;
      if (run >= RING_DEVICE_PIXELS) return true;
    }
    return false;
  };
  const range = (from, to) => Array.from({ length: Math.max(to - from, 0) }, (_, offset) => from + offset);
  const SLACK = 2;
  const getBand = (innerEdge, outerEdge) => range(Math.floor(innerEdge * scale) - SLACK, Math.ceil(outerEdge * scale) + SLACK);
  const getShare = (positions, isFull) => Math.round((100 * positions.filter(isFull).length) / Math.max(positions.length, 1));

  const columns = range(left, right);
  const rows = range(top, bottom);
  const topBand = getBand(box.y - 4, box.y - 2);
  const bottomBand = getBand(box.y + box.height + 2, box.y + box.height + 4);
  const leftBand = getBand(box.x - 4, box.x - 2);
  const rightBand = getBand(box.x + box.width + 2, box.x + box.width + 4);
  return {
    top: getShare(columns, (x) => hasFullRun(topBand.map((y) => matches(x, y)))),
    bottom: getShare(columns, (x) => hasFullRun(bottomBand.map((y) => matches(x, y)))),
    left: getShare(rows, (y) => hasFullRun(leftBand.map((x) => matches(x, y)))),
    right: getShare(rows, (y) => hasFullRun(rightBand.map((x) => matches(x, y)))),
  };
}

async function measure(page, label, shots) {
  const focus = await describeFocus(page);
  const ringColor = parseRgb(focus.outlineColor);
  const run = async (name) => {
    const image = PNG.sync.read(await page.screenshot({ animations: 'disabled' }));
    const scale = image.width / page.viewportSize().width;
    const pad = 8;
    const clip = { x: Math.max(focus.box.x - pad, 0), y: Math.max(focus.box.y - pad, 0), width: focus.box.width + pad * 2, height: focus.box.height + pad * 2 };
    const path = `${OUT}/ring-${label.replaceAll(' ', '-')}-${focus.text.toLowerCase()}-${name}.png`;
    await page.screenshot({ path, clip, animations: 'disabled' });
    shots.push({ path, label: `${label} ${focus.text} ${name}` });
    return getEdgeCoverage(image, scale, focus.box, ringColor);
  };
  const shipped = await run('shipped');
  const style = await page.addStyleTag({ content: REMOVE_LIFT });
  const control = await run('no-lift');
  await style.evaluate((node) => node.remove());
  const format = ({ top, bottom, left, right }) => `T${top} B${bottom} L${left} R${right}`;
  console.log(`${label.padEnd(30)} ${focus.text.padEnd(9)} shipped ${format(shipped).padEnd(24)} no lift ${format(control)}`);
}

for (const theme of ['light', 'dark']) {
  const shots = [];
  for (const path of ['/', '/sessions']) {
    const pageName = path === '/' ? 'home' : 'sessions';
    const { context, page } = await open(browser, { viewport: LAPTOP });
    await context.addInitScript((value) => localStorage.setItem('theme', value), theme);
    await goto(page, path);
    for (let stop = 0; stop < 4; stop += 1) {
      await page.keyboard.press('Tab');
      await measure(page, `laptop ${theme} ${pageName}`, shots);
    }
    await context.close();

    const phone = await open(browser, { viewport: PHONE });
    await phone.context.addInitScript((value) => localStorage.setItem('theme', value), theme);
    await goto(phone.page, path);
    await phone.page.keyboard.press('Tab');
    await phone.page.keyboard.press('Enter');
    await settle(phone.page);
    for (let stop = 0; stop < 4; stop += 1) {
      await phone.page.keyboard.press('Tab');
      await measure(phone.page, `phone ${theme} ${pageName}`, shots);
    }
    await phone.context.close();
  }
  const picked = shots.filter(({ label }) => /laptop .* sessions (Home|Light|Dark)/.test(label));
  await composeSheet(browser, { images: picked, columns: 2, outPath: `${OUT}/ring-compare-${theme}.png`, width: 900 });
}
await browser.close();
