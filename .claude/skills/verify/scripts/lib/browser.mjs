import { chromium } from 'playwright';
import { TIMEOUTS_MS } from './settings.mjs';

const INSTALL_COMMAND = 'pnpm exec playwright install chromium --no-shell';
const FAKE_MICROPHONE_ARGS = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'];
const WEBGL_CLEAR_COLOR = [255, 128, 0, 255];
// The app has no favicon until M1.3, and its 404 arrives at an unpredictable moment.
const MISSING_FAVICON_PATH = '/favicon.ico';

// The full Chromium build, not the headless shell, uses the real GPU when the machine has one.
export async function launchBrowser() {
  try {
    return await chromium.launch({ channel: 'chromium', args: FAKE_MICROPHONE_ARGS });
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

async function probeAudio(timeoutMs) {
  const audioContext = new AudioContext();
  await audioContext.resume();

  async function getPeakFrom(sourceNode) {
    const analyser = audioContext.createAnalyser();
    sourceNode.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const deadline = performance.now() + timeoutMs;
    let peak = 0;
    while (peak === 0 && performance.now() < deadline) {
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

export async function getBrowserChecks(page) {
  const webgl = await page.evaluate(probeWebgl, WEBGL_CLEAR_COLOR);
  const audio = await page.evaluate(probeAudio, TIMEOUTS_MS.audioSignal);
  return [
    { name: 'webgl', ...webgl },
    { name: 'audio output', passed: audio.outputPeak > 0, detail: `peak ${audio.outputPeak}` },
    {
      name: 'microphone',
      passed: audio.microphonePeak > 0,
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

export function watchPageFailures(page) {
  const failures = [];
  const addFailure = (name, detail) => failures.push({ name, passed: false, detail });
  page.on('pageerror', (error) => addFailure('page error', error.message));
  page.on('crash', () => addFailure('page crash', page.url()));
  page.on('console', (message) => {
    const { url } = message.location();
    if (message.type() === 'error' && !url.endsWith(MISSING_FAVICON_PATH)) {
      addFailure('console error', `${message.text()} (${url})`);
    }
  });
  return failures;
}
