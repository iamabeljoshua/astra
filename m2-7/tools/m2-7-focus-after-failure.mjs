import { writeFileSync } from 'node:fs';

export const deadlineMs = 120_000;

const PROXY = process.env.M27_PROXY;
const OUT = process.env.M27_OUT;
const FAILURE_LINE = 'Your home screen is taking too long to load.';
const WAIT_MS = 45_000;
const SETTLE_MS = 500;

const setMode = (mode) => fetch(`${PROXY}/__proxy/mode/${mode}`);
const clearCalls = () => fetch(`${PROXY}/__proxy/clear`);
const getHomeCalls = async () => (await (await fetch(`${PROXY}/__proxy/calls`)).json()).filter((call) => call.path === '/api/home');

export default async function focusAfterFailure({ page, viewportName }) {
  await setMode('hang');
  await clearCalls();
  await page.goto(`${PROXY}/`);
  const failureLine = page.getByRole('alert').filter({ hasText: FAILURE_LINE });
  await failureLine.waitFor({ timeout: WAIT_MS });
  const callsBeforeFocus = (await getHomeCalls()).length;
  const focusedAt = Date.now();
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(SETTLE_MS);
  const results = {
    viewportName,
    documentVisibility: await page.evaluate(() => document.visibilityState),
    callsBeforeFocus,
    callsAfterFocus: (await getHomeCalls()).length,
    failureLineStillShownAfterFocus: await failureLine.count(),
    loadingShownAfterFocus: await page.getByText('Loading your home screen.').count(),
  };
  await failureLine.waitFor({ timeout: WAIT_MS });
  results.secondsFromFocusToFailureLineAgain = (Date.now() - focusedAt) / 1000;
  await setMode('pass');
  await page.getByRole('button', { name: 'Try again' }).click();
  await page.locator('main li').first().waitFor({ timeout: 10_000 });
  writeFileSync(`${OUT}/focus-after-failure-${viewportName}.json`, `${JSON.stringify(results, null, 2)}\n`);
}
