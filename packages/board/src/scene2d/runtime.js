import { lockDown } from '../scene3d/lock-down.js';
import { CHECK_HEIGHT, CHECK_WIDTH, getCheckTimes, getFrameProblems, getLostPointers, watchContext } from './frame-check.js';
import { makeKit } from './kit2d.js';

const real = {
  raf: self.requestAnimationFrame.bind(self),
  now: performance.now.bind(performance),
  post: self.postMessage.bind(self),
  FileReaderSync: self.FileReaderSync,
};
const tell = (message) => real.post(message);

const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 720;
const MOST_RENDER_ERRORS = 3;
const RANDOM_SEED = 1234;
// A frame's script runs before its parent has laid it out, so its first size can be zero, and the size comes with the first resize.
const DRAW_SIZE_UNTIL_LAID_OUT = { width: 960, height: 540 };
const TEXTURE_NAMES = { '2k_earth_daymap': 'earth-day', '2k_earth_clouds': 'earth-clouds' };

let canvas = null;
let context = null;
let canvasSize = DRAW_SIZE_UNTIL_LAID_OUT;
let pixelRatio = 1;
let stage = { scale: 1, left: 0, top: 0 };
let sceneSeconds = 0;
let rand = () => 0.5;
const issues = [];

let kit = null;
let sceneObject = null;
let wantSeconds = null;
let lastSeconds = null;
let renderErrors = 0;
let labelsInCheck = null;
let lostPointers = new Set();

self.addEventListener('error', (event) => tell({ type: 'error', phase: 'script', message: String(event.message), line: event.lineno, col: event.colno }));
self.addEventListener('unhandledrejection', (event) => tell({ type: 'error', phase: 'promise', message: String(event.reason) }));
console.error = (...parts) => { issues.push(parts.map((part) => (typeof part === 'string' ? part : part?.message ?? '')).join(' ').slice(0, 300)); };

function fitStage() {
  const width = Math.max(1, Math.round(canvasSize.width * pixelRatio));
  const height = Math.max(1, Math.round(canvasSize.height * pixelRatio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const scale = Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);
  stage = { scale, left: (width - DESIGN_WIDTH * scale) / 2, top: (height - DESIGN_HEIGHT * scale) / 2 };
}

const draw = (seconds) => {
  sceneSeconds = seconds;
  rand = kit.rng(RANDOM_SEED);
  kit.setNow(seconds);
  context.reset();
  context.fillStyle = kit.paperColor;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.setTransform(stage.scale, 0, 0, stage.scale, stage.left, stage.top);
  context.save();
  context.beginPath();
  context.rect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
  context.clip();
  try {
    sceneObject.render(seconds);
  } finally {
    context.restore();
  }
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
  if (wantSeconds !== null && wantSeconds !== lastSeconds && sceneObject) drawWanted();
};

// A scene may have taken kit.label for itself while it built, so the one it holds has to be the one that listens.
function withWatchedLabels(madeKit) {
  const { label } = madeKit;
  madeKit.label = (text, options = {}) => {
    if (!labelsInCheck) return label(text, lostPointers.has(String(text)) ? { ...options, to: undefined } : options);
    context.save();
    context.font = madeKit.font(options.size ?? 28, options.weight ?? 600);
    const { width } = context.measureText(String(text));
    context.restore();
    labelsInCheck.push({ text: String(text), to: options.to, alpha: madeKit.shown(options), width });
    return undefined;
  };
  return madeKit;
}

function checkFrames(timing) {
  const checkContext = new OffscreenCanvas(CHECK_WIDTH, CHECK_HEIGHT).getContext('2d', { willReadFrequently: true });
  const watch = watchContext(context, () => stage);
  const frames = [];
  try {
    for (const seconds of getCheckTimes(timing)) {
      labelsInCheck = [];
      draw(seconds);
      checkContext.drawImage(canvas, stage.left, stage.top, DESIGN_WIDTH * stage.scale, DESIGN_HEIGHT * stage.scale, 0, 0, CHECK_WIDTH, CHECK_HEIGHT);
      frames.push({ seconds, labels: labelsInCheck, cells: checkContext.getImageData(0, 0, CHECK_WIDTH, CHECK_HEIGHT).data, width: CHECK_WIDTH, height: CHECK_HEIGHT, ...watch.takeNotes() });
    }
  } finally {
    labelsInCheck = null;
    watch.stop();
  }
  lostPointers = new Set(getLostPointers(frames));
  return getFrameProblems(frames);
}

async function start({ canvas: given, width, height, pixelRatio: ratio, fonts }) {
  canvas = given;
  if (width > 0 && height > 0) canvasSize = { width, height };
  pixelRatio = ratio;
  context = canvas.getContext('2d', { alpha: false });
  await Promise.all(fonts.map(async ({ weight, url }) => {
    const face = new FontFace('Barlow', `url(${url})`, { weight: String(weight) });
    self.fonts.add(await face.load());
  }));
  tell({ type: 'loaded' });
}

async function getImages(textures = {}) {
  const pairs = await Promise.all(Object.entries(textures).map(async ([name, blob]) => [TEXTURE_NAMES[name] ?? name, await createImageBitmap(blob, { colorSpaceConversion: 'none' })]));
  return Object.fromEntries(pairs);
}

async function load(command) {
  const startedAt = real.now();
  const images = await getImages(command.textures);
  try {
    fitStage();
    kit = withWatchedLabels(makeKit({ ctx: context, timing: command.timing, theme: command.theme, images, pxScale: Math.max(stage.scale, pixelRatio) }));
    const buildStartedAt = real.now();
    if (typeof self.__scene !== 'function') throw new Error('scene code did not define function scene(kit)');
    sceneObject = self.__scene(kit) || {};
    if (typeof sceneObject === 'function') sceneObject = { render: sceneObject };
    if (typeof sceneObject.render !== 'function') throw new Error('the scene has no render(t)');
    const buildMs = real.now() - buildStartedAt;
    const problems = checkFrames(command.timing);
    if (problems.length > 0) throw new Error(`the frame check refused it: ${problems.join('; ')}`);
    draw(wantSeconds ?? 0);
    tell({ type: 'ready', issues, params: { lostPointers: [...lostPointers] }, sinceStartMs: real.now() - startedAt, buildMs, buffer: [canvas.width, canvas.height, pixelRatio], parts: [], unusedMoments: [] });
    wantSeconds ??= 0;
  } catch (error) {
    sceneObject = null;
    tell({ type: 'error', phase: 'build', message: String(error.message), stack: String(error.stack).slice(0, 700) });
  }
}

const COMMANDS = {
  start,
  load,
  render: ({ seconds }) => { wantSeconds = seconds; },
  resize({ width, height }) {
    if (width > 0 && height > 0) canvasSize = { width, height };
    fitStage();
    lastSeconds = null;
  },
  beat: ({ id }) => tell({ type: 'beat', id }),
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

lockDown({ document: undefined, getSeconds: () => sceneSeconds, getRandom: () => rand(), noteIssue: (issue) => issues.push(issue) });
real.raf(loop);
