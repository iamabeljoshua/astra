import assert from 'node:assert/strict';

export const deadlineMs = 180_000;

const GREETING = /^Welcome( back)?, Tola\.$/;
const STUCK_ON_LIBRARY_TOPIC = 'free-body diagrams';
const LIBRARY_LESSON = 'What holds a block on a slope';
const STUCK_ON_OWN_TOPIC = 'moving a term across the equals sign';
const OWN_LESSON = 'Moving a term across the equals sign';
const RIGHT_TOPIC = 'solving quadratic equations';
const QUADRATIC_LESSON = 'What a quadratic is really asking';

const getCardsRegion = (page) => page.locator('section').filter({ hasText: 'Picked for you' });
const getCard = (page, title) => getCardsRegion(page).getByRole('button').filter({ has: page.getByText(title, { exact: true }) });

async function setTheme(page, theme) {
  await page.evaluate((name) => localStorage.setItem('theme', name), theme);
  await page.reload();
  await page.locator(theme === 'dark' ? 'html[data-theme="dark"]' : 'html:not([data-theme="dark"])').waitFor({ state: 'attached' });
  await page.getByRole('heading', { name: GREETING }).waitFor();
  await getCardsRegion(page).getByRole('button').first().waitFor();
}

async function askAndEnd(page) {
  await page.getByRole('textbox', { name: 'What do you want to learn next' }).fill('Which way does friction point on a slope?');
  await page.getByRole('button', { name: 'Start session' }).click();
  await page.waitForURL(/\/sessions\/[\w-]+/);
  const sessionId = new URL(page.url()).pathname.split('/').pop();
  await page.getByRole('button', { name: 'End session' }).click();
  await page.getByRole('heading', { name: GREETING }).waitFor();
  return sessionId;
}

// The same call the agent makes as a room closes. A real pass needs a model and a voice room, and this proves everything from that call to the screen.
async function writeNotes(page, sessionId, updateKey, notes) {
  const response = await page.request.post(`/api/agent/sessions/${sessionId}/record`, {
    headers: { authorization: `Bearer ${process.env.ASTRA_AGENT_KEY}` },
    data: { updateKey, notes },
  });
  assert.equal(response.status(), 200, 'the note is written');
  await page.reload();
  await page.getByRole('heading', { name: GREETING }).waitFor();
  await getCardsRegion(page).getByRole('button').first().waitFor();
}

const said = (text) => [{ source: 'words', text, check: null }];

export default async function recordPicks({ page, capture, viewportName, signIn }) {
  await signIn('tola@astra.test');
  await page.getByRole('heading', { name: GREETING }).waitFor();
  assert.equal(await getCardsRegion(page).getByRole('button').count(), 6, 'a new student gets six cards');
  assert.equal(await page.getByText(/^You (got|said)/).count(), 0, 'Seed the database first, because Tola must have no notes.');
  await capture('new-light');
  await setTheme(page, 'dark');
  await capture('new-dark');
  await setTheme(page, 'light');

  const sessionId = await askAndEnd(page);
  await writeNotes(page, sessionId, `first-${viewportName}`, [
    { kind: 'struggled', topic: STUCK_ON_OWN_TOPIC, detail: null, evidence: [{ source: 'board', text: '2x + 3 = 7 becomes 2x = 10', check: 'wrong' }] },
    { kind: 'struggled', topic: STUCK_ON_LIBRARY_TOPIC, detail: null, evidence: said('i do not get which way friction points') },
    { kind: 'showed', topic: RIGHT_TOPIC, detail: null, evidence: [{ source: 'board', text: 'x = 2', check: 'right' }] },
  ]);

  const libraryCard = getCard(page, LIBRARY_LESSON);
  await libraryCard.getByText(`You got stuck on ${STUCK_ON_LIBRARY_TOPIC} today`, { exact: true }).waitFor();
  await getCard(page, OWN_LESSON).getByText(`You got stuck on ${STUCK_ON_OWN_TOPIC} today`, { exact: true }).waitFor();
  await getCard(page, QUADRATIC_LESSON).getByText(`You got ${RIGHT_TOPIC} right today`, { exact: true }).waitFor();
  assert.equal(await getCardsRegion(page).getByRole('button').count(), 6, 'a returning student still gets six cards');
  await capture('returning-light');
  await setTheme(page, 'dark');
  await capture('returning-dark');
  await setTheme(page, 'light');

  if (viewportName === 'phone') await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('link', { name: 'Your notes' }).click();
  const notes = page.getByRole('region', { name: 'What your tutor remembers' });
  await notes.getByRole('button', { name: `Remove ${STUCK_ON_LIBRARY_TOPIC}` }).click();
  await notes.getByText(STUCK_ON_LIBRARY_TOPIC, { exact: true }).waitFor({ state: 'detached' });
  if (viewportName === 'phone') await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('navigation', { name: 'Menu' }).getByRole('link', { name: 'Home' }).click();
  await page.getByRole('heading', { name: GREETING }).waitFor();
  await getCard(page, OWN_LESSON).waitFor();
  assert.equal(await page.getByText(`You got stuck on ${STUCK_ON_LIBRARY_TOPIC} today`, { exact: true }).count(), 0, 'a removed note takes its reason with it, with no reload');
  await capture('note-removed');

  await getCard(page, OWN_LESSON).click();
  await page.getByRole('heading', { level: 1, name: OWN_LESSON }).waitFor();
  await page.getByRole('button', { name: 'End session' }).click();
  await page.getByRole('heading', { name: GREETING }).waitFor();
  await getCardsRegion(page).getByRole('button').first().waitFor();
  assert.equal(await getCard(page, OWN_LESSON).count(), 0, 'going back to a struggle takes its card away');
  await capture('went-back');
}
