import assert from 'node:assert/strict';

const GREETING = 'Welcome back, Maya.';
const CARD_TITLE = 'How a jump shot flies';
const RETURNING_SESSION_TITLE = 'Free-body diagrams';
const STALE_LINE = 'Live lessons open soon';
const NO_ROOM_NOTE = 'Your tutor could not connect just now.';
const IDLE_WORDS = 'To carry on, type a reply or press Talk.';
const REPLY_NOT_SENT = 'This did not reach your tutor.';
const LIVE_ROOM_ADDRESS = /\/api\/sessions\/[0-9a-f-]{36}\/live-room$/;

// `pnpm verify run` starts the app with this process's environment, so these three decide what the API answers.
const hasRoomService = Boolean(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);

function waitForRoomAnswer(page) {
  return page.waitForResponse((response) => LIVE_ROOM_ADDRESS.test(response.url()));
}

async function assertTheRoomAnsweredAsExpected(page, roomAnswer) {
  const answer = await roomAnswer;
  assert.equal(answer.status(), 200, 'the room answer is 200 in both states');
  const { access, unavailableBecause } = await answer.json();
  assert.equal(await page.getByText(STALE_LINE).count(), 0, 'nothing says live lessons open soon');
  if (hasRoomService) {
    assert.ok(access?.token, 'with a room service on, the API gives access');
    assert.equal(unavailableBecause, null, 'with a room service on, the API gives no reason');
    assert.equal(await page.getByText(NO_ROOM_NOTE).count(), 0, 'with a room service on, no note says the tutor could not connect');
    return;
  }
  assert.deepEqual({ access, unavailableBecause }, { access: null, unavailableBecause: 'notSetUp' }, 'with no room service, the API says it is not set up');
  await page.getByText(NO_ROOM_NOTE).waitFor();
}

async function openSessions({ page, viewportName }) {
  if (viewportName === 'phone') await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('navigation', { name: 'Menu' }).getByRole('link', { name: 'Sessions' }).click();
  await page.getByRole('heading', { name: 'Sessions' }).waitFor();
}

async function sendQuestionAndEnd({ page, capture, viewportName }) {
  const question = `Why is the sky dark at night, ${viewportName} ${Date.now()}`;
  const roomAnswer = waitForRoomAnswer(page);
  await page.getByRole('textbox', { name: 'What do you want to learn next' }).fill(question);
  await page.getByRole('button', { name: 'Start session' }).click();
  await page.locator('.stop-dot').waitFor();
  await capture('dot');
  await page.getByRole('heading', { level: 1, name: question }).waitFor();
  await assertTheRoomAnsweredAsExpected(page, roomAnswer);
  assert.equal(await page.getByText(IDLE_WORDS).count(), 0, 'a new question does not invite a reply to itself');
  await capture('session');
  assert.match(new URL(page.url()).pathname, /^\/sessions\/[0-9a-f-]{36}$/);

  await page.getByRole('button', { name: 'End session' }).click();
  await page.getByRole('heading', { name: GREETING }).waitFor();
  await openSessions({ page, viewportName });
  const firstRow = page.getByRole('row').nth(1);
  await firstRow.getByRole('link', { name: question }).waitFor();
  await firstRow.getByText('Finished').waitFor();
  await capture('list');
  await page.getByRole('link', { name: 'New session' }).click();
  await page.getByRole('heading', { name: GREETING }).waitFor();
}

async function putCardBackForNextViewport({ page }, sessionAddress) {
  await page.goto(sessionAddress);
  await page.getByRole('button', { name: 'End session' }).click();
  await page.getByRole('heading', { name: GREETING }).waitFor();
}

async function startFromCardRefreshAndSearch({ page, capture }) {
  await page.getByRole('button', { name: new RegExp(CARD_TITLE) }).click();
  await page.getByRole('heading', { level: 1, name: CARD_TITLE }).waitFor();
  const sessionAddress = page.url();

  await page.reload();
  await page.getByRole('heading', { level: 1, name: CARD_TITLE }).waitFor();
  assert.equal(page.url(), sessionAddress);
  await capture('card-session');

  await page.goto('/sessions');
  const table = page.getByRole('table');
  await table.getByRole('link', { name: 'Free-body diagrams' }).waitFor();
  await page.getByRole('searchbox', { name: 'Search your sessions' }).fill('JUMP SHOT');
  await table.getByRole('link', { name: 'Free-body diagrams' }).waitFor({ state: 'detached' });
  await table.getByRole('link', { name: CARD_TITLE }).first().waitFor();
  await capture('search');
  return sessionAddress;
}

async function replyOnReturningSession({ page, capture, viewportName }) {
  await page.goto('/sessions');
  await page.getByRole('table').getByRole('link', { name: RETURNING_SESSION_TITLE }).click();
  await page.getByRole('heading', { level: 1, name: RETURNING_SESSION_TITLE }).waitFor();
  await page.getByText(IDLE_WORDS).waitFor();
  assert.equal(await page.getByText(STALE_LINE).count(), 0, 'a returning student is not told live lessons open soon');
  await capture('returning');

  const reply = `Gravity, I think. ${viewportName} ${Date.now()}`;
  const roomAnswer = waitForRoomAnswer(page);
  await page.getByRole('textbox', { name: 'Your reply' }).fill(reply);
  await page.getByRole('button', { name: 'Send reply' }).click();
  await assertTheRoomAnsweredAsExpected(page, roomAnswer);
  await page.getByText(reply).waitFor();
  assert.equal(await page.getByText(IDLE_WORDS).count(), 0, 'the invitation goes once the student replies');
  assert.equal(await page.getByText(REPLY_NOT_SENT).count(), hasRoomService ? 0 : 1, 'the screen says a reply did not arrive only when it did not');
  await capture('reply');
}

export default async function sessions({ page, capture, viewportName, signIn }) {
  await signIn();
  await page.getByRole('heading', { name: GREETING }).waitFor();
  await sendQuestionAndEnd({ page, capture, viewportName });
  const sessionAddress = await startFromCardRefreshAndSearch({ page, capture });
  await replyOnReturningSession({ page, capture, viewportName });
  await putCardBackForNextViewport({ page }, sessionAddress);
}
