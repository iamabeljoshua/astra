// Runs inside the sandboxed iframe. The page owns the clock and sends the time, and this only ever draws that time.
import { createKit, mulberry } from './kit.js';

const real = {
  raf: window.requestAnimationFrame.bind(window),
  now: performance.now.bind(performance),
  post: window.parent.postMessage.bind(window.parent),
  consoleError: console.error.bind(console),
};
const tell = (message) => real.post(message, '*');

const LOAD_BUDGET_MS = 3000;
const FRAME_BUDGET_MS = 250;
const MOST_RENDER_ERRORS = 3;

let sceneSeconds = 0;
let rand = mulberry(1234);
const issues = [];

function lockDown() {
  Math.random = () => rand();
  performance.now = () => sceneSeconds * 1000;
  const RealDate = Date;
  const base = 1767225600000;
  class FrozenDate extends RealDate {
    constructor(...parts) { if (parts.length) super(...parts); else super(base + sceneSeconds * 1000); }
    static now() { return base + sceneSeconds * 1000; }
  }
  window.Date = FrozenDate;
  const blockedTime = (name) => () => { issues.push(`${name} is not available. render(t) is called for you.`); return 0; };
  window.requestAnimationFrame = blockedTime('requestAnimationFrame');
  window.setTimeout = blockedTime('setTimeout');
  window.setInterval = blockedTime('setInterval');
  for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'RTCPeerConnection', 'webkitRTCPeerConnection', 'Worker', 'SharedWorker', 'BroadcastChannel', 'importScripts']) {
    try { Object.defineProperty(window, name, { value: undefined, configurable: false }); } catch { /* Already gone in this browser. */ }
  }
  try { navigator.sendBeacon = () => false; } catch { /* Already gone in this browser. */ }
}

window.addEventListener('error', (event) => tell({ type: 'error', phase: 'script', message: String(event.message), line: event.lineno, col: event.colno }));
window.addEventListener('unhandledrejection', (event) => tell({ type: 'error', phase: 'promise', message: String(event.reason) }));
console.error = (...parts) => {
  const message = parts.map((part) => (typeof part === 'string' ? part : part?.message ?? '')).join(' ');
  if (/Shader Error|VALIDATE_STATUS|WebGLProgram/.test(message)) tell({ type: 'error', phase: 'shader', message: message.slice(0, 900) });
  else issues.push(message.slice(0, 300));
  real.consoleError(...parts);
};

// A loop in scene code calls this, under a name the scene cannot know. A frame gets 250 ms and the build gets 3 s before the loop is stopped with an error.
let guardDeadline = real.now() + LOAD_BUDGET_MS;
window.__guard = () => {
  if (real.now() > guardDeadline) {
    guardDeadline = Infinity;
    throw new Error('A loop ran too long and was stopped. Loops must finish within one frame.');
  }
};
const withBudget = (budgetMs, work) => {
  guardDeadline = real.now() + budgetMs;
  try { return work(); } finally { guardDeadline = Infinity; }
};

let kit = null;
let sceneObject = null;
let wantSeconds = null;
let lastSeconds = null;
let renderErrors = 0;
let isDisposed = false;
let bitmaps = [];

const draw = (seconds) => {
  sceneSeconds = seconds;
  rand = mulberry(1234);
  withBudget(FRAME_BUDGET_MS, () => kit.__frame(seconds, sceneObject.render ? (at) => sceneObject.render(at) : null));
};

function drawWanted() {
  const startedAt = real.now();
  try {
    draw(wantSeconds);
  } catch (error) {
    renderErrors += 1;
    if (renderErrors <= MOST_RENDER_ERRORS) tell({ type: 'error', phase: 'render', message: String(error.message), stack: String(error.stack).slice(0, 700), seconds: wantSeconds });
    if (renderErrors >= MOST_RENDER_ERRORS) wantSeconds = null;
    return;
  }
  lastSeconds = wantSeconds;
  tell({ type: 'drawn', seconds: lastSeconds, costMs: real.now() - startedAt });
}

const loop = () => {
  if (isDisposed) return;
  real.raf(loop);
  if (wantSeconds !== null && wantSeconds !== lastSeconds && kit) drawWanted();
};

function noteMoments(momentsSeen) {
  const seen = (name) => { if (typeof name === 'string') momentsSeen.add(name); };
  const { at, p, env, shot, shots, label, title } = kit;
  kit.at = (moment) => { seen(moment); return at(moment); };
  kit.p = (time, moment, ...rest) => { seen(moment); return p(time, moment, ...rest); };
  kit.env = (time, from, to, ...rest) => { seen(from); seen(to); return env(time, from, to, ...rest); };
  kit.shot = (one) => { seen(one.at); return shot(one); };
  kit.shots = (list) => { list.forEach((one) => seen(one.at)); return shots(list); };
  kit.label = (text, options = {}) => { seen(options.show); return label(text, options); };
  kit.title = (text, options = {}) => { seen(options.show); return title(text, options); };
}

