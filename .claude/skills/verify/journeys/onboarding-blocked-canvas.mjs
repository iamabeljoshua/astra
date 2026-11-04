import assert from 'node:assert/strict';
import { answerBirthDate, reachInterests, readChart, signInAsNewStudent, waitForChartToSettle } from './onboarding-support.mjs';

export const deadlineMs = 120_000;

const NAME = 'Maya';

function throwOnCanvasRead() {
  CanvasRenderingContext2D.prototype.getImageData = () => {
    throw new DOMException('Blocked by this browser', 'SecurityError');
  };
}

// Privacy-hardened Firefox answers every read with one short pattern repeated, measured with privacy.resistFingerprinting on.
function answerCanvasReadWithNoise() {
  const noise = Array.from({ length: 32 }, (_unused, index) => (index * 89 + 37) % 256);
  CanvasRenderingContext2D.prototype.getImageData = (_left, _top, width, height) => ({
    data: Uint8ClampedArray.from({ length: width * height * 4 }, (_unused, index) => noise[index % noise.length]),
  });
}

export default async function onboardingBlockedCanvas({ page, capture, viewportName, signInWithCode }) {
  await page.addInitScript(throwOnCanvasRead);
  await signInAsNewStudent(page, signInWithCode, `look-canvas-${viewportName}-${Date.now()}@astra.test`);
  await page.getByRole('heading', { name: 'What should I call you?' }).waitFor();
  const planet = await readChart(page);

  await page.getByRole('textbox', { name: 'Your first name' }).fill(NAME);
  await page.getByText(`A learning app, made for ${NAME}`).waitFor();
  await waitForChartToSettle();
  await capture('read-throws');
  assert.equal(await readChart(page), planet, 'a browser that refuses canvas reads keeps the planet, with the name in plain type');

  await page.getByRole('button', { name: 'Continue' }).click();
  await answerBirthDate(page, capture, { day: '14', month: '3', year: '2004' });
  await reachInterests(page);
  await waitForChartToSettle();
  const planetOnInterests = await readChart(page);

  await page.addInitScript(answerCanvasReadWithNoise);
  await page.reload();
  await reachInterests(page);
  await page.getByText(`A learning app, made for ${NAME}`).waitFor();
  await waitForChartToSettle();
  await capture('read-gives-noise');
  assert.equal(await readChart(page), planetOnInterests, 'a browser that answers canvas reads with noise keeps the planet, not a dotted rectangle');
}
