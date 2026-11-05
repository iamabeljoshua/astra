import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createSocket } from 'node:dgram';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { parseArgs } from 'node:util';
import { chromium, type Page } from 'playwright';
import { getSourceHash, getSourceHashPath, SCENE_BUNDLES } from '../apps/web/scripts/build-kit.ts';
import { buildKitFramePage } from '../packages/board/src/scene3d/index.ts';

const { values: args } = parseArgs({ options: { 'real-chrome': { type: 'boolean', default: false } } });
const KIT_BUNDLE = readFileSync(SCENE_BUNDLES.kit.out, 'utf8');
const CANVAS_BUNDLE = readFileSync(SCENE_BUNDLES.canvas.out, 'utf8');
const TIMING = { moments: { start: 0 }, duration: 10 };

// A frame stops a spinning build after 32 missed beats, 8 s when its timers run on time, and a loaded runner can stretch those beats past 15 s.
const LOAD_LIMIT_MS = 30_000;
const SETTLE_MS = 1200;
const STOP_LIMIT_MS = 5000;
const RAW_NETWORK_NAMES = 9;
const SPIN_SECONDS = 1.5;
const MOST_REPLY_CHARS = 1_000_000;
const PAGE_HISTORY_LENGTH = 2;
const TYPE_FOR_MS = 2000;
const TYPED = 'private words';
const SESSION_ID = 'c3d0a111-session-id';
const LONGEST_PAGE_GAP_MS = 500;
// CI's shell keeps a frame on the page's thread, where a 300 MB message would stall the page, so only real Chrome measures that size.
const BIG_MESSAGE_CHARS = args['real-chrome'] ? 300_000_000 : 20_000_000;
const TOO_LONG_ANSWER_CHARS = 30_000_000;
const BUSY_WATCH_MS = 3000;
const BUSY_SHARE = 0.6;
const delay = (ms: number) => new Promise((done) => setTimeout(done, ms));

const failures: string[] = [];
const check = (isTrue: boolean, line: string) => {
  console.log(`${isTrue ? 'ok  ' : 'FAIL'} ${line}`);
  if (!isTrue) failures.push(line);
};

for (const name of ['kit', 'canvas'] as const) check(readFileSync(getSourceHashPath(name), 'utf8').trim() === getSourceHash(name), `the committed ${name} runtime is built from the source beside it. Run \`node scripts/build-kit.ts\` from apps/web if not`);

