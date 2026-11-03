import { chromium } from 'playwright';
import { TIMEOUTS_MS } from './settings.mjs';

const INSTALL_COMMAND = 'pnpm exec playwright install chromium --no-shell';
const GPU_CAPABLE_CHANNEL = 'chromium';
const FAKE_MICROPHONE_ARGS = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'];
const WEBGL_CLEAR_COLOR = [255, 128, 0, 255];
const AUDIBLE_PEAK = 0.01;
// verify.mjs owns signals, because Playwright's handlers can exit the process before the app stops.
const LAUNCH_OPTIONS = {
  channel: GPU_CAPABLE_CHANNEL,
  args: FAKE_MICROPHONE_ARGS,
  handleSIGINT: false,
  handleSIGTERM: false,
  handleSIGHUP: false,
};

export async function launchBrowser() {
  try {
    return await chromium.launch(LAUNCH_OPTIONS);
  } catch (error) {
    throw new Error(`Chromium did not start. Run "${INSTALL_COMMAND}".\n${error.message}`);
  }
}

function probeWebgl(expectedPixel) {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  if (!gl) return { passed: false, detail: 'no WebGL 2 context' };
  gl.clearColor(...expectedPixel.map((channel) => channel / 255));
  gl.clear(gl.COLOR_BUFFER_BIT);
  const pixel = new Uint8Array(4);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  const passed = pixel.every((channel, index) => channel === expectedPixel[index]);
  const rendererInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL);
  return { passed, detail: `${renderer} drew ${pixel.join(',')}` };
}

async function probeAudio({ timeoutMs, audiblePeak }) {
  const audioContext = new AudioContext();
  await audioContext.resume();

  async function getPeakFrom(sourceNode) {
    const analyser = audioContext.createAnalyser();
    sourceNode.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const deadline = performance.now() + timeoutMs;
    let peak = 0;
    while (peak < audiblePeak && performance.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      analyser.getFloatTimeDomainData(samples);
      peak = Math.max(...samples.map(Math.abs));
    }
    return peak;
  }

  const oscillator = audioContext.createOscillator();
  oscillator.connect(audioContext.destination);
  oscillator.start();
  const outputPeak = await getPeakFrom(oscillator);
  oscillator.stop();

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const microphonePeak = await getPeakFrom(audioContext.createMediaStreamSource(stream));
  const microphoneLabel = stream.getAudioTracks()[0].label;
  stream.getTracks().forEach((track) => track.stop());
  await audioContext.close();
  return { outputPeak, microphonePeak, microphoneLabel };
}

async function getBrowserChecks(page) {
  const webgl = await page.evaluate(probeWebgl, WEBGL_CLEAR_COLOR);
  const audio = await page.evaluate(probeAudio, {
    timeoutMs: TIMEOUTS_MS.audioSignal,
    audiblePeak: AUDIBLE_PEAK,
  });
  return [
    { name: 'webgl', ...webgl },
    { name: 'audio output', passed: audio.outputPeak >= AUDIBLE_PEAK, detail: `peak ${audio.outputPeak}` },
    {
      name: 'microphone',
      passed: audio.microphonePeak >= AUDIBLE_PEAK,
      detail: `${audio.microphoneLabel}, peak ${audio.microphonePeak}`,
    },
  ];
}

export async function getIdentityCheck(page, productName) {
  const url = page.url();
  try {
    await page.waitForFunction((name) => document.title.includes(name), productName, {
      timeout: TIMEOUTS_MS.pageIdentity,
    });
    return { name: 'identity', passed: true, detail: `${url} is ${productName}` };
  } catch {
    const title = await page.title();
    return { name: 'identity', passed: false, detail: `${url} has title "${title}", not ${productName}` };
  }
}

// Decodes the PNG in a spare page, because Node has no image decoder and a canvas needs no dependency.
async function readUniformColor(pngBase64) {
  const response = await fetch(`data:image/png;base64,${pngBase64}`);
  const bitmap = await createImageBitmap(await response.blob());
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0);
  const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
  const pixels = new Uint32Array(data.buffer);
  const isUniform = pixels.every((pixel) => pixel === pixels[0]);
  return isUniform ? `rgba(${data.slice(0, 4).join(', ')})` : null;
}

export async function getScreenshotCheck({ browser, screenshot }) {
  const inspector = await browser.newPage();
  try {
    const uniformColor = await inspector.evaluate(readUniformColor, screenshot.toString('base64'));
    const detail = uniformColor ? `every pixel is ${uniformColor}, so the page looks blank` : 'has more than one color';
    return { name: 'screenshot', passed: !uniformColor, detail };
  } finally {
    await inspector.close();
  }
}

export function watchContextFailures(context) {
  const failures = [];
  const addFailure = (name, detail) => failures.push({ name, passed: false, detail });
  context.on('weberror', (webError) => addFailure('page error', webError.error().message));
  context.on('console', (message) => {
    if (message.type() === 'error') addFailure('console error', `${message.text()} (${message.location().url})`);
  });
  context.on('page', (page) => page.on('crash', () => addFailure('page crash', page.url())));
  return failures;
}

export async function getPageChecks({ baseURL, productName }) {
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({ baseURL });
    const contextFailures = watchContextFailures(context);
    const page = await context.newPage();
    await page.goto('/');
    const identityCheck = await getIdentityCheck(page, productName);
    return [identityCheck, ...(await getBrowserChecks(page)), ...contextFailures];
  } finally {
    await browser.close();
  }
}