async function load(command) {
  const startedAt = real.now();
  const textures = {};
  await Promise.all(Object.entries(command.textures || {}).map(async ([name, blob]) => {
    textures[name] = await createImageBitmap(blob, { imageOrientation: 'flipY', colorSpaceConversion: 'none' });
    bitmaps.push(textures[name]);
  }));
  const momentsSeen = new Set();
  try {
    document.documentElement.dataset.theme = command.theme;
    kit = createKit({ canvas: document.getElementById('c'), overlay: document.getElementById('o'), timing: command.timing, textures, quality: command.quality ?? 'high', theme: command.theme, onIssue: (message) => issues.push(message) });
    noteMoments(momentsSeen);
    const buildStartedAt = real.now();
    if (typeof window.__scene !== 'function') throw new Error('scene code did not define function scene(kit)');
    sceneObject = withBudget(LOAD_BUDGET_MS, () => window.__scene(kit)) || {};
    if (typeof sceneObject === 'function') sceneObject = { render: sceneObject };
    const buildMs = real.now() - buildStartedAt;
    draw(wantSeconds ?? 0);
    const context = kit.renderer.getContext();
    tell({
      type: 'ready', issues: kit.__issues().concat(issues), params: kit.__params(), sinceStartMs: real.now() - startedAt, buildMs,
      buffer: [context.drawingBufferWidth, context.drawingBufferHeight, window.devicePixelRatio],
      parts: Object.keys(kit.parts).filter((name) => !name.startsWith('label:')),
      unusedMoments: Object.keys(command.timing.moments || {}).filter((name) => !momentsSeen.has(name)),
    });
    wantSeconds ??= 0;
  } catch (error) {
    tell({ type: 'error', phase: 'build', message: String(error.message), stack: String(error.stack).slice(0, 700) });
  }
}

function runGate(times) {
  const result = { samples: [], deterministic: true, mismatches: [], costMean: 0 };
  let cost = 0;
  for (const time of times) {
    const startedAt = real.now();
    draw(time);
    const stats = kit.__pixelStats();
    cost += real.now() - startedAt;
    result.samples.push({ t: time, mean: +stats.mean.toFixed(4), std: +stats.std.toFixed(4), lit: +stats.lit.toFixed(4), hash: stats.hash });
  }
  for (const sample of [...result.samples].reverse()) {
    draw(sample.t);
    if (kit.__pixelStats().hash !== sample.hash) {
      result.deterministic = false;
      result.mismatches.push(sample.t);
    }
  }
  result.costMean = cost / Math.max(times.length, 1);
  lastSeconds = null;
  return result;
}

function dispose() {
  isDisposed = true;
  wantSeconds = null;
  kit?.__dispose();
  kit = null;
  sceneObject = null;
  for (const bitmap of bitmaps) bitmap.close();
  bitmaps = [];
}

const COMMANDS = {
  load,
  render: ({ seconds }) => { wantSeconds = seconds; },
  resize: () => { kit?.__resize(); lastSeconds = null; },
  theme: ({ theme }) => { document.documentElement.dataset.theme = theme; kit?.__theme(theme); lastSeconds = null; },
  dispose,
  ping: ({ id }) => tell({ type: 'pong', id }),
  gate({ times }) {
    try { tell({ type: 'gate', result: runGate(times), issues: kit.__issues().concat(issues) }); }
    catch (error) { tell({ type: 'gate', error: String(error.message), issues: kit?.__issues().concat(issues) ?? issues }); }
  },
  snapshot({ times }) {
    const result = [];
    try { for (const time of times) { draw(time); result.push(kit.__snapshot(time)); } tell({ type: 'snapshot', result, params: kit.__params() }); }
    catch (error) { tell({ type: 'snapshot', error: String(error.message), result }); }
    lastSeconds = null;
  },
  picture({ seconds, id }) {
    draw(seconds);
    tell({ type: 'picture', url: document.getElementById('c').toDataURL('image/jpeg', 0.86), id });
    lastSeconds = null;
  },
};

window.addEventListener('message', (event) => {
  if (event.source !== window.parent) return;
  const command = event.data;
  if (typeof command?.type === 'string' && Object.hasOwn(COMMANDS, command.type)) COMMANDS[command.type](command);
});

lockDown();
real.raf(loop);
tell({ type: 'loaded' });
