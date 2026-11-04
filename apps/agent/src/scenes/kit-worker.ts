import { buildKitFramePage, getNeededTextures, type KitFrameCommand, type KitFrameReply } from '@astra/board/scene3d';
import { SCENE_ENGINE_VERSIONS } from '@astra/contracts';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { type Browser, chromium, type Page } from 'playwright';
import type { RenderResult, RenderWorker } from './render-worker.ts';
import type { SceneTheme } from './scene-types.ts';

const KIT_PUBLIC = resolve(import.meta.dirname, '../../../web/public/scene-kit');
const HOST_URL = 'http://kit-check.invalid/';
const FRAME_WIDTH = 960;
const FRAME_HEIGHT = 540;
const MOST_CHECK_MS = 25_000;
const MOST_DRAW_MS = 250;
const LEAST_LIT = 0.002;
const LEAST_CONTRAST = 0.004;
const SHEET_COLUMNS = 3;
const SHEET_FRAME_WIDTH = 640;
const JPEG_QUALITY = 78;
const SHEET_THEME: SceneTheme = 'dark';
const MOST_NAMED_PARTS = 24;
// A server has no GPU, so the frames come from software GL there, which draws the same picture slower.
const GL_ARGS = process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

export interface KitFrameRequest {
  code: string;
  moments: Readonly<Record<string, number>>;
  durationSeconds: number;
  seconds: readonly number[];
}

export type KitFrameResult = { isOk: false; reasons: readonly string[] } | { isOk: true; parts: readonly string[]; sheet: Buffer; ms: number };

export type KitFrameCheck = (request: KitFrameRequest, signal: AbortSignal) => Promise<KitFrameResult>;

type Sample = NonNullable<Extract<KitFrameReply, { type: 'gate' }>['result']>['samples'][number];

/** The same pictures a parent would see must exist, differ over time, and repeat for the same second, or the review has nothing true to read. */
export function getFrameProblems({ samples, deterministic, mismatches, costMean }: NonNullable<Extract<KitFrameReply, { type: 'gate' }>['result']>, firstMomentSeconds: number): string[] {
  const shown = samples.filter(({ t }) => t >= firstMomentSeconds);
  const blank = shown.filter((sample: Sample) => sample.lit < LEAST_LIT || sample.std < LEAST_CONTRAST).map(({ t }) => t.toFixed(1));
  return [
    ...(blank.length > 0 ? [`it draws nothing visible at ${blank.join(', ')} s`] : []),
    ...(deterministic ? [] : [`render(t) is not pure, because the frames at ${mismatches.join(', ')} s changed when drawn again`]),
    ...(new Set(samples.map(({ hash }) => hash)).size < 2 ? ['nothing changes over the whole scene'] : []),
    ...(costMean > MOST_DRAW_MS ? [`a frame takes ${Math.round(costMean)} ms, past its ${MOST_DRAW_MS} ms`] : []),
  ];
}

const HOST_PAGE = `<!doctype html><html><body style="margin:0;background:#000"><div id="host" style="width:${FRAME_WIDTH}px;height:${FRAME_HEIGHT}px"></div></body></html>`;

// The stack's top line names where the scene broke, which is what a rewrite needs and all it needs.
const getErrorReason = ({ phase, message, stack }: Extract<KitFrameReply, { type: 'error' }>) => `${phase}: ${message}${stack ? ` ${stack.split('\n')[1]?.trim() ?? ''}` : ''}`.trim();

const textureFile = (name: string) => join(KIT_PUBLIC, 'textures', `${name}.${name.endsWith('alpha') ? 'png' : 'jpg'}`);

function getSheetPage(frames: readonly { seconds: number; jpeg: Buffer }[]): string {
  const cells = frames.map(({ seconds, jpeg }) => `<figure style="margin:0;position:relative"><img style="display:block;width:${SHEET_FRAME_WIDTH}px" src="data:image/jpeg;base64,${jpeg.toString('base64')}"><figcaption style="position:absolute;left:6px;top:4px;font:600 15px sans-serif;color:#fff;background:#000c;padding:1px 5px">${seconds.toFixed(1)} s</figcaption></figure>`);
  return `<!doctype html><html><body style="margin:0;background:#333;display:grid;grid-template-columns:repeat(${SHEET_COLUMNS},${SHEET_FRAME_WIDTH}px);gap:4px;width:max-content">${cells.join('')}</body></html>`;
}

