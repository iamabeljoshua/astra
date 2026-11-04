import { setTimeout as sleep } from 'node:timers/promises';

const SEEDED_STUDENT_EMAIL = 'maya@astra.test';
const LOCAL_INBOX = 'http://127.0.0.1:54424';
const SIX_DIGITS = /\b\d{6}\b/;
const INBOX_POLL_MS = 200;
const INBOX_TRIES = 50;

export function createSignIn(page) {
  return async (email = SEEDED_STUDENT_EMAIL) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Development sign-in' }).click();
    await page.getByRole('button', { name: email }).click();
  };
}

async function findNewestMail(email) {
  const search = await fetch(`${LOCAL_INBOX}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
  const [newest] = (await search.json()).messages;
  return newest;
}

async function readCodeFromInbox(email, earlierMailId) {
  for (let attempt = 0; attempt < INBOX_TRIES; attempt += 1) {
    const newest = await findNewestMail(email);
    if (newest && newest.ID !== earlierMailId) {
      const message = await (await fetch(`${LOCAL_INBOX}/api/v1/message/${newest.ID}`)).json();
      return SIX_DIGITS.exec(message.Text)[0];
    }
    await sleep(INBOX_POLL_MS);
  }
  throw new Error(`No new mail reached ${email} in the local inbox.`);
}

export function createSignInWithCode(page) {
  return async (email) => {
    const earlierMail = await findNewestMail(email);
    await page.goto('/');
    await page.getByRole('textbox', { name: 'Your email' }).fill(email);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('heading', { name: 'Check your email. I sent you a code.' }).waitFor();
    const code = await readCodeFromInbox(email, earlierMail?.ID);
    await page.getByRole('textbox', { name: '6-digit code' }).fill(code);
  };
}
