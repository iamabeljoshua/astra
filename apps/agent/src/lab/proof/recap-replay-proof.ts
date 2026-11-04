/// <reference lib="dom" />
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { type Browser, chromium, type Page } from 'playwright';

const LAPTOP = { width: 1366, height: 768 };
const PHONE = { width: 390, height: 844 };

const { values: args } = parseArgs({
  options: {
    web: { type: 'string', default: `http://127.0.0.1:${process.env.WEB_PORT ?? 7141}` },
    out: { type: 'string', default: 'recap-replay-proof' },
    email: { type: 'string', default: 'maya@astra.test' },
    other: { type: 'string', default: 'tola@astra.test' },
    question: { type: 'string', default: 'Put 2x + 3 = 11 on the board and let me solve it myself.' },
    lines: { type: 'string', multiple: true, default: ['2x = 14', '2x = 8', 'x = 4'] },
    headed: { type: 'boolean', default: false },
    goal: { type: 'string', default: 'lesson' },
  },
});

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
mkdirSync(args.out, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: join(args.out, `${name}.png`) });
const results: Record<string, unknown> = {};
const note = (name: string, value: unknown) => {
  results[name] = value;
  console.log(name, JSON.stringify(value));
};

async function signIn(browser: Browser, email: string, viewport = LAPTOP) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on('pageerror', (error) => console.log('PAGE ERROR', String(error).slice(0, 300)));
  await page.goto(`${args.web}/sign-in`);
  await page.getByRole('button', { name: 'Development sign-in' }).click();
  await page.getByRole('button', { name: email }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));
  return page;
}

async function typeOnBoard(page: Page, line: string) {
  await page.keyboard.type(line, { delay: 20 });
  await page.keyboard.press('Enter');
}

async function holdLesson(page: Page): Promise<string> {
  const box = page.getByRole('textbox').first();
  await box.fill(args.question);
  await box.press('Enter');
  await page.waitForURL(/\/sessions\/[0-9a-f-]{36}$/);
  await page.getByTestId('tutor-caption').waitFor({ timeout: 40_000 });
  await delay(9000);
  for (const line of args.lines) {
    await typeOnBoard(page, line);
    await delay(5000);
  }
  await delay(6000);
  return new URL(page.url()).pathname.split('/').at(-1) as string;
}

async function endAndWatchRecap(page: Page) {
  const pressedAtMs = performance.now();
  await page.getByRole('button', { name: 'End session' }).click();
  await page.getByText('Looking back over your lesson.').waitFor({ timeout: 8000 }).catch(() => {});
  await page.getByTestId('recap').waitFor({ timeout: 15_000 });
  note('recapShownAfterMs', Math.round(performance.now() - pressedAtMs));
  note('recapText', await page.getByTestId('recap').innerText());
  await delay(1500);
  await shot(page, 'recap-laptop');
  await page.getByRole('textbox', { name: 'Your answer' }).fill('3x = 15, so x = 5');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Saved', exact: true }).waitFor();
  await delay(12_000);
  await shot(page, 'recap-laptop-later');
  await page.getByRole('button', { name: 'Close' }).click();
  await page.waitForURL((url) => url.pathname === '/');
}

async function readBoardPixels(page: Page): Promise<Buffer> {
  await delay(700);
  return page.getByTestId('board').screenshot();
}

async function seek(page: Page, atMs: number) {
  const slider = page.getByRole('slider', { name: 'Lesson timeline' });
  await slider.evaluate((element, value) => {
    const input = element as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, String(value));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, atMs);
}

async function readMoment(page: Page) {
  return { caption: await page.getByTestId('tutor-caption').innerText().catch(() => ''), student: await page.getByTestId('replay-student-line').innerText().catch(() => ''), rows: await page.locator('[data-row]').count(), time: await page.getByTestId('replay-time').innerText() };
}

