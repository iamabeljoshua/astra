import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';

export const deadlineMs = 120_000;

const PROXY = process.env.M27_PROXY;
const OUT = process.env.M27_OUT;
const SECONDS_BEFORE_LEAVING_MS = 2000;
const WATCH_AFTER_LEAVING_MS = 35_000;

const setMode = (mode) => fetch(`${PROXY}/__proxy/mode/${mode}`);
const clearCalls = () => fetch(`${PROXY}/__proxy/clear`);
const getHomeCalls = async () => (await (await fetch(`${PROXY}/__proxy/calls`)).json()).filter((call) => call.path === '/api/home');

async function openSessions(page, viewportName) {
  if (viewportName === 'phone') await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('navigation', { name: 'Menu' }).getByRole('link', { name: 'Sessions' }).click();
  await page.getByRole('heading', { name: 'Sessions' }).waitFor();
}

async function openHome(page, viewportName) {
  if (viewportName === 'phone') await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('navigation', { name: 'Menu' }).getByRole('link', { name: 'Home' }).click();
}

export default async function leaveWhileLoading({ page, capture, viewportName }) {
  await setMode('hang');
  await clearCalls();
  await page.goto(`${PROXY}/`);
  await page.getByText('Loading your home screen.').waitFor();
  await page.waitForTimeout(SECONDS_BEFORE_LEAVING_MS);
  await openSessions(page, viewportName);
  await page.waitForTimeout(WATCH_AFTER_LEAVING_MS);
  const calls = await getHomeCalls();
  const results = {
    viewportName,
    homeCallsAfterLeaving: calls.length,
    secondsBrowserHeldCall: calls[0].closedByBrowserAt ? (calls[0].closedByBrowserAt - calls[0].arrivedAt) / 1000 : null,
    alertsOnSessions: await page.getByRole('alert').count(),
  };
  await setMode('pass');
  await openHome(page, viewportName);
  await page.locator('main li').first().waitFor({ timeout: 10_000 });
  results.alertsBackOnHome = await page.getByRole('alert').count();
  results.cardsBackOnHome = await page.locator('main li').count();
  writeFileSync(`${OUT}/leave-while-loading-${viewportName}.json`, `${JSON.stringify(results, null, 2)}\n`);
  await capture('back-on-home');
  assert.equal(results.homeCallsAfterLeaving, 1, 'leaving sends no further request');
  assert.ok(results.secondsBrowserHeldCall < 5, 'leaving closes the request at once');
  assert.equal(results.alertsOnSessions, 0, 'leaving shows no failure');
  assert.equal(results.alertsBackOnHome, 0, 'returning shows no failure');
  assert.ok(results.cardsBackOnHome > 0, 'returning loads the cards');
}
