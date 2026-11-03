// What recovers the page on the expired path, where the browser itself sees the token as expired and Auth cannot renew it.
import { launch, newLane, setLane, passwordSession, asKind, ensureUser, MAYA, WEB, sleep, logger, refocus, reconnect, readScreen } from './lib.mjs';
const log = logger('expired');
await ensureUser(MAYA);
const browser = await launch();
for (const way of ['reconnect', 'return to the tab', 'nothing', 'return to the tab after a minute']) {
  const session = asKind(await passwordSession(MAYA), 'expired');
  const lane = `expired-${way}-${Date.now()}`;
  const context = await newLane(browser, lane, { session });
  await setLane(lane, { auth: { 'token:refresh_token': 'status:503' } });
  const page = await context.newPage();
  await page.goto(`${WEB}/`);
  await page.getByRole('button', { name: 'Try again' }).waitFor({ timeout: 90000 });
  const reachedAt = Date.now();
  await setLane(lane, { auth: {} });
  if (way === 'reconnect') await reconnect(context);
  if (way === 'return to the tab') await refocus(page);
  if (way === 'return to the tab after a minute') { await sleep(62000); await refocus(page); }
  let recoveredAfterMs = null;
  for (let waited = 0; waited < 45000; waited += 500) {
    if (await page.getByRole('heading', { name: /Welcome back/ }).count()) { recoveredAfterMs = Date.now() - reachedAt; break; }
    await sleep(500);
  }
  log({ way, recoveredAfterMs, screen: (await readScreen(page)).h1 });
  await context.close();
}
await browser.close();
log('EXPIRED DONE');
