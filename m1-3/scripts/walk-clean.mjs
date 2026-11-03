// A clean Tab walk per page, theme and width, measuring how much of each ring edge actually paints.
import { BASE, composeSheet, describeFocus, goto, LAPTOP, launch, open, OUT, PHONE, settle } from './lib.mjs';
import { PNG } from 'pngjs';
import fs from 'node:fs';

const browser = await launch();
const rows = [];

function parseRgb(text) {
  return text.match(/[\d.]+/g).map(Number).slice(0, 3);
}

async function edgeCoverage(page, focus) {
  const buffer = await page.screenshot({ animations: 'disabled' });
  const image = PNG.sync.read(buffer);
  const scale = image.width / page.viewportSize().width;
  const color = parseRgb(focus.outlineColor);
  const { x, y, width, height } = focus.box;
  const outerLeft = x - 4;
  const outerTop = y - 4;
  const outerRight = x + width + 4;
  const outerBottom = y + height + 4;
  const edges = {
    top: [outerLeft, outerTop, outerRight, outerTop + 2],
    bottom: [outerLeft, outerBottom - 2, outerRight, outerBottom],
    left: [outerLeft, outerTop, outerLeft + 2, outerBottom],
    right: [outerRight - 2, outerTop, outerRight, outerBottom],
  };
  const coverage = {};
  for (const [edgeName, [left, top, right, bottom]] of Object.entries(edges)) {
    let matching = 0;
    let total = 0;
    for (let pixelY = Math.ceil(top * scale); pixelY < Math.floor(bottom * scale); pixelY += 1) {
      for (let pixelX = Math.ceil(left * scale); pixelX < Math.floor(right * scale); pixelX += 1) {
        total += 1;
        const index = (pixelY * image.width + pixelX) * 4;
        const distance = Math.abs(image.data[index] - color[0]) + Math.abs(image.data[index + 1] - color[1]) + Math.abs(image.data[index + 2] - color[2]);
        if (distance < 40) matching += 1;
      }
    }
    coverage[edgeName] = Math.round((100 * matching) / Math.max(total, 1));
  }
  return { coverage, buffer };
}

async function record({ page, label, stopNumber, images }) {
  const focus = await describeFocus(page);
  if (focus.tag === 'BODY') {
    rows.push({ label, stop: stopNumber, control: 'left the page' });
    return false;
  }
  const { coverage } = await edgeCoverage(page, focus);
  const pad = 10;
  const clip = {
    x: Math.max(0, focus.box.x - pad),
    y: Math.max(0, focus.box.y - pad),
    width: Math.min(focus.box.width + pad * 2, page.viewportSize().width - Math.max(0, focus.box.x - pad)),
    height: focus.box.height + pad * 2,
  };
  const path = `${OUT}/edge-${label.replaceAll(' ', '-')}-${stopNumber}-${focus.text.toLowerCase()}.png`;
  await page.screenshot({ path, clip, animations: 'disabled' });
  const incomplete = Object.values(coverage).some((value) => value < 90);
  images.push({ path, label: `${label} ${stopNumber} ${focus.text}${incomplete ? ' (edge missing)' : ''}` });
  rows.push({ label, stop: stopNumber, control: focus.text, focusVisible: focus.focusVisible, inView: focus.inViewport, coverage });
  return true;
}

for (const theme of ['light', 'dark']) {
  const phoneImages = [];
  const laptopImages = [];
  for (const [pageName, path] of [['home', '/'], ['sessions', '/sessions']]) {
    // Phone: Menu button with Menu closed, Enter to open, then on through the Menu.
    {
      const { context, page } = await open(browser, { viewport: PHONE });
      await context.addInitScript((value) => localStorage.setItem('theme', value), theme);
      await goto(page, path);
      await page.keyboard.press('Tab');
      await record({ page, label: `phone ${theme} ${pageName} closed`, stopNumber: 1, images: phoneImages });
      await page.keyboard.press('Tab');
      await record({ page, label: `phone ${theme} ${pageName} closed`, stopNumber: 2, images: phoneImages });

      await goto(page, path);
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      await settle(page);
      let stopNumber = 1;
      await record({ page, label: `phone ${theme} ${pageName} open`, stopNumber, images: phoneImages });
      let alive = true;
      while (alive && stopNumber < 8) {
        await page.keyboard.press('Tab');
        stopNumber += 1;
        alive = await record({ page, label: `phone ${theme} ${pageName} open`, stopNumber, images: phoneImages });
      }
      await context.close();
    }
    // Laptop.
    {
      const { context, page } = await open(browser, { viewport: LAPTOP });
      await context.addInitScript((value) => localStorage.setItem('theme', value), theme);
      await goto(page, path);
      let stopNumber = 0;
      let alive = true;
      while (alive && stopNumber < 8) {
        await page.keyboard.press('Tab');
        stopNumber += 1;
        alive = await record({ page, label: `laptop ${theme} ${pageName}`, stopNumber, images: laptopImages });
      }
      await context.close();
    }
  }
  await composeSheet(browser, { images: phoneImages, columns: 5, outPath: `${OUT}/edges-phone-${theme}.png`, width: 1800 });
  await composeSheet(browser, { images: laptopImages, columns: 4, outPath: `${OUT}/edges-laptop-${theme}.png`, width: 1400 });
}

fs.writeFileSync(`${OUT}/walk-clean.json`, JSON.stringify(rows, null, 2));
for (const row of rows) {
  if (!row.coverage) {
    console.log(`${row.label} | ${row.stop} ${row.control}`);
    continue;
  }
  const { top, bottom, left, right } = row.coverage;
  const flag = [top, bottom, left, right].some((value) => value < 90) ? ' <-- EDGE MISSING' : '';
  console.log(`${row.label} | ${row.stop} ${row.control} fv=${row.focusVisible} inView=${row.inView} | T${top} B${bottom} L${left} R${right}${flag}`);
}
await browser.close();