const hits: string[] = [];
const server = createServer((request, response) => {
  if (request.url?.startsWith('/leak/')) hits.push(request.url);
  response.setHeader('Set-Cookie', 'student=secret-cookie; Path=/');
  response.setHeader('Content-Type', 'text/html');
  response.end('<!doctype html><html><body data-secret="parent-secret"></body></html>');
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const leakBase = `http://127.0.0.1:${(server.address() as AddressInfo).port}/leak`;
const stunHits: string[] = [];
const stun = createSocket('udp4', (_message, { address, port }) => stunHits.push(`${address}:${port}`));
await new Promise<void>((resolve) => stun.bind(0, '127.0.0.1', resolve));
const stunPort = stun.address().port;

interface FrameRun {
  replies: { type: string; phase?: string; message?: string; issues?: string[] }[];
  stoppedAtMs: number | null;
  parentFrames: number;
  largestPageGapMs: number;
  largestReplyChars: number;
}

const getProbes = ({ replies }: FrameRun): Record<string, string> =>
  Object.fromEntries(replies.flatMap(({ issues }) => issues ?? []).filter((issue) => issue.startsWith('probe|')).map((issue) => issue.split('|').slice(1, 3) as [string, string]));

async function runScene(page: Page, code: string, { bundle = KIT_BUNDLE, renderAfterReady = false, keepRendering = false, askAfterReady = false, settleMs = SETTLE_MS, isRawWorker = false }: { bundle?: string; renderAfterReady?: boolean; keepRendering?: boolean; askAfterReady?: boolean; settleMs?: number; isRawWorker?: boolean } = {}): Promise<FrameRun> {
  const srcdoc = isRawWorker ? buildKitFramePage({ kitBundle: code, code: '' }) : buildKitFramePage({ kitBundle: bundle, code });
  return page.evaluate(
    ({ srcdoc, timing, renderAfterReady, keepRendering, askAfterReady, settleMs, LOAD_LIMIT_MS, SPIN_SECONDS }) =>
      new Promise<FrameRun>((resolve) => {
        // JSON reads an ArrayBuffer or a Map as {}, so anything JSON cannot hold counts as too large.
        const getReplySize = (value: unknown): number => {
          if (value === null || typeof value !== 'object') return String(value).length;
          const isJson = Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype;
          return isJson ? Object.values(value).reduce((total: number, item) => total + getReplySize(item), 1) : Number.POSITIVE_INFINITY;
        };
        const iframe = document.createElement('iframe');
        iframe.setAttribute('sandbox', 'allow-scripts');
        iframe.style.cssText = 'width:640px;height:360px';
        iframe.srcdoc = srcdoc;
        const run: FrameRun = { replies: [], stoppedAtMs: null, parentFrames: 0, largestPageGapMs: 0, largestReplyChars: 0 };
        const startedAt = performance.now();
        let countingFrames = true;
        let lastFrameAt = startedAt;
        let seconds = 1;
        const countFrame = () => {
          run.parentFrames += 1;
          const now = performance.now();
          run.largestPageGapMs = Math.max(run.largestPageGapMs, now - lastFrameAt);
          lastFrameAt = now;
          if (keepRendering) iframe.contentWindow?.postMessage({ type: 'render', seconds: (seconds += 0.016) }, '*');
          if (countingFrames) requestAnimationFrame(countFrame);
        };
        requestAnimationFrame(countFrame);
        const finish = () => {
          countingFrames = false;
          window.removeEventListener('message', onMessage);
          iframe.remove();
          resolve(run);
        };
        const limit = setTimeout(finish, settleMs + LOAD_LIMIT_MS);
        let isSettling = false;
        const settle = () => {
          if (isSettling) return;
          isSettling = true;
          clearTimeout(limit);
          setTimeout(finish, settleMs);
        };
        function onMessage(event: MessageEvent) {
          if (event.source !== iframe.contentWindow) return;
          const reply = event.data as FrameRun['replies'][number];
          run.largestReplyChars = Math.max(run.largestReplyChars, getReplySize(reply));
          if (reply.type === 'drawn' || reply.type === 'pong') return;
          run.replies.push(reply);
          if (reply.type === 'loaded') iframe.contentWindow?.postMessage({ type: 'load', timing, textures: {}, theme: 'dark', quality: 'low' }, '*');
          if (reply.type === 'ready' && renderAfterReady) iframe.contentWindow?.postMessage({ type: 'render', seconds: SPIN_SECONDS }, '*');
          if (reply.type === 'ready' && askAfterReady) iframe.contentWindow?.postMessage({ type: 'gate', times: [] }, '*');
          if (reply.type === 'error') run.stoppedAtMs ??= performance.now() - startedAt;
          if (reply.type === 'ready' || (reply.type === 'error' && reply.phase !== 'promise')) settle();
        }
        window.addEventListener('message', onMessage);
        document.body.append(iframe);
      }),
    { srcdoc, timing: TIMING, renderAfterReady, keepRendering, askAfterReady, settleMs, LOAD_LIMIT_MS, SPIN_SECONDS },
  );
}

const STAGE = 'kit.outdoor();';

const getReachScene = (stage: string, draw = '') => `function scene(kit) {
  const leak = ${JSON.stringify(leakBase)};
  const probes = {};
  const attempt = (name, work) => { try { const value = work(); probes[name] = value === undefined ? 'nothing' : String(value); } catch (error) { probes[name] = 'threw ' + error.name; } console.error('probe|' + name + '|' + probes[name]); };
  attempt('cookie', () => document.cookie);
  attempt('localStorage', () => localStorage.getItem('a'));
  attempt('indexedDB', () => indexedDB.open('a') && 'opened');
  attempt('parentDocument', () => parent.document.body.dataset.secret);
  attempt('topDocument', () => top.document.body.dataset.secret);
  attempt('parentHref', () => parent.location.href);
  attempt('fetch', () => fetch(leak + '/fetch'));
  attempt('fetchFromPrototype', () => WorkerGlobalScope.prototype.fetch.call(self, leak + '/fetch-prototype'));
  attempt('webTransport', () => new WebTransport(leak.replace('http', 'https') + '/transport'));
  attempt('importScripts', () => importScripts(leak + '/import'));
  attempt('fontFace', () => { new FontFace('x', 'url(' + leak + '/font-face)').load().catch(() => {}); });
  attempt('windowFocus', () => window.focus());
  attempt('xhr', () => { const request = new XMLHttpRequest(); request.open('GET', leak + '/xhr'); request.send(); });
  attempt('websocket', () => new WebSocket(leak.replace('http', 'ws') + '/ws'));
  attempt('eventSource', () => new EventSource(leak + '/events'));
  attempt('beacon', () => navigator.sendBeacon(leak + '/beacon', 'x'));
  attempt('image', () => { new Image().src = leak + '/image'; });
  attempt('script', () => { const tag = document.createElement('script'); tag.src = leak + '/script'; document.head.append(tag); });
  attempt('style', () => { const tag = document.createElement('link'); tag.rel = 'stylesheet'; tag.href = leak + '/style'; document.head.append(tag); });
  attempt('font', () => { const tag = document.createElement('style'); tag.textContent = '@font-face{font-family:x;src:url(' + leak + '/font)}body{font-family:x}'; document.head.append(tag); });
  attempt('nestedFrame', () => { const tag = document.createElement('iframe'); tag.src = leak + '/frame'; document.body.append(tag); });
  attempt('form', () => { const tag = document.createElement('form'); tag.action = leak + '/form'; document.body.append(tag); tag.submit(); });
  attempt('popup', () => { const opened = window.open(leak + '/popup'); return opened ? 'opened' : 'blocked'; });
  attempt('worker', () => new Worker('data:text/javascript,fetch("' + leak + '/worker")'));
  attempt('eval', () => eval('1+1'));
  attempt('newFunction', () => new Function('return 1')());
  attempt('peerConnection', () => new RTCPeerConnection());
  attempt('topNavigate', () => { top.location.href = leak + '/top'; });
  attempt('prerender', () => { const tag = document.createElement('link'); tag.rel = 'prerender'; tag.href = leak + '/prerender'; document.head.append(tag); });
  attempt('prefetch', () => { const tag = document.createElement('link'); tag.rel = 'prefetch'; tag.href = leak + '/prefetch'; document.head.append(tag); });
  attempt('speculation', () => { const tag = document.createElement('script'); tag.type = 'speculationrules'; tag.textContent = JSON.stringify({ prerender: [{ urls: [leak + '/speculation'] }] }); document.head.append(tag); });
  attempt('nestedPeer', () => {
    const tag = document.createElement('iframe');
    tag.srcdoc = '<!doctype html><script>const peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:127.0.0.1:${stunPort}" }] }); peer.createDataChannel("x"); peer.createOffer().then((offer) => peer.setLocalDescription(offer));<' + '/script>';
    document.body.append(tag);
    return 'made';
  });
  attempt('pageUrl', () => document.baseURI + ' ' + document.referrer + ' ' + document.URL + ' ' + location.href);
  attempt('history', () => { for (let turn = 0; turn < 40; turn += 1) history.pushState({}, ''); });
  try { parent.postMessage({ type: 'probes', issues: Object.entries(probes).map(([name, value]) => 'probe|' + name + '|' + value) }, '*'); } catch {}
  ${stage}
  return { render() { ${draw} } };
}`;

const RAW_NETWORK_WORKER = `
  const leak = ${JSON.stringify(leakBase)};
  const outcomes = [];
  const attempt = (name, work) => new Promise((done) => done(work())).then(() => outcomes.push('probe|' + name + '|reached'), (error) => outcomes.push('probe|' + name + '|refused ' + error.name));
  const opened = (socket) => new Promise((done, stop) => { socket.onopen = done; socket.onerror = () => stop(new Error('closed')); });
  const tried = [
    attempt('fetch', () => fetch(leak + '/raw-fetch')),
    attempt('xhr', () => new Promise((done, stop) => { const request = new XMLHttpRequest(); request.onload = done; request.onerror = () => stop(new Error('closed')); request.open('GET', leak + '/raw-xhr'); request.send(); })),
    attempt('websocket', () => opened(new WebSocket(leak.replace('http', 'ws') + '/raw-ws'))),
    attempt('eventSource', () => opened(new EventSource(leak + '/raw-events'))),
    attempt('webTransport', () => new WebTransport(leak.replace('http', 'https') + '/raw-transport').ready),
    attempt('importScripts', () => importScripts(leak + '/raw-import')),
    attempt('fontFace', () => new FontFace('x', 'url(' + leak + '/raw-font)').load()),
    attempt('dataWorker', () => new Promise((done, stop) => { const worker = new Worker('data:text/javascript,fetch(' + JSON.stringify(leak + '/raw-data-worker') + ')'); worker.onerror = () => stop(new Error('closed')); setTimeout(done, 1500); })),
    attempt('nestedWorker', () => { new Worker(URL.createObjectURL(new Blob(['fetch(' + JSON.stringify(leak + '/raw-nested') + ')']))); throw new Error('started, and its own fetch is what is measured'); }),
  ];
  postMessage({ type: 'loaded' });
  addEventListener('message', ({ data }) => {
    if (data.type === 'load') Promise.all(tried).then(() => postMessage({ type: 'ready', issues: outcomes }));
  });
`;

const CONTROL_WORKER = `fetch(${JSON.stringify(`${leakBase}/control`)});`;

const REFUSED_ORDERS = [
  { name: 'a nested frame', ops: [['create', 1, 'iframe', false], ['append', 1, 0]] },
  { name: 'a script', ops: [['create', 1, 'script', false], ['append', 1, 0]] },
  { name: 'a link', ops: [['create', 1, 'link', false], ['append', 1, 0]] },
  { name: 'a style sheet', ops: [['create', 1, 'style', false], ['append', 1, 0]] },
  { name: 'an SVG image', ops: [['create', 1, 'image', true], ['append', 1, 0]] },
  { name: 'an SVG link', ops: [['create', 1, 'a', true], ['append', 1, 0]] },
  { name: 'an event attribute', ops: [['create', 1, 'div', false], ['attr', 1, 'onclick', 'x']] },
  { name: 'an href', ops: [['create', 1, 'path', true], ['attr', 1, 'href', 'x']] },
  { name: 'a style with an address', ops: [['create', 1, 'div', false], ['style', 1, 'backgroundImage', `url(${leakBase}/raw-css)`]] },
  { name: 'a fill with an address', ops: [['create', 1, 'path', true], ['attr', 1, 'fill', `url(${leakBase}/raw-fill)`]] },
  { name: 'another name on the root', ops: [['root', 'onclick', 'light']] },
  { name: 'the overlay moved into itself', ops: [['append', 0, 0]] },
  { name: 'too much text', ops: [['create', 1, 'div', false], ['text', 1, 'x'.repeat(100_000)]] },
];

const getOrderWorker = (ops: unknown) => `postMessage({ type: 'loaded' }); addEventListener('message', ({ data }) => { if (data.type === 'load') postMessage({ type: 'overlay', ops: ${JSON.stringify(ops)} }); });`;

const RAW_FLOOD_WORKER = `
  const big = 'x'.repeat(${BIG_MESSAGE_CHARS});
  postMessage({ type: 'loaded' });
  let turns = 0;
  const send = () => {
    postMessage({ type: 'drawn', seconds: 1, costMs: big });
    postMessage({ type: 'error', phase: 'render', message: big });
    postMessage({ type: 'gate', result: big });
    postMessage({ type: 'huge', big });
    turns += 1;
    if (turns < 3) setTimeout(send, 100);
  };
  addEventListener('message', ({ data }) => {
    if (data.type === 'beat') postMessage({ type: 'beat', id: data.id });
    if (data.type === 'load') { send(); postMessage({ type: 'ready', issues: [] }); }
  });
`;

const RAW_ODD_WORKER = `
  const buffer = new ArrayBuffer(${BIG_MESSAGE_CHARS});
  const map = new Map([['big', buffer]]);
  postMessage({ type: 'loaded' });
  postMessage({ type: 'loaded' });
  addEventListener('message', ({ data }) => {
    if (data.type === 'beat') postMessage({ type: 'beat', id: data.id });
    if (data.type === 'render') postMessage({ type: 'drawn', seconds: buffer, costMs: map });
    if (data.type === 'gate') postMessage({ type: 'gate', result: { buffer, map }, issues: [map] });
    if (data.type === 'load') {
      postMessage({ type: 'error', phase: buffer, message: map, stack: buffer, line: map, col: buffer, seconds: map });
      postMessage({ type: 'ready', issues: [map], params: { buffer, map }, parts: buffer });
    }
  });
`;

const RAW_LONG_ANSWER_WORKER = `
  postMessage({ type: 'loaded' });
  addEventListener('message', ({ data }) => {
    if (data.type === 'load') postMessage({ type: 'ready', issues: [] });
    if (data.type === 'gate') postMessage({ type: 'gate', result: 'x'.repeat(${TOO_LONG_ANSWER_CHARS}), issues: [] });
  });
`;

const NAVIGATE_SCENE = `function scene(kit) { ${STAGE} location.href = ${JSON.stringify(`${leakBase}/navigate`)}; return { render() {} }; }`;

const FOCUS_SCENE = `function scene(kit) {
  ${STAGE}
  const take = () => {
    try { window.focus(); } catch {}
    try { document.body.tabIndex = 0; document.body.focus(); } catch {}
    try { const box = document.querySelector('input') ?? document.body.appendChild(document.createElement('input')); box.focus(); } catch {}
  };
  take();
  return { render() { take(); } };
}`;

const FLOOD_SCENE = `function scene(kit) {
  ${STAGE}
  const big = 'x'.repeat(${BIG_MESSAGE_CHARS});
  const send = (message) => { try { parent.postMessage(message, '*'); } catch { try { postMessage(message); } catch {} } };
  return { render() { send({ type: 'drawn', seconds: 1, costMs: big }); send({ type: 'huge', big }); } };
}`;

const BROWSER_TAG = `--astra-kit-check=${process.pid}`;
const getRendererCpuSeconds = () => {
  const rows = execFileSync('ps', ['-Ao', 'pid=,ppid=,cputime=,command='], { encoding: 'utf8' }).split('\n').map((row) => row.trim().split(/\s+/));
  const browserPid = rows.find((row) => row.includes(BROWSER_TAG))?.[0];
  const toSeconds = (cputime = '') => cputime.split(':').reduce((total, part) => total * 60 + Number(part), 0);
  return new Map(rows.filter(([, ppid, , ...command]) => ppid === browserPid && command.includes('--type=renderer')).map(([pid, , cputime]) => [pid as string, toSeconds(cputime)]));
};
const getBusyRenderers = async () => {
  const before = getRendererCpuSeconds();
  await delay(BUSY_WATCH_MS);
  return [...getRendererCpuSeconds()].filter(([pid, seconds]) => seconds - (before.get(pid) ?? seconds) > (BUSY_WATCH_MS / 1000) * BUSY_SHARE).map(([pid]) => pid);
};

const browser = args['real-chrome']
  ? await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-mock-keychain', '--mute-audio', BROWSER_TAG] })
  : await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-mock-keychain'] });
const page = await browser.newPage();
await page.goto(`${leakBase.replace('/leak', '')}/sessions/${SESSION_ID}`);

const REACHED_NAMES = ['cookie', 'parentDocument', 'topDocument', 'parentHref', 'beacon', 'popup', 'windowFocus', 'history'];
const THROWING_NAMES = ['localStorage', 'indexedDB', 'prerender', 'prefetch', 'speculation', 'nestedPeer', 'nestedFrame', 'style', 'font', 'form', 'script', 'peerConnection', 'worker', 'eval', 'newFunction', 'fetch', 'fetchFromPrototype', 'xhr', 'websocket', 'eventSource', 'webTransport', 'importScripts'];

const isStopped = ({ replies }: FrameRun) => replies.some(({ type, message }) => type === 'error' && /stopped answering/.test(message ?? ''));

const [spinInBuild, spinInFrame, catching, spinAtTop, regex] = await Promise.all([
  runScene(page, 'function scene(kit) { while (true) {} }'),
  runScene(page, `function scene(kit) { ${STAGE} return { render(t) { if (t === ${SPIN_SECONDS}) for (;;) {} } }; }`, { renderAfterReady: true, settleMs: STOP_LIMIT_MS }),
  runScene(page, 'function scene(kit) { try { for (;;) {} } catch {} for (;;) {} }'),
  runScene(page, 'while (true) {}\nfunction scene(kit) {}'),
  runScene(page, `function scene(kit) { ${STAGE} return { render(t) { if (t === ${SPIN_SECONDS}) /(a+)+$/.test('a'.repeat(40) + 'b'); } }; }`, { renderAfterReady: true, settleMs: STOP_LIMIT_MS }),
]);
check(isStopped(spinInBuild), `a loop spinning in the build is stopped, at ${Math.round(spinInBuild.stoppedAtMs ?? -1)} ms`);
check(spinInBuild.parentFrames > 0, `the parent kept drawing while it spun, ${spinInBuild.parentFrames} frames`);
check(isStopped(spinInFrame), `a loop spinning in a frame is stopped, at ${Math.round(spinInFrame.stoppedAtMs ?? -1)} ms`);
check(isStopped(catching), `a spinning scene that catches errors is stopped, at ${Math.round(catching.stoppedAtMs ?? -1)} ms`);
check(isStopped(spinAtTop), `a scene spinning before it is even asked to build is stopped, at ${Math.round(spinAtTop.stoppedAtMs ?? -1)} ms`);
check(isStopped(regex), `a regular expression that never ends is stopped, at ${Math.round(regex.stoppedAtMs ?? -1)} ms`);

const reach = await runScene(page, getReachScene(STAGE));
const probes = getProbes(reach);
console.log(JSON.stringify(probes));
for (const name of REACHED_NAMES) check(probes[name] === 'nothing' || probes[name]?.startsWith('threw') === true, `a scene gets nothing from ${name}: ${probes[name]}`);
for (const name of THROWING_NAMES) check(probes[name]?.startsWith('threw') === true, `a scene cannot use ${name}: ${probes[name]}`);
check(page.url().endsWith(SESSION_ID), `a scene cannot navigate the parent, which stayed on ${page.url()}`);
check(!Object.values(probes).some((value) => value.includes(SESSION_ID)), `the page's address does not reach a scene: ${probes.pageUrl}`);
check((await page.evaluate(() => history.length)) === PAGE_HISTORY_LENGTH, `a scene adds nothing to the page's history, which holds ${await page.evaluate(() => history.length)} entries`);

await runScene(page, NAVIGATE_SCENE);

const CANVAS_STAGE = "kit.paper({}); kit.ctx.fillStyle = '#e8603c'; kit.ctx.fillRect(300, 200, 400, 300);";
const CANVAS_DRAW = `function scene(kit) { return { render() { ${CANVAS_STAGE} } }; }`;
const runCanvas = (code: string, options: Parameters<typeof runScene>[2] = {}) => runScene(page, code, { bundle: CANVAS_BUNDLE, ...options });
const isFrameRefused = ({ replies }: FrameRun, reason: RegExp) => replies.some(({ type, message }) => type === 'error' && reason.test(message ?? ''));

const [canvasGood, canvasBlank, canvasBroken, canvasCut, canvasReach, canvasSpinBuild, canvasSpinFrame] = await Promise.all([
  runCanvas(CANVAS_DRAW),
  runCanvas('function scene(kit) { return { render() { kit.paper({}); } }; }'),
  runCanvas(`function scene(kit) { return { render() { ${CANVAS_STAGE} kit.label(String(0 / 0), { x: 100, y: 100 }); } }; }`),
  runCanvas(`function scene(kit) { return { render() { ${CANVAS_STAGE} kit.ctx.font = kit.font(40); kit.ctx.fillText('cut by the edge', 1200, 300); } }; }`),
  runCanvas(getReachScene(CANVAS_STAGE, CANVAS_STAGE)),
  runCanvas('function scene(kit) { while (true) {} }'),
  runCanvas(`function scene(kit) { return { render(t) { ${CANVAS_STAGE} if (t === ${SPIN_SECONDS}) for (;;) {} } }; }`, { renderAfterReady: true, settleMs: STOP_LIMIT_MS }),
]);
check(canvasGood.replies.some(({ type }) => type === 'ready'), 'a plain Canvas drawing passes the frame check and says ready');
check(isFrameRefused(canvasBlank, /blank/), 'the frame check refuses a Canvas drawing with nothing on it');
check(isFrameRefused(canvasBroken, /broken number/), 'the frame check refuses a label that shows a broken number');
check(isFrameRefused(canvasCut, /cut by the frame/), 'the frame check refuses text cut by the frame');
check(isStopped(canvasSpinBuild), `a Canvas drawing spinning in its build is stopped, at ${Math.round(canvasSpinBuild.stoppedAtMs ?? -1)} ms`);
check(isStopped(canvasSpinFrame), `a Canvas drawing spinning in a frame is stopped, at ${Math.round(canvasSpinFrame.stoppedAtMs ?? -1)} ms`);
const canvasProbes = getProbes(canvasReach);
for (const name of REACHED_NAMES) check(canvasProbes[name] === 'nothing' || canvasProbes[name]?.startsWith('threw') === true, `a Canvas drawing gets nothing from ${name}: ${canvasProbes[name]}`);
for (const name of THROWING_NAMES) check(canvasProbes[name]?.startsWith('threw') === true, `a Canvas drawing cannot use ${name}: ${canvasProbes[name]}`);
check(!Object.values(canvasProbes).some((value) => value.includes(SESSION_ID)), `the page's address does not reach a Canvas drawing: ${canvasProbes.pageUrl}`);

await page.evaluate(() => {
  const box = document.createElement('input');
  box.id = 'student';
  document.body.prepend(box);
  box.focus();
});
const typing = runScene(page, FOCUS_SCENE, { renderAfterReady: true, keepRendering: true, settleMs: TYPE_FOR_MS * 2 });
await page.waitForFunction(() => document.querySelector('iframe') !== null);
await delay(TYPE_FOR_MS);
for (const letter of TYPED) {
  await page.keyboard.type(letter);
  await delay(TYPE_FOR_MS / TYPED.length);
}
await typing;
const box = await page.evaluate(() => {
  const input = document.querySelector<HTMLInputElement>('#student');
  return { value: input?.value, isFocused: document.activeElement === input };
});
check(box.value === TYPED && box.isFocused, `a scene cannot take the student's keyboard: the box holds "${box.value}" and ${box.isFocused ? 'keeps' : 'lost'} focus`);

const forged = await runScene(page, 'function scene(kit) { kit.__pixelStats = () => ({ lit: 1, std: 1, mean: 1, hash: 1 }); return { render() {} }; }');
check(forged.replies.some(({ type, message }) => type === 'error' && /drew nothing/.test(message ?? '')), 'a scene that overwrites the blank check and draws nothing is reported');

const flood = await runScene(page, FLOOD_SCENE, { renderAfterReady: true, keepRendering: true, settleMs: TYPE_FOR_MS });
check(flood.largestReplyChars < MOST_REPLY_CHARS, `a scene's huge messages do not reach the page: the largest reply was ${flood.largestReplyChars} characters`);

await page.evaluate((code) => { new Worker(URL.createObjectURL(new Blob([code]))); }, CONTROL_WORKER);
await delay(SETTLE_MS);
check(hits.some((hit) => hit.endsWith('/control')), `the same request from a worker outside the frame does reach the server, so the next checks measure the frame: ${hits.join(', ')}`);
hits.length = 0;

const rawNetwork = getProbes(await runScene(page, RAW_NETWORK_WORKER, { isRawWorker: true }));
console.log(JSON.stringify(rawNetwork));
for (const [name, outcome] of Object.entries(rawNetwork)) check(outcome.startsWith('refused'), `raw worker code cannot use ${name}: ${outcome}`);
check(Object.keys(rawNetwork).length === RAW_NETWORK_NAMES, `all ${RAW_NETWORK_NAMES} raw network tries reported, ${Object.keys(rawNetwork).length} did`);

await Promise.all(
  REFUSED_ORDERS.map(async ({ name, ops }) => {
    const refused = await runScene(page, getOrderWorker(ops), { isRawWorker: true, settleMs: 0 });
    check(refused.replies.some(({ type, message }) => type === 'error' && /may not do/.test(message ?? '')), `the frame refuses an overlay order for ${name}, and stops that scene`);
  }),
);

const rawFlood = await runScene(page, RAW_FLOOD_WORKER, { isRawWorker: true, renderAfterReady: true, keepRendering: true, settleMs: TYPE_FOR_MS });
check(rawFlood.largestReplyChars < MOST_REPLY_CHARS, `raw worker code cannot send the page anything large: the largest reply was ${rawFlood.largestReplyChars} characters`);
if (args['real-chrome']) check(rawFlood.largestPageGapMs < LONGEST_PAGE_GAP_MS, `raw worker messages of 300 MB leave the page's frames alone: its largest gap was ${Math.round(rawFlood.largestPageGapMs)} ms`);

const odd = await runScene(page, RAW_ODD_WORKER, { isRawWorker: true, renderAfterReady: true, askAfterReady: true, settleMs: TYPE_FOR_MS });
const oddTypes = odd.replies.map(({ type }) => type);
check(['ready', 'gate', 'error'].every((type) => oddTypes.includes(type)), `a worker's odd ready, answer, and error were each passed on, so the next check measures them: ${oddTypes.join(', ')}`);
check(odd.largestReplyChars < MOST_REPLY_CHARS, `an ArrayBuffer or a Map in any field reaches the page as nothing: the largest reply was ${odd.largestReplyChars} characters`);
if (args['real-chrome']) check(odd.largestPageGapMs < LONGEST_PAGE_GAP_MS, `an ArrayBuffer of 300 MB leaves the page's frames alone: its largest gap was ${Math.round(odd.largestPageGapMs)} ms`);
check(odd.replies.every(({ type, phase }) => type !== 'error' || typeof phase === 'string'), `an error's phase is always a name, and it was ${odd.replies.find(({ type }) => type === 'error')?.phase}`);
check(oddTypes.filter((type) => type === 'loaded').length === 1, `a worker can say it loaded only once, and the page heard it ${oddTypes.filter((type) => type === 'loaded').length} times`);

const longAnswer = await runScene(page, RAW_LONG_ANSWER_WORKER, { isRawWorker: true, askAfterReady: true, settleMs: TYPE_FOR_MS });
check(longAnswer.replies.some(({ type, message }) => type === 'error' && /too much/.test(message ?? '')) && !longAnswer.replies.some(({ type }) => type === 'gate'), `an answer longer than the limit stops the scene and does not reach the page: ${longAnswer.replies.map(({ type }) => type).join(', ')}`);

await delay(SETTLE_MS);
check(hits.length === 0, `no request reached the server from any scene, ${hits.length} did${hits.length ? `: ${hits.join(', ')}` : ''}`);
check(stunHits.length === 0, `no packet reached the STUN server from any scene, ${stunHits.length} did`);

if (args['real-chrome']) {
  const busy = await getBusyRenderers();
  check(busy.length === 0, `no renderer keeps a core busy after its scene is gone, ${busy.length ? busy.join(', ') : 'none'}`);
}

await browser.close();
server.close();
stun.close();
if (failures.length) {
  console.error(`${failures.length} sandbox checks failed:\n${failures.join('\n')}`);
  process.exit(1);
}
console.log('The sandbox held.');
