import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { getSceneStoreRoot } from '../scene-settings.ts';
import { createSceneStore, getSceneKey } from '../scene-store.ts';
import { SCENE_THEMES, type StoredScene } from '../scene-types.ts';
import { getLibraryList, type LibraryEntry } from './library-list.ts';

const FRAMES_A_SHEET = 6;
const CELL_WIDTH = 960;
const CELL_HEIGHT = 540;
const CELL_STEP_X = 968;
const CELL_STEP_Y = 576;
const CAPTION_HEIGHT = 28;
const SHOWN_WIDTH = 320;
const SCALE = SHOWN_WIDTH / CELL_WIDTH;
const SCENES_A_PAGE = 24;
const PAGE_WIDTH = 1990;
const FIRST_FRAME_SECONDS = 1.2;
const SECONDS_AFTER_MOMENT = 1.3;
const PNG_WIDTH_OFFSET = 16;

interface ShownScene {
  entry: LibraryEntry;
  scene: StoredScene;
}

// The worker draws the first frame, one after each moment, and the end, in time order, on sheets of six in two columns. Each theme's sheets follow the last.
function getFrameCount({ moments, durationSeconds }: StoredScene): number {
  const afterMoments = Object.values(moments).map((seconds) => Math.min(seconds + SECONDS_AFTER_MOMENT, durationSeconds));
  return new Set([Math.min(FIRST_FRAME_SECONDS, durationSeconds), ...afterMoments]).size + 1;
}

function getFrameHtml({ folder, sheetIndex, frameIndex }: { folder: string; sheetIndex: number; frameIndex: number }): string {
  const path = join(folder, `sheet-${sheetIndex}.png`);
  const sheetWidth = readFileSync(path).readUInt32BE(PNG_WIDTH_OFFSET);
  const left = (frameIndex % 2) * CELL_STEP_X * SCALE;
  const top = (Math.floor(frameIndex / 2) * CELL_STEP_Y + CAPTION_HEIGHT) * SCALE;
  return `<div class="frame" style="background-image:url('file://${path}');background-size:${sheetWidth * SCALE}px auto;background-position:-${left}px -${top}px"></div>`;
}

function getSceneHtml({ entry, scene }: ShownScene, storeRoot: string, themeIndex: number): string {
  const folder = join(storeRoot, 'scenes', scene.id);
  const frameCount = getFrameCount(scene);
  const sheetsATheme = Math.ceil(frameCount / FRAMES_A_SHEET);
  const firstSheet = themeIndex * sheetsATheme;
  const first = getFrameHtml({ folder, sheetIndex: firstSheet, frameIndex: 0 });
  const last = getFrameHtml({ folder, sheetIndex: firstSheet + sheetsATheme - 1, frameIndex: (frameCount - 1) % FRAMES_A_SHEET });
  const notes = scene.layoutNotes.length > 0 ? ` <b>${scene.layoutNotes.length} layout note${scene.layoutNotes.length === 1 ? '' : 's'}</b>` : '';
  return `<figure><div class="pair">${first}${last}</div><figcaption>${entry.id}: ${entry.title}${notes}</figcaption></figure>`;
}

const getPageHtml = (scenes: readonly ShownScene[], storeRoot: string, themeIndex: number) =>
  `<!doctype html><meta charset="utf-8"><style>
body{margin:0;padding:12px;background:${themeIndex === 0 ? '#F6F1E6;color:#1B1815' : '#000;color:#FFFBF5'};font:13px/1.3 Helvetica,Arial,sans-serif}
main{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
figure{margin:0}.pair{display:flex;gap:2px}
.frame{width:${SHOWN_WIDTH}px;height:${CELL_HEIGHT * SCALE}px;background-repeat:no-repeat;outline:1px solid #8884}
</style><main>${scenes.map((shown) => getSceneHtml(shown, storeRoot, themeIndex)).join('')}</main>`;

const { values: args } = parseArgs({ options: { out: { type: 'string' } } });
const storeRoot = resolve(getSceneStoreRoot());
const store = createSceneStore(storeRoot);
const outFolder = args.out ?? join(storeRoot, 'library-run', 'contact');
mkdirSync(outFolder, { recursive: true });
const shown = getLibraryList().flatMap((entry) => {
  const scene = store.find(getSceneKey(entry.title));
  return scene ? [{ entry, scene }] : [];
});
const browser = await chromium.launch({ args: ['--use-mock-keychain', '--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: PAGE_WIDTH, height: 1000 } });
for (const [themeIndex, theme] of SCENE_THEMES.entries()) {
  for (let start = 0; start * SCENES_A_PAGE < shown.length; start += 1) {
    const name = `page-${start + 1}-${theme}`;
    const htmlPath = join(outFolder, `${name}.html`);
    writeFileSync(htmlPath, getPageHtml(shown.slice(start * SCENES_A_PAGE, (start + 1) * SCENES_A_PAGE), storeRoot, themeIndex));
    await page.goto(`file://${htmlPath}`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: join(outFolder, `${name}.png`), fullPage: true });
    console.log(join(outFolder, `${name}.png`));
  }
}
await browser.close();
console.log(JSON.stringify({ scenes: shown.length, of: getLibraryList().length }));
