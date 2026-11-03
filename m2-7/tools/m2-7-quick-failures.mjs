import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';

export const deadlineMs = 90_000;

const PROXY = process.env.M27_PROXY;
const OUT = process.env.M27_OUT;
const SERVER_LINE = 'Your home screen did not load. The fault is on our side.';
const NETWORK_LINE = 'Your home screen did not load. Check your connection.';
const WAIT_MS = 20_000;
const QUIET_WATCH_MS = 3000;

const setMode = (mode) => fetch(`${PROXY}/__proxy/mode/${mode}`);
const seconds = (durationMs) => Number((durationMs / 1000).toFixed(3));

async function loadWithFailure(page, mode, failureLine) {
  const startedAt = [];
  const onRequest = (request) => {
    if (new URL(request.url()).pathname === '/api/home') startedAt.push(Date.now());
  };
  page.on('request', onRequest);
  await setMode(mode);
  await page.goto(`${PROXY}/`);
  await page.getByRole('alert').filter({ hasText: failureLine }).waitFor({ timeout: WAIT_MS });
  const failureLineAt = Date.now();
  await page.waitForTimeout(QUIET_WATCH_MS);
  page.off('request', onRequest);
  return { browserRequests: startedAt.length, secondsFromFirstRequestToFailureLine: seconds(failureLineAt - startedAt[0]) };
}

export default async function quickFailures({ page, capture, viewportName }) {
  const results = { viewportName };
  results.server500 = await loadWithFailure(page, 'fail500', SERVER_LINE);
  await capture('server-failure');
  results.networkFailure = await loadWithFailure(page, 'reset', NETWORK_LINE);
  await capture('network-failure');
  await setMode('pass');
  await page.getByRole('button', { name: 'Try again' }).click();
  await page.locator('main li').first().waitFor({ timeout: 10_000 });
  writeFileSync(`${OUT}/quick-failures-${viewportName}.json`, `${JSON.stringify(results, null, 2)}\n`);
  assert.equal(results.server500.browserRequests, 3, 'a 500 is tried three times');
  assert.equal(results.networkFailure.browserRequests, 3, 'a network failure is tried three times');
}
