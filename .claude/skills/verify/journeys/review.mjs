import assert from 'node:assert/strict';

// The API must run with SAFETY_REVIEWER_IDS naming Maya and ASTRA_AGENT_KEY set to any value, because the journey flags a session as the agent does.
const NOT_A_REVIEWER = 'tola@astra.test';

async function flagFirstSession(page) {
  const sessions = await page.waitForResponse((response) => new URL(response.url()).pathname === '/api/sessions');
  const [firstSession] = await sessions.json();
  const flagged = await page.request.post(`/api/agent/sessions/${firstSession.id}/flags`, {
    headers: { authorization: `Bearer ${process.env.ASTRA_AGENT_KEY}` },
    data: { kind: 'self_harm', source: 'student' },
  });
  assert.equal(flagged.status(), 200, 'the agent route takes the flag');
}

// The sign-in page says "Welcome, I am Astra" too, so only a session list loaded for a signed-in student proves Tola is in.
const signedInHome = (page) => page.waitForResponse((response) => new URL(response.url()).pathname === '/api/sessions' && response.ok());

export default async function review({ page, capture, signIn }) {
  const flagged = flagFirstSession(page);
  await signIn();
  await flagged;

  await page.goto('/review');
  await page.getByRole('heading', { name: 'Safety flags' }).waitFor();
  await page.getByText('A flag holds no words.').waitFor();
  await page.getByRole('heading', { name: 'Self-harm' }).first().waitFor();
  await capture('queue');

  const unreviewed = await page.getByRole('button', { name: 'Mark reviewed' }).count();
  await page.getByRole('button', { name: 'Mark reviewed' }).first().click();
  await page.getByRole('button', { name: 'Mark reviewed' }).nth(unreviewed - 1).waitFor({ state: 'detached' });
  await capture('reviewed');

  await page.evaluate(() => localStorage.clear());
  const tolaIsIn = signedInHome(page);
  await signIn(NOT_A_REVIEWER);
  await tolaIsIn;
  await page.goto('/review');
  await page.waitForURL((url) => url.pathname === '/');
  assert.equal(await page.getByRole('heading', { name: 'Safety flags' }).count(), 0, 'a non-reviewer never sees the queue');
}
