import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';

const LOCAL_INBOX = 'http://127.0.0.1:54424';
const SIGN_IN_LINK = /https?:\/\/\S+\/verify\?\S+/;
const INBOX_POLL_MS = 200;
const INBOX_TRIES = 50;

export const deadlineMs = 90_000;

async function readLinkFromInbox(email) {
  for (let attempt = 0; attempt < INBOX_TRIES; attempt += 1) {
    const search = await fetch(`${LOCAL_INBOX}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
    const [newest] = (await search.json()).messages;
    if (newest) {
      const message = await (await fetch(`${LOCAL_INBOX}/api/v1/message/${newest.ID}`)).json();
      return SIGN_IN_LINK.exec(message.Text)[0];
    }
    await sleep(INBOX_POLL_MS);
  }
  throw new Error(`No mail reached ${email} in the local inbox.`);
}

export default async function signIn({ page, capture, viewportName }) {
  const email = `verify-${viewportName}-${Date.now()}@astra.test`;
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue with email' }).click();
  await page.getByRole('textbox', { name: 'Your email address' }).fill(email);
  await page.getByRole('button', { name: 'Send link' }).click();
  await page.getByRole('heading', { name: 'Check your email.' }).waitFor();
  await capture('sent');

  await page.goto(await readLinkFromInbox(email));
  await page.getByRole('heading', { name: 'When were you born?' }).waitFor();
  await capture('birth-date');
  await page.getByRole('textbox', { name: 'Day' }).fill('14');
  await page.getByRole('textbox', { name: 'Month' }).fill('3');
  await page.getByRole('textbox', { name: 'Year' }).fill('2004');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('heading', { name: 'Welcome back.' }).waitFor();
  await capture('home');

  if (viewportName === 'phone') await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('button', { name: 'Continue with email' }).waitFor();

  await page.goBack();
  await page.getByRole('button', { name: 'Continue with email' }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Welcome back' }).count(), 0, 'Back shows no student page');
  await capture('after-back');
}