// Runs in the host page, which has a real origin so it can fetch the maps, and only ever talks to the sandboxed frame by messages.
function startHost(srcdoc: string) {
  const host = document.querySelector('#host') as HTMLElement;
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-scripts');
  iframe.style.cssText = 'border:0;width:100%;height:100%;display:block';
  const replies: unknown[] = [];
  const waiters = new Set<() => void>();
  window.addEventListener('message', (event) => {
    if (event.source !== iframe.contentWindow) return;
    replies.push(event.data);
    for (const wake of waiters) wake();
  });
  const take = (isWanted: (reply: { type?: string }) => boolean) =>
    new Promise<unknown>((done) => {
      const look = () => {
        const found = (replies as { type?: string }[]).find((reply) => reply.type === 'error' || isWanted(reply));
        if (!found) return;
        waiters.delete(look);
        if (found.type !== 'error') replies.splice(replies.indexOf(found), 1);
        done(found);
      };
      waiters.add(look);
      look();
    });
  Object.assign(window, {
    kitHost: {
      take,
      send: (command: unknown) => iframe.contentWindow?.postMessage(command, '*'),
      sendLoad: async (timing: unknown, names: readonly string[], files: Readonly<Record<string, string>>) => {
        const textures = Object.fromEntries(await Promise.all(names.map(async (name) => [name, await (await fetch(files[name] as string)).blob()])));
        iframe.contentWindow?.postMessage({ type: 'load', timing, textures, theme: 'dark', quality: 'high' }, '*');
      },
    },
  });
  iframe.srcdoc = srcdoc;
  host.append(iframe);
}

interface HostWindow {
  kitHost: { take(isWanted: (reply: { type?: string }) => boolean): Promise<KitFrameReply>; send(command: KitFrameCommand): void; sendLoad(timing: unknown, names: readonly string[], files: Readonly<Record<string, string>>): Promise<void> };
}

const waitFor = <Type extends KitFrameReply['type']>(page: Page, type: Type) => page.evaluate((wanted) => (window as unknown as HostWindow).kitHost.take((reply) => reply.type === wanted), type as string);

const send = (page: Page, command: KitFrameCommand) => page.evaluate((message) => (window as unknown as HostWindow).kitHost.send(message), command);

async function readFrames(page: Page, { code, moments, durationSeconds, seconds }: KitFrameRequest, onEscape: () => readonly string[]): Promise<KitFrameResult> {
  const bundle = readFileSync(join(KIT_PUBLIC, SCENE_ENGINE_VERSIONS.kit, 'kit.js'), 'utf8');
  await page.goto(HOST_URL);
  await page.evaluate(startHost, buildKitFramePage({ kitBundle: bundle, code }));
  const loaded = await waitFor(page, 'loaded');
  if (loaded.type === 'error') return { isOk: false, reasons: [getErrorReason(loaded)] };
  const names = getNeededTextures(code);
  const timing = { moments: { ...moments }, duration: durationSeconds };
  await page.evaluate(({ timing: sent, names: wanted }) => (window as unknown as HostWindow).kitHost.sendLoad(sent, wanted, Object.fromEntries(wanted.map((name) => [name, `/kit-texture/${name}`]))), { timing, names });
  const ready = await waitFor(page, 'ready');
  if (ready.type === 'error') return { isOk: false, reasons: [getErrorReason(ready)] };
  if (ready.type !== 'ready') return { isOk: false, reasons: ['the frame never said it was ready'] };
  await send(page, { type: 'gate', times: [...seconds] });
  const gate = await waitFor(page, 'gate');
  if (gate.type === 'error') return { isOk: false, reasons: [getErrorReason(gate)] };
  if (gate.type !== 'gate' || !gate.result) return { isOk: false, reasons: [gate.type === 'gate' ? (gate.error ?? 'the frame check gave no result') : 'the frame check gave no result'] };
  const firstMoment = Math.min(...Object.values(moments));
  const problems = [...ready.issues, ...gate.issues, ...getFrameProblems(gate.result, firstMoment + 1), ...onEscape()];
  if (problems.length > 0) return { isOk: false, reasons: [...new Set(problems)] };
  const frames: { seconds: number; jpeg: Buffer }[] = [];
  for (const at of seconds) {
    await send(page, { type: 'render', seconds: at });
    const drawn = await waitFor(page, 'drawn');
    if (drawn.type === 'error') return { isOk: false, reasons: [getErrorReason(drawn)] };
    frames.push({ seconds: at, jpeg: await page.locator('#host').screenshot({ type: 'jpeg', quality: JPEG_QUALITY }) });
  }
  const escaped = onEscape();
  if (escaped.length > 0) return { isOk: false, reasons: escaped };
  await page.setContent(getSheetPage(frames));
  return { isOk: true, parts: ready.parts, sheet: await page.screenshot({ type: 'jpeg', quality: JPEG_QUALITY, fullPage: true }), ms: 0 };
}