async function proveReplay(page: Page, sessionId: string, name: string) {
  await page.goto(`${args.web}/sessions`);
  const row = page.getByRole('row').filter({ hasText: 'Replay' }).first();
  await row.waitFor();
  note('rowSays', (await row.innerText()).replace(/\s+/g, ' '));
  await row.getByRole('link').click();
  await page.getByRole('slider', { name: 'Lesson timeline' }).waitFor();
  await delay(800);
  assert.ok(page.url().endsWith(sessionId), 'the row opens this session');
  note('answerOnReplay', await page.getByRole('textbox', { name: 'Your answer' }).inputValue());
  await shot(page, `${name}-rest`);
  const durationMs = Number(await page.getByRole('slider', { name: 'Lesson timeline' }).getAttribute('max'));
  note('durationMs', durationMs);
  const points = [0.2, 0.5, 0.8].map((share) => Math.round(durationMs * share));
  const moments: unknown[] = [];
  const forward: Buffer[] = [];
  for (const [index, atMs] of points.entries()) {
    await seek(page, atMs);
    forward.push(await readBoardPixels(page));
    moments.push({ atMs, ...(await readMoment(page)) });
    await shot(page, `${name}-point-${index + 1}`);
  }
  note('momentsForward', moments);
  const differing: number[] = [];
  for (const [index, atMs] of [...points.entries()].reverse()) {
    await seek(page, atMs);
    const again = await readBoardPixels(page);
    if (!again.equals(forward[index] as Buffer)) {
      differing.push(atMs);
      writeFileSync(join(args.out, `differs-${atMs}-forward.png`), forward[index] as Buffer);
      writeFileSync(join(args.out, `differs-${atMs}-back.png`), again);
    }
  }
  note('boardsThatDifferOnASeekBack', differing);
  assert.deepEqual(differing, [], 'a board reached by seeking back is the same picture as one reached going forward');

  await seek(page, 0);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await delay(3000);
  const afterPlay = Number(await page.getByRole('slider', { name: 'Lesson timeline' }).inputValue());
  await page.getByRole('button', { name: '2x' }).click();
  await delay(2000);
  const afterFast = Number(await page.getByRole('slider', { name: 'Lesson timeline' }).inputValue());
  const speech = await page.evaluate(() => ({ speaking: window.speechSynthesis.speaking, voices: window.speechSynthesis.getVoices().filter((voice) => voice.localService).length }));
  await page.getByRole('button', { name: 'Pause' }).click();
  await delay(300);
  const paused = Number(await page.getByRole('slider', { name: 'Lesson timeline' }).inputValue());
  await delay(800);
  const stillPaused = Number(await page.getByRole('slider', { name: 'Lesson timeline' }).inputValue());
  note('playing', { afterPlay, afterFast, rateAt2x: (afterFast - afterPlay) / 2000, paused, stillPaused, speech });
  assert.equal(paused, stillPaused, 'pause holds');
  await page.getByRole('button', { name: '1x' }).click();
}

async function proveOtherStudentGetsNothing(browser: Browser, sessionId: string) {
  const page = await signIn(browser, args.other);
  let token = '';
  page.on('request', (request) => {
    const auth = request.headers().authorization;
    if (auth) token = auth;
  });
  await page.goto(`${args.web}/sessions/${sessionId}`);
  await page.getByText('That session was not found', { exact: false }).or(page.getByRole('alert')).first().waitFor();
  await shot(page, 'other-student');
  const answers = await page.evaluate(async ({ id, auth }) => {
    const read = await fetch(`/api/sessions/${id}/replay`, { headers: { authorization: auth } });
    const session = await fetch(`/api/sessions/${id}`, { headers: { authorization: auth } });
    const gone = await fetch(`/api/sessions/${id}/replay`, { method: 'DELETE', headers: { authorization: auth } });
    const noToken = await fetch(`/api/sessions/${id}/replay`);
    return { read: read.status, readBody: await read.text(), session: session.status, delete: gone.status, noToken: noToken.status };
  }, { id: sessionId, auth: token });
  note('otherStudent', answers);
  assert.equal(answers.read, 404);
  assert.equal(answers.delete, 404);
  assert.equal(answers.noToken, 401);
  await page.context().close();
}

async function proveEndingWithoutARecap(browser: Browser) {
  const page = await signIn(browser, args.email);
  const box = page.getByRole('textbox').first();
  await box.fill('What is a noun?');
  await box.press('Enter');
  await page.waitForURL(/\/sessions\/[0-9a-f-]{36}$/);
  await page.getByRole('button', { name: 'Close' }).or(page.getByRole('button', { name: 'End session' })).first().waitFor();
  await delay(1200);
  const pressedAtMs = performance.now();
  await page.getByRole('button', { name: 'End session' }).click();
  await page.waitForURL((url) => url.pathname === '/', { timeout: 15_000 });
  note('nothingInItLeftAfterMs', Math.round(performance.now() - pressedAtMs));
  note('nothingInItSawARecap', await page.getByTestId('recap').count());
  await page.context().close();
}

