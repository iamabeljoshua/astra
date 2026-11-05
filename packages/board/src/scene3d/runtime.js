import { createKit, mulberry } from './kit.js';
import { lockDown } from './lock-down.js';
import { createOverlayDom } from './overlay-dom.js';

const real = {
  raf: self.requestAnimationFrame.bind(self),
  now: performance.now.bind(performance),
  post: self.postMessage.bind(self),
  consoleError: console.error.bind(console),
  FileReaderSync: self.FileReaderSync,
};
const tell = (message) => real.post(message);

const MOST_RENDER_ERRORS = 3;
const BLANK_LIT = 0.002;
const BLANK_STD = 0.02;

let canvas = null;
let canvasSize = { width: 960, height: 540 };
let sceneSeconds = 0;
let rand = mulberry(1234);
const issues = [];

const dom = createOverlayDom({ getOverlayWidth: () => canvasSize.width });

self.addEventListener('error', (event) => tell({ type: 'error', phase: 'script', message: String(event.message), line: event.lineno, col: event.colno }));
self.addEventListener('unhandledrejection', (event) => tell({ type: 'error', phase: 'promise', message: String(event.reason) }));
console.error = (...parts) => {
  const message = parts.map((part) => (typeof part === 'string' ? part : part?.message ?? '')).join(' ');
  if (/Shader Error|VALIDATE_STATUS|WebGLProgram/.test(message)) tell({ type: 'error', phase: 'shader', message: message.slice(0, 900) });
  else issues.push(message.slice(0, 300));
  real.consoleError(...parts);
};

let kit = null;
let kitBeforeScene = null;
let sceneObject = null;
let wantSeconds = null;
let lastSeconds = null;
let renderErrors = 0;

const draw = (seconds) => {
  sceneSeconds = seconds;
  rand = mulberry(1234);
  kitBeforeScene.__frame(seconds, sceneObject.render ? (at) => sceneObject.render(at) : null);
  const ops = dom.takeOps();
  if (ops.length) tell({ type: 'overlay', ops });
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

function hasDrawnSomething({ moments, duration }) {
  const firstBeat = Math.min(duration, 1 + Math.min(...Object.values(moments), duration));
  return [duration / 2, firstBeat].some((seconds) => {
    draw(seconds);
    const { lit, std } = kitBeforeScene.__pixelStats();
    return lit >= BLANK_LIT || std >= BLANK_STD;
  });
}

async function start({ canvas: given, width, height, pixelRatio, fonts }) {
  canvas = given;
  canvasSize = { width, height };
  self.devicePixelRatio = pixelRatio;
  Object.defineProperties(canvas, {
    clientWidth: { get: () => canvasSize.width },
    clientHeight: { get: () => canvasSize.height },
  });
  canvas.addEventListener('webglcontextlost', () => tell({ type: 'error', phase: 'render', message: 'the graphics context was lost' }));
  await Promise.all(fonts.map(async ({ weight, url }) => {
    const face = new FontFace('Barlow', `url(${url})`, { weight: String(weight) });
    self.fonts.add(await face.load());
  }));
  tell({ type: 'loaded' });
}

async function load(command) {
  const startedAt = real.now();
  const textures = {};
  await Promise.all(Object.entries(command.textures || {}).map(async ([name, blob]) => {
    textures[name] = await createImageBitmap(blob, { imageOrientation: 'flipY', colorSpaceConversion: 'none' });
  }));
  const momentsSeen = new Set();
  try {
    kit = createKit({ canvas, overlay: dom.overlay, timing: command.timing, textures, quality: command.quality ?? 'high', theme: command.theme, onIssue: (message) => issues.push(message) });
    kitBeforeScene = { ...kit };
    noteMoments(momentsSeen);
    const buildStartedAt = real.now();
    if (typeof self.__scene !== 'function') throw new Error('scene code did not define function scene(kit)');
    sceneObject = self.__scene(kit) || {};
    if (typeof sceneObject === 'function') sceneObject = { render: sceneObject };
    const buildMs = real.now() - buildStartedAt;
    if (!hasDrawnSomething(command.timing)) throw new Error('the scene drew nothing');
    draw(wantSeconds ?? 0);
    const context = kitBeforeScene.renderer.getContext();
    tell({
      type: 'ready', issues: kitBeforeScene.__issues().concat(issues), params: kitBeforeScene.__params(), sinceStartMs: real.now() - startedAt, buildMs,
      buffer: [context.drawingBufferWidth, context.drawingBufferHeight, self.devicePixelRatio],
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
    const stats = kitBeforeScene.__pixelStats();
    cost += real.now() - startedAt;
    result.samples.push({ t: time, mean: +stats.mean.toFixed(4), std: +stats.std.toFixed(4), lit: +stats.lit.toFixed(4), hash: stats.hash });
  }
  for (const sample of [...result.samples].reverse()) {
    draw(sample.t);
    if (kitBeforeScene.__pixelStats().hash !== sample.hash) {
      result.deterministic = false;
      result.mismatches.push(sample.t);
    }
  }
  result.costMean = cost / Math.max(times.length, 1);
  lastSeconds = null;
  return result;
}

const COMMANDS = {
  start,
  load,
  render: ({ seconds }) => { wantSeconds = seconds; },
  resize({ width, height }) {
    canvasSize = { width, height };
    kitBeforeScene?.__resize();
    lastSeconds = null;
  },
  beat: ({ id }) => tell({ type: 'beat', id }),
  gate({ times }) {
    try { tell({ type: 'gate', result: runGate(times), issues: kitBeforeScene.__issues().concat(issues) }); }
    catch (error) { tell({ type: 'gate', error: String(error.message), issues: kitBeforeScene?.__issues().concat(issues) ?? issues }); }
  },
  snapshot({ times }) {
    const result = [];
    try { for (const time of times) { draw(time); result.push(kitBeforeScene.__snapshot(time)); } tell({ type: 'snapshot', result, params: kitBeforeScene.__params() }); }
    catch (error) { tell({ type: 'snapshot', error: String(error.message), result }); }
    lastSeconds = null;
  },
  audit({ times }) {
    const result = [];
    try { for (const time of times) { draw(time); result.push({ t: time, rects: kitBeforeScene.__rects().map((rect) => ({ ...rect })), hud: kitBeforeScene.__hud(), probe: sceneObject.probe ? sceneObject.probe(time) : null, info: kitBeforeScene.__info() }); } tell({ type: 'audit', result }); }
    catch (error) { tell({ type: 'audit', error: String(error.message), result }); }
    lastSeconds = null;
  },
  flash({ times, cols, rows }) {
    const result = [];
    try { for (const time of times) { draw(time); const { mean, tiles } = kitBeforeScene.__tiles(cols, rows); result.push({ t: time, mean, tiles }); } tell({ type: 'flash', result }); }
    catch (error) { tell({ type: 'flash', error: String(error.message), result }); }
    lastSeconds = null;
  },
  async picture({ seconds, id }) {
    draw(seconds);
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.86 });
    tell({ type: 'picture', url: new real.FileReaderSync().readAsDataURL(blob), id });
    lastSeconds = null;
  },
};

self.addEventListener('message', (event) => {
  const command = event.data;
  if (typeof command?.type === 'string' && Object.hasOwn(COMMANDS, command.type)) COMMANDS[command.type](command);
});

lockDown({ document: dom.document, getSeconds: () => sceneSeconds, getRandom: () => rand(), noteIssue: (issue) => issues.push(issue) });
real.raf(loop);
