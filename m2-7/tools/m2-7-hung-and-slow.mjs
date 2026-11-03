import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';

export const deadlineMs = 240_000;

const PROXY = process.env.M27_PROXY;
const OUT = process.env.M27_OUT;
const IS_BASELINE = process.env.M27_BASELINE === '1';
const FAILURE_LINE = 'Your home screen is taking too long to load.';
const LONG_WAIT_MS = 60_000;
const QUIET_WATCH_MS = 3000;

const setMode = (mode) => fetch(`${PROXY}/__proxy/mode/${mode}`);
const clearCalls = () => fetch(`${PROXY}/__proxy/clear`);
const getCalls = async () => (await fetch(`${PROXY}/__proxy/calls`)).json();
const getHomeCalls = async () => (await getCalls()).filter((call) => call.path === '/api/home');
const seconds = (durationMs) => Number((durationMs / 1000).toFixed(3));

function watchPage(page) {
  return page.addInitScript(() => {
    window.__firstAlertAt = null;
    window.__cardsAt = null;
    new MutationObserver(() => {
      if (!window.__firstAlertAt && document.querySelector('[role="alert"]')) window.__firstAlertAt = Date.now();
      if (!window.__cardsAt && document.querySelector('main li')) window.__cardsAt = Date.now();
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });
}

async function resetAlertStamp(page) {
  await page.evaluate(() => {
    window.__firstAlertAt = null;
  });
}

const getStamps = (page) => page.evaluate(() => ({ alertAt: window.__firstAlertAt, cardsAt: window.__cardsAt }));

function trackHomeRequests(page) {
  const startedAt = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/home') startedAt.push(Date.now());
  });
  return startedAt;
}

async function openFromProxy(page) {
  await page.goto(`${PROXY}/`);
}

async function runHung(page, startedAt, results) {
  await setMode('hang');
  await clearCalls();
  startedAt.length = 0;
  await openFromProxy(page);
  await page.getByRole('alert').filter({ hasText: FAILURE_LINE }).waitFor({ timeout: LONG_WAIT_MS });
  const { alertAt } = await getStamps(page);
  await page.waitForTimeout(QUIET_WATCH_MS);
  const calls = await getHomeCalls();
  results.hung = {
    secondsFromFirstRequestToFailureLine: seconds(alertAt - startedAt[0]),
    browserRequests: startedAt.length,
    proxyCalls: calls.length,
    secondsBrowserHeldFirstCall: calls[0].closedByBrowserAt ? seconds(calls[0].closedByBrowserAt - calls[0].arrivedAt) : null,
    secondsBetweenBrowserRequests: startedAt.slice(1).map((time, index) => seconds(time - startedAt[index])),
  };
  await page.getByRole('button', { name: 'Try again' }).waitFor();
}

async function runTryAgainStillHung(page, startedAt, results) {
  await clearCalls();
  startedAt.length = 0;
  await resetAlertStamp(page);
  await page.getByRole('button', { name: 'Try again' }).click();
  await page.getByText('Loading your home screen.').waitFor();
  assert.equal(await page.getByRole('alert').count(), 0, 'failure line leaves while Try again loads');
  await page.getByRole('alert').filter({ hasText: FAILURE_LINE }).waitFor({ timeout: LONG_WAIT_MS });
  const { alertAt } = await getStamps(page);
  results.tryAgainStillHung = {
    secondsFromRequestToFailureLine: seconds(alertAt - startedAt[0]),
    browserRequests: startedAt.length,
  };
}

async function runTryAgainRecovered(page, results, capture) {
  await setMode('pass');
  await page.getByRole('button', { name: 'Try again' }).click();
  await page.getByRole('heading', { name: 'Welcome back, Maya.' }).waitFor({ timeout: 10_000 });
  await page.locator('main li').first().waitFor();
  results.tryAgainRecovered = { alertsLeft: await page.getByRole('alert').count(), cards: await page.locator('main li').count() };
  await capture('recovered');
}

async function runSlow(page, startedAt, results, capture) {
  await setMode('slow');
  await clearCalls();
  startedAt.length = 0;
  await openFromProxy(page);
  await Promise.race([
    page.locator('main li').first().waitFor({ timeout: LONG_WAIT_MS }),
    page.getByRole('alert').waitFor({ timeout: LONG_WAIT_MS }),
  ]);
  await page.waitForTimeout(QUIET_WATCH_MS);
  const { alertAt, cardsAt } = await getStamps(page);
  const calls = await getHomeCalls();
  results.slow = {
    secondsFromRequestToCards: cardsAt ? seconds(cardsAt - startedAt[0]) : null,
    secondsFromRequestToFailureLine: alertAt ? seconds(alertAt - startedAt[0]) : null,
    browserRequests: startedAt.length,
    proxyCalls: calls.length,
    cards: await page.locator('main li').count(),
  };
  await capture('slow-result');
}

export default async function hungAndSlow({ page, capture, viewportName }) {
  const results = { viewportName, startedAtIso: new Date().toISOString() };
  const startedAt = trackHomeRequests(page);
  await watchPage(page);
  await runHung(page, startedAt, results);
  await capture('hung-failure-line');
  if (!IS_BASELINE) {
    await runTryAgainStillHung(page, startedAt, results);
    await runTryAgainRecovered(page, results, capture);
  }
  await runSlow(page, startedAt, results, capture);
  writeFileSync(`${OUT}/hung-and-slow-${viewportName}.json`, `${JSON.stringify(results, null, 2)}\n`);
  await setMode('pass');
  if (!IS_BASELINE) {
    assert.ok(Math.abs(results.hung.secondsFromFirstRequestToFailureLine - 30) < 1.5, 'hung API shows the failure line at about 30 seconds');
    assert.equal(results.hung.browserRequests, 1, 'hung API gets one request');
    assert.ok(Math.abs(results.tryAgainStillHung.secondsFromRequestToFailureLine - 30) < 1.5, 'Try again on a hung API takes about 30 seconds');
    assert.equal(results.tryAgainStillHung.browserRequests, 1, 'Try again sends one request');
    assert.equal(results.tryAgainRecovered.alertsLeft, 0, 'Try again clears the failure line');
    assert.ok(results.tryAgainRecovered.cards > 0, 'Try again brings the cards');
    assert.equal(results.slow.secondsFromRequestToFailureLine, null, 'slow API never shows a failure line');
    assert.equal(results.slow.browserRequests, 1, 'slow API loads on the first try');
    assert.ok(results.slow.cards > 0, 'slow API loads the cards');
  }
}
