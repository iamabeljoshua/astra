// Prints the device pixel rows or columns across each ring edge, to explain an edge that reads under 100%.
import { PNG } from 'pngjs';
import { describeFocus, goto, LAPTOP, launch, open } from './lib.mjs';

const browser = await launch();

const toHex = (data, index) => [0, 1, 2].map((offset) => data[index + offset].toString(16).padStart(2, '0')).join('');

function printRows({ image, scale, x, fromY, toY, label }) {
  const pixelX = Math.round(x * scale);
  const cells = [];
  for (let pixelY = Math.floor(fromY * scale); pixelY < Math.ceil(toY * scale); pixelY += 1) {
    cells.push(`${pixelY}:${toHex(image.data, (pixelY * image.width + pixelX) * 4)}`);
  }
  console.log(`${label}  ${cells.join(' ')}`);
}

function printColumns({ image, scale, y, fromX, toX, label }) {
  const pixelY = Math.round(y * scale);
  const cells = [];
  for (let pixelX = Math.floor(fromX * scale); pixelX < Math.ceil(toX * scale); pixelX += 1) {
    cells.push(`${pixelX}:${toHex(image.data, (pixelY * image.width + pixelX) * 4)}`);
  }
  console.log(`${label}  ${cells.join(' ')}`);
}

for (const theme of ['light', 'dark']) {
  for (const path of ['/', '/sessions']) {
    const { context, page } = await open(browser, { viewport: LAPTOP });
    await context.addInitScript((value) => localStorage.setItem('theme', value), theme);
    await goto(page, path);
    console.log(`--- ${theme} ${path}`);
    for (const stop of ['Home', 'Sessions', 'Light', 'Dark']) {
      await page.keyboard.press('Tab');
      const focus = await describeFocus(page);
      const { x, y, width, height } = focus.box;
      const image = PNG.sync.read(await page.screenshot({ animations: 'disabled' }));
      const scale = image.width / LAPTOP.width;
      console.log(`${stop} box y=${y} bottom=${y + height} x=${x} right=${x + width} ring=${focus.outlineColor}`);
      printRows({ image, scale, x: x + width / 2, fromY: y - 5, toY: y - 1, label: '  above' });
      printRows({ image, scale, x: x + width / 2, fromY: y + height + 1, toY: y + height + 5, label: '  below' });
      printColumns({ image, scale, y: y + height / 2, fromX: x - 5, toX: x - 1, label: '  left ' });
      printColumns({ image, scale, y: y + height / 2, fromX: x + width + 1, toX: x + width + 5, label: '  right' });
    }
    await context.close();
  }
}
await browser.close();