async function proveGentleEnding(browser: Browser) {
  const page = await signIn(browser, args.email);
  const box = page.getByRole('textbox').first();
  await box.fill(args.question);
  await box.press('Enter');
  await page.waitForURL(/\/sessions\/[0-9a-f-]{36}$/);
  await page.getByTestId('tutor-caption').waitFor({ timeout: 40_000 });
  await delay(12_000);
  await shot(page, 'gentle-before-end');
  const sessionId = new URL(page.url()).pathname.split('/').at(-1) as string;
  await page.getByRole('button', { name: 'End session' }).click();
  await page.getByTestId('recap').waitFor({ timeout: 15_000 });
  const line = await page.getByTestId('recap').innerText();
  note('gentleLine', line);
  assert.doesNotMatch(line, /got right|what we covered|one thing to try/i, 'a gentle ending says nothing of the work');
  await delay(1000);
  await shot(page, 'gentle-recap');
  await delay(14_000);
  await page.getByRole('button', { name: 'Close' }).click();
  await page.waitForURL((url) => url.pathname === '/');
  await delay(16_000);
  await page.goto(`${args.web}/sessions/${sessionId}`);
  await page.getByRole('slider', { name: 'Lesson timeline' }).waitFor();
  await delay(1000);
  await shot(page, 'gentle-replay');
  note('gentleReplayText', await page.getByTestId('recap').innerText());
  await page.context().close();
}

const browser = await chromium.launch({ headless: !args.headed, args: ['--use-mock-keychain', '--autoplay-policy=no-user-gesture-required'] });
if (args.goal === 'gentle') {
  await proveGentleEnding(browser);
  await browser.close();
  process.exit(0);
}
if (args.goal === 'nothing') {
  await proveEndingWithoutARecap(browser);
  await browser.close();
  process.exit(0);
}
const page = await signIn(browser, args.email);
const sessionId = await holdLesson(page);
note('sessionId', sessionId);
await shot(page, 'lesson-before-end');
await endAndWatchRecap(page);
await delay(16_000);
await proveReplay(page, sessionId, 'replay-laptop');
await proveOtherStudentGetsNothing(browser, sessionId);

const phone = await signIn(browser, args.email, PHONE);
await phone.goto(`${args.web}/sessions/${sessionId}`);
await phone.getByRole('slider', { name: 'Lesson timeline' }).waitFor();
await delay(800);
await shot(phone, 'replay-phone-rest');
const phoneMax = Number(await phone.getByRole('slider', { name: 'Lesson timeline' }).getAttribute('max'));
await seek(phone, Math.round(phoneMax * 0.6));
await delay(800);
await shot(phone, 'replay-phone-point');
const pageScrollsSideways = await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
note('phoneScrollsSideways', pageScrollsSideways);
await phone.getByRole('button', { name: 'Dark' }).click().catch(() => {});
await delay(600);
await shot(phone, 'replay-phone-dark');
await phone.context().close();
await page.goto(`${args.web}/sessions/${sessionId}`);
await page.getByRole('slider', { name: 'Lesson timeline' }).waitFor();
await page.getByRole('button', { name: 'Dark' }).click().catch(() => {});
await delay(600);
await shot(page, 'replay-laptop-dark');
await page.getByRole('button', { name: 'Light' }).click().catch(() => {});
await page.getByRole('button', { name: 'Delete this replay' }).click();
await delay(400);
await shot(page, 'replay-delete-asks');
await page.getByRole('button', { name: 'Delete', exact: true }).click();
await page.getByRole('heading', { name: 'Sessions' }).waitFor();
const deletedRow = page.getByRole('row').filter({ hasText: 'Put 2x + 3 = 11' }).first();
await deletedRow.waitFor();
note('rowAfterDelete', (await deletedRow.innerText()).replace(/\s+/g, ' '));
await page.goto(`${args.web}/sessions/${sessionId}`);
await page.getByText('nothing from it is saved to replay', { exact: false }).waitFor();
await shot(page, 'replay-deleted');
writeFileSync(join(args.out, 'results.json'), JSON.stringify(results, null, 2));
await browser.close();
