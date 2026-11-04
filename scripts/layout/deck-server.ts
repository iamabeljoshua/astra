/// <reference lib="dom" />
import { createRequire } from 'node:module';
import { createServer as createPortProbe } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { BoardDeck } from '../../apps/web/src/lab/deck/deckSweep.ts';

declare global {
  interface Window {
    boardDeck?: BoardDeck;
  }
}

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const WEB_ROOT = join(REPO_ROOT, 'apps/web');
const DEFAULT_WEB_PORT = 7020;
const HOST = '127.0.0.1';
const DECK_PATH = '/lab/board-deck';
const READY_LIMIT_MS = 120_000;
/** A development tool's button, drawn over every board. */
const HIDE_DEV_BUTTON = '.tsqd-parent-container { display: none !important; }';

/** Rewrites one line of a module as it is served, so a plant reaches the real library and never touches the disk. */
export interface SourcePlant {
  name: string;
  file: string;
  find: string;
  replace: string;
}

export interface DeckServer {
  url: string;
  plant(plant: SourcePlant | null): void;
  close(): Promise<void>;
}

function assertPortFree(port: number): Promise<void> {
  return new Promise((done, reject) => {
    const probe = createPortProbe();
    probe.once('error', () => reject(new Error(`port ${port} is taken. Set LAYOUT_WEB_PORT to a free one.`)));
    probe.listen(port, HOST, () => probe.close(() => done()));
  });
}

export async function startDeckServer(): Promise<DeckServer> {
  const port = Number(process.env.LAYOUT_WEB_PORT ?? DEFAULT_WEB_PORT);
  await assertPortFree(port);
  process.env.WEB_PORT = String(port);
  process.env.VITE_SUPABASE_URL ??= 'http://127.0.0.1:54421';
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??= 'layout-check';
  const viteEntry = createRequire(join(WEB_ROOT, 'package.json')).resolve('vite');
  const { createServer } = (await import(pathToFileURL(viteEntry).href)) as typeof import('vite');
  let active: SourcePlant | null = null;
  const server = await createServer({
    root: WEB_ROOT,
    configFile: join(WEB_ROOT, 'vite.config.ts'),
    logLevel: 'error',
    plugins: [{
      name: 'layout-plant',
      enforce: 'pre',
      transform(code, id) {
        if (!active || !id.split('?')[0]?.endsWith(active.file)) return null;
        if (!code.includes(active.find)) throw new Error(`plant ${active.name} no longer matches ${active.file}`);
        return code.replace(active.find, active.replace);
      },
    }],
  });
  await server.listen();
  const invalidate = (plant: SourcePlant | null) => {
    if (!plant) return;
    for (const module of server.moduleGraph.idToModuleMap.values()) if (module.file?.endsWith(plant.file)) server.moduleGraph.invalidateModule(module);
  };
  return {
    url: `http://${HOST}:${port}${DECK_PATH}`,
    plant(plant) {
      invalidate(active);
      active = plant;
      invalidate(plant);
    },
    close: () => server.close(),
  };
}

export interface DeckBrowser {
  openDeck(url: string): Promise<Page>;
  browser: Browser;
  getPageErrors(): readonly string[];
  /** A plant can make the page complain, which says nothing about the deck. */
  forgetPageErrors(): void;
  close(): Promise<void>;
}

export async function waitForDeck(page: Page): Promise<void> {
  await page.waitForFunction(() => window.boardDeck !== undefined, undefined, { timeout: READY_LIMIT_MS });
  await page.addStyleTag({ content: HIDE_DEV_BUTTON });
  await page.evaluate(() => window.boardDeck?.prepare());
}

export async function openDeckBrowser(): Promise<DeckBrowser> {
  const browser = await chromium.launch();
  const errors: string[] = [];
  const contexts: BrowserContext[] = [];
  return {
    browser,
    async openDeck(url) {
      const context = await browser.newContext({ viewport: { width: 1366, height: 800 } });
      contexts.push(context);
      const page = await context.newPage();
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) errors.push(message.text());
      });
      await page.goto(url);
      await waitForDeck(page);
      return page;
    },
    getPageErrors: () => errors,
    forgetPageErrors: () => errors.splice(0),
    close: () => browser.close(),
  };
}
