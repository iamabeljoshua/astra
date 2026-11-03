// Captures the app and the prototype at rest, then counts differing pixels against the listed differences.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { BASE, PROTO, SCRATCH, launch, openPage, waitForLoadedHome } from './lib.mjs';

const [label, oldLabel] = process.argv.slice(2);
const OUT = `${SCRATCH}/shots/${label}`;
mkdirSync(OUT, { recursive: true });
const SIZES = [[1440, 900], [1366, 768], [1280, 720], [390, 844]];
const THEMES = ['light', 'dark'];
const browser = await launch();

async function captureApp(width, height, theme) {
  const { context, page } = await openPage(browser, { width, height, theme });
  await waitForLoadedHome(page);
  const key = `${width}x${height}-${theme}`;
  await page.screenshot({ path: `${OUT}/app-${key}.png` });
  await page.screenshot({ path: `${OUT}/app-full-${key}.png`, fullPage: true });
  const boxes = await page.evaluate(() => {
    const rect = (element) => { const box = element.getBoundingClientRect(); return { x: box.x, y: box.y, w: box.width, h: box.height }; };
    const picks = [...document.querySelectorAll('main ul button')];
    return {
      sidebar: document.querySelector('aside') && rect(document.querySelector('aside')),
      wave: rect(picks[1].querySelector('span[aria-hidden]')),
      labels: picks.map((pick) => rect(pick.querySelector('.label'))),
    };
  });
  await context.close();
  return boxes;
}

async function captureProto(width, height, theme) {
  const { context, page } = await openPage(browser, { width, height });
  await page.goto(`${PROTO}#home-${theme}-still`);
  await page.waitForSelector('.hello');
  await page.addStyleTag({ content: ':root{--strip:0px !important}.strip{display:none !important}' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  const key = `${width}x${height}-${theme}`;
  await page.screenshot({ path: `${OUT}/proto-${key}.png` });
  await context.close();
}

const inside = (box, x, y) => box && box.w > 0 && x >= box.x - 1 && x <= box.x + box.w + 1 && y >= box.y - 1 && y <= box.y + box.h + 1;

function countAgainstPrototype(key, boxes) {
  const proto = PNG.sync.read(readFileSync(`${OUT}/proto-${key}.png`));
  const app = PNG.sync.read(readFileSync(`${OUT}/app-${key}.png`));
  const counts = { sidebar: 0, wave: 0, labels: 0, elsewhere: 0 };
  const samples = [];
  for (let y = 0; y < app.height; y += 1) {
    for (let x = 0; x < app.width; x += 1) {
      const index = (app.width * y + x) << 2;
      if (proto.data[index] === app.data[index] && proto.data[index + 1] === app.data[index + 1] && proto.data[index + 2] === app.data[index + 2]) continue;
      if (inside(boxes.sidebar, x, y)) counts.sidebar += 1;
      else if (inside(boxes.wave, x, y)) counts.wave += 1;
      else if (boxes.labels.some((box) => inside({ ...box, w: box.w + 40, h: box.h + 2 }, x, y))) counts.labels += 1;
      else {
        counts.elsewhere += 1;
        if (samples.length < 4) samples.push([x, y]);
      }
    }
  }
  return { ...counts, samples };
}

function countExact(pathA, pathB) {
  const a = PNG.sync.read(readFileSync(pathA));
  const b = PNG.sync.read(readFileSync(pathB));
  if (a.width !== b.width || a.height !== b.height) return `size differs ${a.width}x${a.height} vs ${b.width}x${b.height}`;
  let changed = 0;
  for (let index = 0; index < a.data.length; index += 4) {
    if (a.data[index] !== b.data[index] || a.data[index + 1] !== b.data[index + 1] || a.data[index + 2] !== b.data[index + 2]) changed += 1;
  }
  return changed;
}

const report = {};
for (const [width, height] of SIZES) {
  for (const theme of THEMES) {
    const key = `${width}x${height}-${theme}`;
    const boxes = await captureApp(width, height, theme);
    await captureProto(width, height, theme);
    const row = { againstPrototype: countAgainstPrototype(key, boxes) };
    if (oldLabel) {
      row.againstOldBuildViewport = countExact(`${SCRATCH}/shots/${oldLabel}/app-${key}.png`, `${OUT}/app-${key}.png`);
      row.againstOldBuildFullPage = countExact(`${SCRATCH}/shots/${oldLabel}/app-full-${key}.png`, `${OUT}/app-full-${key}.png`);
    }
    report[key] = row;
    console.log(key, JSON.stringify(row));
  }
}
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
await browser.close();
