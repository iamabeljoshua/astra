/// <reference lib="dom" />
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright';
import { SCENE_ENGINE_VERSIONS } from '../packages/contracts/src/index.ts';
import { buildKitFramePage } from '../packages/board/src/scene3d/index.ts';

const ROOT = join(import.meta.dirname, '..');
const KIT_BUNDLE = readFileSync(join(ROOT, 'apps/web/public/scene-kit', SCENE_ENGINE_VERSIONS.kit, 'kit.js'), 'utf8');
const TIMING = { moments: { start: 0 }, duration: 10 };
const APP_HEAD = readFileSync(join(ROOT, 'apps/web/index.html'), 'utf8').match(/<meta http-equiv="Content-Security-Policy"[^>]*>/)?.[0];
if (!APP_HEAD) throw new Error("the app's index.html lost its frame-src rule");

const BUILD_LIMIT_MS = 6000;
const FRAME_LIMIT_MS = 3000;
const SETTLE_MS = 1200;

const failures: string[] = [];
const check = (isTrue: boolean, line: string) => {
  console.log(`${isTrue ? 'ok  ' : 'FAIL'} ${line}`);
  if (!isTrue) failures.push(line);
};

const hits: string[] = [];
const server = createServer((request, response) => {
  if (request.url?.startsWith('/leak/')) hits.push(request.url);
  response.setHeader('Set-Cookie', 'student=secret-cookie; Path=/');
  response.setHeader('Content-Type', 'text/html');
  response.end(`<!doctype html><html><head>${APP_HEAD}</head><body data-secret="parent-secret"></body></html>`);
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const leakBase = `http://127.0.0.1:${(server.address() as AddressInfo).port}/leak`;

interface FrameRun {
  replies: { type: string; message?: string; probes?: Record<string, string> }[];
  stoppedAtMs: number | null;
  parentFrames: number;
}

async function runScene(page: Page, code: string, { renderAfterReady = false, waitMs = SETTLE_MS }: { renderAfterReady?: boolean; waitMs?: number } = {}): Promise<FrameRun> {
  const srcdoc = buildKitFramePage({ kitBundle: KIT_BUNDLE, code });
  return page.evaluate(
    ({ srcdoc, timing, renderAfterReady, waitMs }) =>
      new Promise<FrameRun>((resolve) => {
        const iframe = document.createElement('iframe');
        iframe.setAttribute('sandbox', 'allow-scripts');
        iframe.style.cssText = 'width:640px;height:360px';
        iframe.srcdoc = srcdoc;
        const run: FrameRun = { replies: [], stoppedAtMs: null, parentFrames: 0 };
        const startedAt = performance.now();
        let countingFrames = true;
        const countFrame = () => {
          run.parentFrames += 1;
          if (countingFrames) requestAnimationFrame(countFrame);
        };
        requestAnimationFrame(countFrame);
        const finish = () => {
          countingFrames = false;
          window.removeEventListener('message', onMessage);
          iframe.remove();
          resolve(run);
        };
        function onMessage(event: MessageEvent) {
          if (event.source !== iframe.contentWindow) return;
          const reply = event.data as FrameRun['replies'][number];
          if (reply.type === 'drawn' || reply.type === 'pong') return;
          run.replies.push(reply);
          if (reply.type === 'loaded') iframe.contentWindow?.postMessage({ type: 'load', timing, textures: {}, theme: 'dark', quality: 'low' }, '*');
          if (reply.type === 'ready' && renderAfterReady) iframe.contentWindow?.postMessage({ type: 'render', seconds: 1 }, '*');
          if (reply.type === 'error') run.stoppedAtMs ??= performance.now() - startedAt;
        }
        window.addEventListener('message', onMessage);
        document.body.append(iframe);
        setTimeout(finish, waitMs);
      }),
    { srcdoc, timing: TIMING, renderAfterReady, waitMs },
  );
}

const STAGE = "kit.stage('studio',{dust:false});";

const REACH_SCENE = `function scene(kit) {
  const leak = ${JSON.stringify(leakBase)};
  const probes = {};
  const attempt = (name, work) => { try { const value = work(); probes[name] = value === undefined ? 'ran' : String(value); } catch (error) { probes[name] = 'threw ' + error.name; } };
  attempt('cookie', () => document.cookie);
  attempt('localStorage', () => localStorage.getItem('a'));
  attempt('indexedDB', () => indexedDB.open('a') && 'opened');
  attempt('parentDocument', () => parent.document.body.dataset.secret);
  attempt('topDocument', () => top.document.body.dataset.secret);
  attempt('parentHref', () => parent.location.href);
  attempt('fetch', () => fetch(leak + '/fetch'));
  attempt('xhr', () => { const request = new XMLHttpRequest(); request.open('GET', leak + '/xhr'); request.send(); });
  attempt('websocket', () => new WebSocket(leak.replace('http', 'ws') + '/ws'));
  attempt('eventSource', () => new EventSource(leak + '/events'));
  attempt('beacon', () => navigator.sendBeacon(leak + '/beacon', 'x'));
  attempt('image', () => { new Image().src = leak + '/image'; });
  attempt('script', () => { const tag = document.createElement('script'); tag.src = leak + '/script'; document.head.append(tag); });
  attempt('style', () => { const tag = document.createElement('link'); tag.rel = 'stylesheet'; tag.href = leak + '/style'; document.head.append(tag); });
  attempt('cssUrl', () => { const tag = document.createElement('div'); tag.style.backgroundImage = 'url(' + leak + '/css)'; document.body.append(tag); });
  attempt('font', () => { const tag = document.createElement('style'); tag.textContent = '@font-face{font-family:x;src:url(' + leak + '/font)}body{font-family:x}'; document.head.append(tag); });
  attempt('nestedFrame', () => { const tag = document.createElement('iframe'); tag.src = leak + '/frame'; document.body.append(tag); });
  attempt('form', () => { const tag = document.createElement('form'); tag.action = leak + '/form'; document.body.append(tag); tag.submit(); });
  attempt('popup', () => { const opened = window.open(leak + '/popup'); return opened ? 'opened' : 'blocked'; });
  attempt('worker', () => new Worker('data:text/javascript,fetch("' + leak + '/worker")'));
  attempt('eval', () => eval('1+1'));
  attempt('newFunction', () => new Function('return 1')());
  attempt('peerConnection', () => new RTCPeerConnection());
  attempt('topNavigate', () => { top.location.href = leak + '/top'; });
  parent.postMessage({ type: 'probes', probes }, '*');
  ${STAGE}
  return { render() {} };
}`;

const NAVIGATE_SCENE = `function scene(kit) { ${STAGE} location.href = ${JSON.stringify(`${leakBase}/navigate`)}; return { render() {} }; }`;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-mock-keychain'] });
const page = await browser.newPage();
await page.goto(`${leakBase.replace('/leak', '')}/`);

const spinInBuild = await runScene(page, 'function scene(kit) { while (true) {} }', { waitMs: BUILD_LIMIT_MS });
check(spinInBuild.replies.some(({ type, message }) => type === 'error' && /too long/.test(message ?? '')), `a loop spinning in the build is stopped by its guard, at ${Math.round(spinInBuild.stoppedAtMs ?? -1)} ms`);
check(spinInBuild.parentFrames > 0, `the parent kept drawing while it spun, ${spinInBuild.parentFrames} frames`);

const spinInFrame = await runScene(page, `function scene(kit) { ${STAGE} return { render(t) { if (t > 0.5) for (;;) {} } }; }`, { renderAfterReady: true, waitMs: BUILD_LIMIT_MS });
check(spinInFrame.replies.some(({ type, message }) => type === 'error' && /too long/.test(message ?? '')), `a loop spinning in a frame is stopped by its guard, at ${Math.round(spinInFrame.stoppedAtMs ?? -1)} ms`);

const shadowed = await runScene(page, `window.__guard = () => {}; const __guard = () => {}; function scene(kit) { const __g = () => {}; while (true) { __g(); __guard(); } }`, { waitMs: BUILD_LIMIT_MS });
check(shadowed.replies.some(({ type, message }) => type === 'error' && /too long/.test(message ?? '')), 'a scene that overwrites or shadows the guard it can name is still stopped');

const reach = await runScene(page, REACH_SCENE, { waitMs: FRAME_LIMIT_MS });
const probes = reach.replies.find(({ type }) => type === 'probes')?.probes ?? {};
console.log(JSON.stringify(probes));
for (const name of ['cookie', 'localStorage', 'indexedDB', 'parentDocument', 'topDocument', 'parentHref']) check(probes[name]?.startsWith('threw') === true, `a scene cannot read ${name}: ${probes[name]}`);
for (const name of ['eval', 'newFunction']) check(probes[name]?.startsWith('threw') === true, `a scene cannot use ${name}: ${probes[name]}`);
check(probes.peerConnection?.startsWith('threw') === true, `a scene cannot open a peer connection: ${probes.peerConnection}`);
check(page.url().startsWith(leakBase.replace('/leak', '')) && !page.url().includes('/leak'), `a scene cannot navigate the parent, which stayed on ${page.url()}`);

await runScene(page, NAVIGATE_SCENE, { waitMs: FRAME_LIMIT_MS });
check(hits.length === 0, `no request reached the server from any scene, ${hits.length} did${hits.length ? `: ${hits.join(', ')}` : ''}`);

await browser.close();
server.close();
if (failures.length) {
  console.error(`${failures.length} sandbox checks failed`);
  process.exit(1);
}
console.log('The sandbox held.');
