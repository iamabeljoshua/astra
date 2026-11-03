// Runs supabase/hosted/blank-passwords.sql on a private Auth and tries every way to plant or use a password. Argument: confirm-on or confirm-off, which must match how the Auth started.
import { execSync } from 'node:child_process';
import { launch, newLane, WEB, sleep, logger, emailLink, serviceToken } from './lib.mjs';
const SQL_FILE = '/Users/abel/startup/astra-worktrees/m2-9/supabase/hosted/blank-passwords.sql';
const mode = process.argv[2];
const log = logger(`trigger-${mode}`);
const AUTH = 'http://127.0.0.1:6042';
const PLANTED = 'planted-password-m2-9-Aa1!';
const stamp = Date.now();
const address = (name) => `m29-${mode}-${name}-${stamp}@astra.test`;
const db = (query, role = 'postgres') => execSync(`docker exec -e PGPASSWORD=postgres supabase_db_astra psql -h 127.0.0.1 -U ${role} -d auth_m2_9 -Atc "${query}"`).toString().trim();
const results = { pass: 0, fail: 0 };
const check = (name, passed, detail = '') => { results[passed ? 'pass' : 'fail'] += 1; log(`${passed ? 'PASS' : 'FAIL'} ${name}${detail ? ` ${JSON.stringify(detail)}` : ''}`); };
const post = async (path, body, headers = {}) => { const r = await fetch(`${AUTH}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const grant = (email, password = PLANTED) => post('/token?grant_type=password', { email, password });
const refused = (answer) => answer.status === 400 && answer.body.error_code === 'invalid_credentials';
const hashOf = (email) => db(`select coalesce(encrypted_password, 'NULL') from auth.users where email = '${email}'`);
async function openLink(email, since) {
  const link = await emailLink(email, since);
  const answer = await fetch(link, { redirect: 'manual' });
  const params = new URLSearchParams((answer.headers.get('location') ?? '').split('#')[1] ?? '');
  return params.get('access_token');
}
async function signUpWithPassword(email) {
  const since = Date.now();
  const answer = await post('/signup', { email, password: PLANTED });
  if (mode === 'confirm-on') await openLink(email, since);
  return answer;
}
async function linkSession(email) {
  const since = Date.now();
  const sent = await post('/otp', { email, create_user: true });
  if (sent.status !== 200) throw new Error(`otp ${email} ${sent.status} ${JSON.stringify(sent.body)}`);
  return openLink(email, since);
}

const before = address('before');
await signUpWithPassword(before);
const control = await grant(before);
check('control, with no trigger a planted password signs in', control.status === 200, { status: control.status });

execSync(`docker exec -i supabase_db_astra psql -q -v ON_ERROR_STOP=1 -U postgres -d auth_m2_9 < ${SQL_FILE}`);
execSync(`docker exec -i supabase_db_astra psql -q -v ON_ERROR_STOP=1 -U postgres -d auth_m2_9 < ${SQL_FILE}`);
check('the file runs twice as the postgres role, and one trigger exists', db("select count(*) from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal") === '1');
check('Auth connects with no right to the app schema', db("select has_schema_privilege('supabase_auth_admin', 'app', 'USAGE')") === 'f');
check('a password stored before the trigger is blank now', hashOf(before) === '');
check('a password stored before the trigger no longer signs in', refused(await grant(before)));

const newSignUp = address('new');
const signUpAnswer = await signUpWithPassword(newSignUp);
log('sign-up with a password answers', { status: signUpAnswer.status, gaveToken: !!signUpAnswer.body.access_token });
check('sign-up keeps no password', hashOf(newSignUp) === '');
check('sign-up password does not sign in', refused(await grant(newSignUp)));

const victim = address('victim');
const since = Date.now();
await post('/signup', { email: victim, password: PLANTED });
const early = await grant(victim);
const victimToken = mode === 'confirm-on' ? await openLink(victim, since) : await linkSession(victim);
check('the address owner still signs in by the link after a plant', !!victimToken);
const late = await grant(victim);
check('a planted password does not sign in before or after the owner opens the link', late.status === 400 && early.status === 400, { early: early.body.error_code ?? early.status, late: late.body.error_code ?? late.status });

const changer = address('changer');
const changerToken = await linkSession(changer);
const change = await fetch(`${AUTH}/user`, { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${changerToken}` }, body: JSON.stringify({ password: PLANTED }) });
check('setting a password with a session keeps none', hashOf(changer) === '', { status: change.status });
check('that password does not sign in', refused(await grant(changer)));
check('the session survives, so a link user is not broken', (await fetch(`${AUTH}/user`, { headers: { authorization: `Bearer ${changerToken}` } })).status === 200);

