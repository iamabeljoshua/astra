import assert from 'node:assert/strict';
import { answerName, signInAsNewStudent } from './onboarding-support.mjs';

export const deadlineMs = 90_000;

const SMALLEST_TAP_TARGET = 24;
const HIDE_BUTTON_TEXT = 'button { color: transparent !important; }';

async function isOneColor(pngBase64) {
  const response = await fetch(`data:image/png;base64,${pngBase64}`);
  const bitmap = await createImageBitmap(await response.blob());
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0);
  const pixels = new Uint32Array(context.getImageData(0, 0, bitmap.width, bitmap.height).data.buffer);
  return pixels.every((pixel) => pixel === pixels[0]);
}

async function assertNoDotShowsThroughToggle(page, screenName) {
  const unpressed = await page.getByRole('button', { name: 'Dark' }).screenshot({ style: HIDE_BUTTON_TEXT });
  assert.ok(await page.evaluate(isOneColor, unpressed.toString('base64')), `a chart dot shows through the unpressed toggle on ${screenName}`);
}

async function assertBigEnoughToTap(page, name) {
  const { width, height } = await page.getByRole('button', { name }).boundingBox();
  assert.ok(width >= SMALLEST_TAP_TARGET && height >= SMALLEST_TAP_TARGET, `${name} is ${width} by ${height}, under ${SMALLEST_TAP_TARGET} px to tap`);
}

export default async function dotPageControls({ page, capture, viewportName, signInWithCode }) {
  await signInAsNewStudent(page, signInWithCode, `look-controls-${viewportName}-${Date.now()}@astra.test`);
  await page.getByRole('heading', { name: 'What should I call you?' }).waitFor();
  await assertNoDotShowsThroughToggle(page, 'the name step');
  await assertBigEnoughToTap(page, 'Sign out');
  await capture('name-step');

  await answerName(page, capture, 'Maya');
  await page.getByRole('heading', { name: 'When were you born?' }).waitFor();
  await assertBigEnoughToTap(page, 'Back');
  await assertBigEnoughToTap(page, 'Dark');
  await capture('birth-date-step');
}
