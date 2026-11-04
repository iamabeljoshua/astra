import assert from 'node:assert/strict';

const GREETING = 'Welcome back, Maya.';
const CARD_TITLE = 'How a jump shot flies';

async function openSessions({ page, viewportName }) {
  if (viewportName === 'phone') await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('navigation', { name: 'Menu' }).getByRole('link', { name: 'Sessions' }).click();
  await page.getByRole('heading', { name: 'Sessions' }).waitFor();
}

async function sendQuestionAndEnd({ page, capture, viewportName }) {
  const question = `Why is the sky dark at night, ${viewportName} ${Date.now()}`;
  await page.getByRole('textbox', { name: 'What do you want to learn next' }).fill(question);
  await page.getByRole('button', { name: 'Start session' }).click();
  await page.locator('.stop-dot').waitFor();
  await capture('dot');
  await page.getByRole('heading', { level: 1, name: question }).waitFor();
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

async function startFromCardRefreshSearchAndEnd({ page, capture }) {
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

  // An open session moves its card off Home, and ending it this soon puts the card back for the next viewport.
  await page.goto(sessionAddress);
  await page.getByRole('button', { name: 'End session' }).click();
  await page.getByRole('heading', { name: GREETING }).waitFor();
}

export default async function sessions({ page, capture, viewportName, signIn }) {
  await signIn();
  await page.getByRole('heading', { name: GREETING }).waitFor();
  await sendQuestionAndEnd({ page, capture, viewportName });
  await startFromCardRefreshSearchAndEnd({ page, capture });
}
