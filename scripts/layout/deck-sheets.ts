import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from 'playwright';

const BOARD = '[data-testid="board"]';
const LAPTOP = { width: 760, height: 752 };
const PHONE = { width: 358, height: 506 };
const WHOLE_DECK = { name: 'm3-5-deck.png', laptopWidth: 240, phoneWidth: 110, columns: 7 };
const ONE_SUBJECT = { laptopWidth: 420, phoneWidth: 200, columns: 3 };
const SHEET_STYLE = 'body{margin:0;padding:16px;background:#fff;font:12px/1.3 Barlow,Arial,sans-serif;color:#111}h1{font-size:18px;margin:0 0 12px}main{display:grid;gap:14px}figure{margin:0}figcaption{margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pair{display:flex;gap:4px;align-items:flex-start}img{display:block;border:1px solid #bbb}';

interface Verdict {
  failures: string[];
  lines: string[];
}

interface SceneShots {
  name: string;
  subject: string;
  light: string;
  dark: string;
}

async function shootScene(page: Page, scene: string, { size, theme }: { size: { width: number; height: number }; theme: string }): Promise<string> {
  await page.evaluate((chosen) => {
    document.documentElement.dataset.theme = chosen;
  }, theme);
  await page.evaluate((request) => window.boardDeck?.show(request), { scene, size, mount: `sheet|${scene}|${size.width}|${theme}` });
  return (await page.locator(BOARD).screenshot()).toString('base64');
}

function getSheetHtml(title: string, shots: readonly SceneShots[], { laptopWidth, phoneWidth, columns }: { laptopWidth: number; phoneWidth: number; columns: number }): string {
  const image = (base64: string, width: number) => `<img width="${width}" src="data:image/png;base64,${base64}">`;
  const tiles = shots.map(({ name, light, dark }) => `<figure style="width:${laptopWidth + phoneWidth + 4}px"><figcaption>${name}</figcaption><div class="pair">${image(light, laptopWidth)}${image(dark, phoneWidth)}</div></figure>`);
  return `<!doctype html><meta charset="utf-8"><style>${SHEET_STYLE}main{grid-template-columns:repeat(${columns},max-content)}</style><h1>${title}</h1><main>${tiles.join('')}</main>`;
}

async function writeSheet(page: Page, { html, path, width }: { html: string; path: string; width: number }): Promise<void> {
  const sheet = await page.context().newPage();
  await sheet.setViewportSize({ width, height: 900 });
  await sheet.setContent(html, { waitUntil: 'load' });
  await sheet.screenshot({ path, fullPage: true });
  await sheet.close();
}

const getSheetWidth = ({ laptopWidth, phoneWidth, columns }: { laptopWidth: number; phoneWidth: number; columns: number }) => columns * (laptopWidth + phoneWidth + 18) + 32;

export async function makeDeckSheets(page: Page, outFolder: string, verdict: Verdict): Promise<void> {
  mkdirSync(outFolder, { recursive: true });
  const scenes = (await page.evaluate(() => window.boardDeck?.listScenes() ?? []));
  const shots: SceneShots[] = [];
  for (const { name, subject } of scenes) shots.push({ name, subject, light: await shootScene(page, name, { size: LAPTOP, theme: 'light' }), dark: await shootScene(page, name, { size: PHONE, theme: 'dark' }) });
  await writeSheet(page, { html: getSheetHtml(`The deck, ${scenes.length} scenes. Laptop in light beside phone in dark, each at rest.`, shots, WHOLE_DECK), path: join(outFolder, WHOLE_DECK.name), width: getSheetWidth(WHOLE_DECK) });
  for (const subject of new Set(scenes.map((scene) => scene.subject))) {
    await writeSheet(page, { html: getSheetHtml(subject, shots.filter((shot) => shot.subject === subject), ONE_SUBJECT), path: join(outFolder, `m3-5-deck-${subject}.png`), width: getSheetWidth(ONE_SUBJECT) });
  }
  writeFileSync(join(outFolder, 'scenes.json'), JSON.stringify(scenes.map(({ name, subject }) => ({ name, subject })), null, 1));
  verdict.lines.push(`Sheets for ${scenes.length} scenes in ${outFolder}`);
}
