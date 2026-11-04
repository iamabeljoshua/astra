import assert from 'node:assert/strict';

export const deadlineMs = 120_000;

const GREETING = 'Welcome back, Tola.';
const CARRY_ON = 'Carry on where you left off';
const FINISHED_TOPIC = 'What makes a cake rise';
const NEXT_TOPIC = 'Why browned food tastes so good';
const NEXT_TOPIC_REASON = `You finished ${FINISHED_TOPIC}`;
const SHORT_TOPIC = 'Why a minor chord sounds sad';
const SHORT_TOPIC_REASON = "Because you're into music";
const OLDER_OPEN_TOPIC = 'How a music file drops sound';
const NEWEST_OPEN_TOPIC = 'Why short strings play high notes';
const LONG_ENOUGH_TO_FINISH = '10:00';

const getCardsRegion = (page) => page.locator('section').filter({ hasText: 'Picked for you' });
const getCard = (page, title) => getCardsRegion(page).getByRole('button').filter({ has: page.getByText(title, { exact: true }) });

async function expectNoCard(page, title) {
  await getCard(page, title).waitFor({ state: 'detached' });
}

async function expectCardReason(page, title, reason) {
  await getCard(page, title).getByText(reason, { exact: true }).waitFor();
}

async function openCard(page, title) {
  await getCard(page, title).click();
  await page.getByRole('heading', { level: 1, name: title }).waitFor();
}

async function endSessionAndReturnHome(page) {
  await page.getByRole('button', { name: 'End session' }).click();
  await page.getByRole('heading', { name: GREETING }).waitFor();
}

async function leaveSessionOpen(page) {
  await page.goBack();
  await page.getByRole('heading', { name: GREETING }).waitFor();
}

async function expectFreshCards({ page, capture }) {
  await page.getByRole('heading', { name: GREETING }).waitFor();
  await getCard(page, FINISHED_TOPIC).waitFor();
  assert.equal(await getCardsRegion(page).getByRole('button').count(), 6, 'six cards');
  assert.equal(await page.getByText(/^You finished|^Carry on/).count(), 0, 'Seed the database before this journey, because Tola must have no sessions.');
  await capture('fresh');
}

async function finishTopic({ page, capture }) {
  await openCard(page, FINISHED_TOPIC);
  await page.clock.fastForward(LONG_ENOUGH_TO_FINISH);
  await endSessionAndReturnHome(page);
  await expectCardReason(page, NEXT_TOPIC, NEXT_TOPIC_REASON);
  await expectNoCard(page, FINISHED_TOPIC);
  await capture('finished');
}

async function endTopicAfterSeconds({ page, capture }) {
  await openCard(page, SHORT_TOPIC);
  await endSessionAndReturnHome(page);
  await expectCardReason(page, SHORT_TOPIC, SHORT_TOPIC_REASON);
  await capture('ended-after-seconds');
}

async function leaveOneTopicOpen({ page, capture }) {
  await openCard(page, OLDER_OPEN_TOPIC);
  const sessionAddress = page.url();
  await leaveSessionOpen(page);
  await page.getByRole('heading', { level: 2, name: OLDER_OPEN_TOPIC }).waitFor();
  await page.getByText(`Computer science. ${CARRY_ON}.`).waitFor();
  await expectNoCard(page, OLDER_OPEN_TOPIC);
  await capture('continue-card');
  return sessionAddress;
}

async function carryOnFromCard({ page, capture }, sessionAddress) {
  await openCard(page, NEWEST_OPEN_TOPIC);
  await leaveSessionOpen(page);
  await page.getByRole('heading', { level: 2, name: NEWEST_OPEN_TOPIC }).waitFor();
  await expectCardReason(page, OLDER_OPEN_TOPIC, CARRY_ON);
  await capture('carry-on-card');
  await openCard(page, OLDER_OPEN_TOPIC);
  assert.equal(page.url(), sessionAddress, 'the card reopens the session it stands for');
}

export default async function historyPicks({ page, capture, signIn }) {
  await page.clock.install();
  await signIn('tola@astra.test');
  await expectFreshCards({ page, capture });
  await finishTopic({ page, capture });
  await endTopicAfterSeconds({ page, capture });
  const sessionAddress = await leaveOneTopicOpen({ page, capture });
  await carryOnFromCard({ page, capture }, sessionAddress);
}
