// The browser mark on the served build, with real links from the inbox. Also the send that crosses a page change.
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { launch, newLane, WEB, sleep, logger, ensureUser, emailLink, MAYA, INBOX, SHOTS } from './lib.mjs';
const log = logger('mark');
const stamp = Date.now();
const CLOSED = "We can't set up this account.";
const SHOT_DIR = `${SHOTS}/evidence`; mkdirSync(SHOT_DIR, { recursive: true });
const sql = (query) => execSync(`docker exec supabase_db_astra psql -U postgres -d auth_m2_9 -Atc "${query}"`).toString().trim();
const inboxCount = async (email) => (await (await fetch(`${INBOX}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)).json()).messages?.length ?? 0;
const check = (name, passed, detail = '') => log(`${passed ? 'PASS' : 'FAIL'} ${name}${detail ? ` ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
async function shots(page, name) {
  for (const [widthName, viewport] of [['laptop', { width: 1280, height: 800 }], ['phone', { width: 375, height: 812 }]]) {
    await page.setViewportSize(viewport);
    for (const theme of ['Light', 'Dark']) {
      await page.getByRole('button', { name: theme, exact: true }).first().click();
      await sleep(250);
      await page.screenshot({ path: `${SHOT_DIR}/${name}-${widthName}-${theme.toLowerCase()}.png`, fullPage: false });
    }
  }
  await page.getByRole('button', { name: 'Light', exact: true }).first().click();
  await page.setViewportSize({ width: 1280, height: 800 });
}
async function askForLink(page, email) {
  await page.getByRole('button', { name: 'Continue with email' }).click();
  await page.getByRole('textbox', { name: 'Your email address' }).fill(email);
  await page.getByRole('button', { name: 'Send link' }).click();
}
async function signInByLink(page, email) {
  const asked = Date.now();
  await page.goto(`${WEB}/`);
  await askForLink(page, email);
  await page.getByRole('heading', { name: 'Check your email.' }).waitFor({ timeout: 15000 });
  await page.goto(await emailLink(email, asked));
}
const heading = (page) => page.locator('h1').first().innerText({ timeout: 15000 });
async function waitHeading(page, name) { await page.getByRole('heading', { name, level: 1 }).waitFor({ timeout: 15000 }); }
async function signOut(page) { await page.getByRole('button', { name: 'Sign out' }).first().click(); await page.getByRole('button', { name: 'Continue with email' }).waitFor({ timeout: 15000 }); }
await ensureUser(MAYA);
const unanswered = { email: `m29-unanswered-${stamp}@astra.test` }; await ensureUser(unanswered);
const child = `m29-child-${stamp}@astra.test`;
const browser = await launch();
const context = await newLane(browser, `mark-${stamp}`);
const page = await context.newPage();
const stopCookie = async () => (await context.cookies()).find((cookie) => cookie.name === 'astra-sign-up-stop');

await signInByLink(page, child);
await waitHeading(page, 'When were you born?');
check('no mark before the account closes', !(await stopCookie()));
await page.getByLabel('Day').fill('01'); await page.getByLabel('Month').fill('01'); await page.getByLabel('Year').fill('2020');
await page.getByRole('button', { name: /Continue/ }).click();
await page.getByRole('button', { name: /Yes/ }).click();
await waitHeading(page, CLOSED);
await sleep(200);
const mark = await stopCookie();
const left = mark ? mark.expires - Date.now() / 1000 : null;
check('closing sets one cookie with value 1 and no name, address, or date', mark?.value === '1' && (await context.cookies()).length === 1, { name: mark?.name, value: mark?.value, sameSite: mark?.sameSite, path: mark?.path });
check('the browser holds about one day on it', left > 86_390 && left <= 86_400, `${Math.round(left)} s`);
const stored = await page.evaluate(() => ({ local: Object.keys(localStorage), tab: Object.keys(sessionStorage) }));
log('storage keys', stored);

await signOut(page);
check('the mark survives sign-out', !!(await stopCookie()));

const second = `m29-second-${stamp}@astra.test`;
await page.goto(`${WEB}/`);
await askForLink(page, second);
const alert = page.getByRole('alert');
await alert.waitFor({ timeout: 15000 });
check('a second new address gets the same neutral message on the email step', (await alert.innerText()) === CLOSED, await alert.innerText());
await shots(page, 'email-step-stopped');
await sleep(800);
check('Auth made no user for it', sql(`select count(*) from auth.users where email = '${second}'`) === '0');
check('no mail went to it', (await inboxCount(second)) === 0);

await signInByLink(page, MAYA.email);
await page.getByRole('heading', { name: /Welcome back/ }).waitFor({ timeout: 15000 });
check('an active student on this browser still gets in', true);
await signOut(page);

const expiresBefore = (await stopCookie()).expires;
await signInByLink(page, unanswered.email);
await waitHeading(page, CLOSED);
check('an account with no answer gets the closed page and not the question', (await page.getByLabel('Year').count()) === 0);
await shots(page, 'new-account-stopped');
await sleep(1200);
check('the stop does not restart the day', Math.abs((await stopCookie()).expires - expiresBefore) < 0.5, `${(await stopCookie()).expires - expiresBefore} s`);
await signOut(page);

await context.clearCookies();
await signInByLink(page, unanswered.email);
await waitHeading(page, 'When were you born?');
check('with the mark gone, that account gets the question', true);
await signOut(page);
const third = `m29-third-${stamp}@astra.test`;
await signInByLink(page, third);
await waitHeading(page, 'When were you born?');
check('with the mark gone, a new address signs up', true);

const fresh = await newLane(browser, `mark-fresh-${stamp}`);
const elsewhere = await fresh.newPage();
await signInByLink(elsewhere, child);
await waitHeading(elsewhere, CLOSED);
await sleep(200);
check('a closed account signing in on another browser marks that browser too', !!(await fresh.cookies()).find((cookie) => cookie.name === 'astra-sign-up-stop'));
log('closed account in Auth', sql(`select 'last_sign_in=' || (last_sign_in_at is not null) || ' sessions_with_ip=' || (select count(*) from auth.sessions s where s.user_id = u.id and s.ip is not null) || ' sessions_with_browser=' || (select count(*) from auth.sessions s where s.user_id = u.id and s.user_agent is not null) || ' audit_rows=' || (select count(*) from auth.audit_log_entries a where a.payload->>'actor_id' = u.id::text) from auth.users u where email = '${child}'`));

const crossing = await newLane(browser, `mark-crossing-${stamp}`);
const away = await crossing.newPage();
const crossingAddress = `m29-crossing-${stamp}@astra.test`;
const requests = [];
await away.route('**/auth/v1/otp**', async (route) => { requests.push(1); await sleep(2500); await route.continue(); });
const asked = Date.now();
await away.goto(`${WEB}/`);
await askForLink(away, crossingAddress);
await away.getByRole('link', { name: 'Terms' }).click();
await away.getByRole('heading', { level: 1, name: 'Terms' }).waitFor();
await away.goBack();
await away.getByRole('button', { name: 'Send link' }).waitFor();
check('the button still says it is busy after coming back', (await away.getByRole('button', { name: 'Send link' }).getAttribute('aria-disabled')) === 'true');
await away.getByRole('button', { name: 'Send link' }).click({ force: true });
await away.getByRole('heading', { name: 'Check your email.' }).waitFor({ timeout: 15000 });
await sleep(1500);
check('one press across a page change sends one request', requests.length === 1, `${requests.length} requests`);
check('one mail', (await inboxCount(crossingAddress)) === 1);
await away.unrouteAll({ behavior: 'wait' });
await away.goto(await emailLink(crossingAddress, asked));
await waitHeading(away, 'When were you born?');
check('that link works', true);

const legal = await context.newPage();
await legal.goto(`${WEB}/privacy`);
await legal.getByRole('heading', { name: 'In your browser' }).scrollIntoViewIfNeeded();
const paragraphs = await legal.locator('section', { hasText: 'In your browser' }).locator('p').allInnerTexts();
log('In your browser', paragraphs);
await browser.close();
log('MARK DONE');
