import assert from 'node:assert/strict';
import { answerBirthDate, answerName, reachInterests, readChart, signInAsNewStudent, waitForChartToSettle } from './onboarding-support.mjs';

export const deadlineMs = 120_000;

const NAME = 'Maya';

export default async function onboardingReload({ page, capture, viewportName, signInWithCode }) {
  await signInAsNewStudent(page, signInWithCode, `look-reload-${viewportName}-${Date.now()}@astra.test`);
  await answerName(page, capture, NAME);
  await answerBirthDate(page, capture, { day: '14', month: '3', year: '2004' });
  await reachInterests(page);
  await waitForChartToSettle();
  const chartBeforeReload = await readChart(page);
  await capture('name-before-reload');

  await page.reload();
  await reachInterests(page);
  await waitForChartToSettle();
  await capture('name-after-reload');

  assert.equal(await readChart(page), chartBeforeReload, "the name's dots after a reload differ from the ones before it, so they were drawn in another font");
}