const admin = { authorization: `Bearer ${serviceToken()}` };
const adminMade = address('admin');
const created = await post('/admin/users', { email: adminMade, password: PLANTED, email_confirm: true }, admin);
check('an admin-made user keeps no password', created.status === 200 && hashOf(adminMade) === '', { status: created.status });
check('that password does not sign in', refused(await grant(adminMade)));
const updated = await fetch(`${AUTH}/admin/users/${created.body.id}`, { method: 'PUT', headers: { 'content-type': 'application/json', ...admin }, body: JSON.stringify({ password: `${PLANTED}2` }) });
check('an admin password update keeps none', updated.status === 200 && hashOf(adminMade) === '', { status: updated.status });
check('that password does not sign in', refused(await grant(adminMade, `${PLANTED}2`)));

const recovering = address('recovery');
await linkSession(recovering);
const recoverySince = Date.now();
await post('/recover', { email: recovering });
const recoveryToken = await openLink(recovering, recoverySince);
await fetch(`${AUTH}/user`, { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${recoveryToken}` }, body: JSON.stringify({ password: PLANTED }) });
check('a password set through recovery does not sign in', refused(await grant(recovering)));

db(`update auth.users set encrypted_password = 'written-straight-to-the-table' where email = '${recovering}'`);
check('a direct write to the column is blanked', hashOf(recovering) === '');
const total = db("select count(*) from auth.users");
check('no user holds a password', db("select count(*) from auth.users where encrypted_password <> ''") === '0', { users: total });

const browser = await launch();
const context = await newLane(browser, `trigger-${mode}-${stamp}`);
const page = await context.newPage();
async function browserLink(email) {
  const asked = Date.now();
  await page.goto(`${WEB}/`);
  await page.getByRole('button', { name: 'Continue with email' }).click();
  await page.getByRole('textbox', { name: 'Your email address' }).fill(email);
  await page.getByRole('button', { name: 'Send link' }).click();
  await page.getByRole('heading', { name: 'Check your email.' }).waitFor({ timeout: 15000 });
  await page.goto(await emailLink(email, asked));
  await page.getByRole('heading', { name: 'When were you born?' }).waitFor({ timeout: 15000 });
  const who = await page.evaluate(() => JSON.parse(localStorage.getItem('astra-session') ?? 'null')?.user?.email);
  const amr = await page.evaluate(() => JSON.parse(atob(JSON.parse(localStorage.getItem('astra-session')).access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).amr?.map((entry) => entry.method));
  await page.getByRole('button', { name: 'Sign out' }).first().click();
  await page.getByRole('button', { name: 'Continue with email' }).waitFor({ timeout: 15000 });
  await sleep(1100);
  await page.evaluate(() => sessionStorage.clear());
  return { who, amr };
}
const brandNew = address('brand-new');
const first = await browserLink(brandNew);
check('in the real client, a new address signs in by link', first.who === brandNew, first);
const second = await browserLink(brandNew);
check('in the real client, a known address signs in by link', second.who === brandNew, second);
check('in the real client, a user who planted first signs in by link', (await browserLink(newSignUp)).who === newSignUp);
await browser.close();
log(`TRIGGER ${mode}`, results);
