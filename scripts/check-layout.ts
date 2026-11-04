import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { type Page } from 'playwright';
import { type DeckBrowser, type DeckServer, openDeckBrowser, REPO_ROOT, startDeckServer } from './layout/deck-server.ts';
import { runFlashCheck } from './layout/flash-check.ts';
import { runFrameRates } from './layout/frame-rates.ts';
import { runPagePlants, runSourcePlants } from './layout/plants.ts';
import { makeDeckSheets } from './layout/deck-sheets.ts';
import { type DeckSurface, runSweeps } from './layout/sweeps.ts';

const FEWEST_SCENES = 100;
const SURFACES: readonly DeckSurface[] = ['rows', 'view'];

const { values: flags } = parseArgs({
  options: {
    quick: { type: 'boolean', default: false },
    'plants-only': { type: 'boolean', default: false },
    'no-plants': { type: 'boolean', default: false },
    flash: { type: 'boolean', default: false },
    'no-flash': { type: 'boolean', default: false },
    scene: { type: 'string', multiple: true },
    sheets: { type: 'string' },
    rates: { type: 'string' },
    surface: { type: 'string', default: 'rows' },
    out: { type: 'string', default: join(REPO_ROOT, '.layout-check') },
  },
});

if (!SURFACES.includes(flags.surface as DeckSurface)) throw new Error(`--surface is one of ${SURFACES.join(', ')}`);
const surface = flags.surface as DeckSurface;

interface Verdict {
  failures: string[];
  lines: string[];
}

async function runDeckChecks(page: Page, server: DeckServer, browser: DeckBrowser, verdict: Verdict): Promise<void> {
  const scenes = await page.evaluate(() => window.boardDeck?.listScenes().length ?? 0);
  if (scenes < FEWEST_SCENES && !flags.scene) verdict.failures.push(`the deck has ${scenes} scenes and the plan asks for ${FEWEST_SCENES}`);
  if (!flags['no-plants']) {
    await runPagePlants(page, surface, verdict);
    await runSourcePlants(page, server, surface, verdict);
    browser.forgetPageErrors();
  }
  if (flags['plants-only']) return;
  await runSweeps(page, { surface, isQuick: flags.quick, scenes: flags.scene, outFolder: flags.out }, verdict);
  if (!flags['no-flash']) await runFlashCheck(page, { isQuick: !flags.flash, surface }, verdict);
}

async function main(): Promise<void> {
  const server = await startDeckServer();
  const browser = await openDeckBrowser();
  const verdict: Verdict = { failures: [], lines: [] };
  try {
    const page = await browser.openDeck(`${server.url}?surface=${surface}`);
    if (flags.sheets) await makeDeckSheets(page, flags.sheets, verdict);
    else if (flags.rates) await runFrameRates(browser, server.url, { outFolder: flags.rates, scenes: flags.scene }, verdict);
    else await runDeckChecks(page, server, browser, verdict);
    for (const line of verdict.lines) console.log(line);
    for (const failure of browser.getPageErrors()) verdict.failures.push(`page error: ${failure}`);
  } finally {
    await browser.close();
    await server.close();
  }
  for (const failure of verdict.failures) console.error('FAILED', failure);
  console.log(verdict.failures.length === 0 ? 'check-layout passed' : `check-layout failed on ${verdict.failures.length} findings`);
  process.exit(verdict.failures.length === 0 ? 0 : 1);
}

await main();