/** One browser for the whole process, because starting one costs seconds a student does not have. Each check gets its own empty profile, and a check past its limit takes the browser with it, because a spinning renderer can ignore everything else. */
export function createFrameCheck(): KitFrameCheck {
  let browser: Promise<Browser> | null = null;
  const getBrowser = () => (browser ??= chromium.launch({ headless: true, args: [...GL_ARGS, '--use-mock-keychain', '--no-first-run'] }));
  return async (request, signal) => {
    const startedAt = performance.now();
    const opened = await getBrowser();
    const context = await opened.newContext({ viewport: { width: FRAME_WIDTH, height: FRAME_HEIGHT }, deviceScaleFactor: 1, serviceWorkers: 'block' });
    const escapes: string[] = [];
    let settle: ((result: KitFrameResult) => void) | null = null;
    const giveUp = (reason: string) => {
      settle?.({ isOk: false, reasons: [reason] });
      browser = null;
      void opened.close().catch(() => {});
    };
    const limit = setTimeout(() => giveUp(`the scene was not done in ${MOST_CHECK_MS / 1000} s`), MOST_CHECK_MS);
    const onAbort = () => giveUp('no longer wanted');
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      const page = await context.newPage();
      await page.route('**/*', async (route) => {
        const url = route.request().url();
        if (url === HOST_URL) return route.fulfill({ contentType: 'text/html', body: HOST_PAGE });
        if (url.startsWith(`${HOST_URL}kit-texture/`)) return route.fulfill({ path: textureFile(url.slice(`${HOST_URL}kit-texture/`.length)) });
        escapes.push(`the scene tried to reach ${url.slice(0, 80)}`);
        return route.abort();
      });
      page.on('framenavigated', (frame) => {
        if (frame !== page.mainFrame() && frame.url() !== 'about:srcdoc') escapes.push('the scene tried to leave its frame');
      });
      const result = await Promise.race([readFrames(page, request, () => escapes), new Promise<KitFrameResult>((resolve) => { settle = resolve; })]);
      return result.isOk ? { ...result, ms: performance.now() - startedAt } : result;
    } catch (error) {
      return { isOk: false, reasons: [error instanceof Error ? error.message : String(error)] };
    } finally {
      clearTimeout(limit);
      signal.removeEventListener('abort', onAbort);
      void context.close().catch(() => {});
    }
  };
}

/** Takes a scene's code to the frame check. A kit scene has no take to make, since the page builds its take from the saved code, so a pass only adds pictures. */
export function createKitWorker(checkFrames: KitFrameCheck = createFrameCheck()): RenderWorker {
  return async ({ code, moments, durationSeconds, inspectSeconds = [] }, signal): Promise<RenderResult> => {
    const startedAt = performance.now();
    const checked = await checkFrames({ code, moments, durationSeconds, seconds: inspectSeconds }, signal);
    const ms = performance.now() - startedAt;
    if (!checked.isOk) return { isOk: false, stage: 'inspect', reasons: checked.reasons, ms };
    return { isOk: true, takes: [], parts: checked.parts.slice(0, MOST_NAMED_PARTS), sheets: [{ theme: SHEET_THEME, bytes: checked.sheet }], layoutProblems: [], layoutNotes: [], declared: {}, ms };
  };
}
