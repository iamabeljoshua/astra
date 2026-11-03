import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';

const LOCAL_INBOX = 'http://127.0.0.1:54424';
const SIGN_IN_LINK = /https?:\/\/\S+\/verify\?\S+/;
const INBOX_POLL_MS = 200;
const INBOX_TRIES = 50;

const PACE_MS = Number(process.env.ONBOARDING_PACE_MS ?? 0);
const TYPING_DELAY_MS = PACE_MS ? 90 : 0;

const pause = () => sleep(PACE_MS);

function typeInto(field, text) {
  return field.pressSequentially(text, { delay: TYPING_DELAY_MS });
}

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

export async function signInAsNewStudent(page, email) {
  await page.goto('/');
  if (process.env.ONBOARDING_THEME === 'dark') await page.getByRole('button', { name: 'Dark' }).click();
  await page.getByRole('heading', { name: 'A learning app, made for you' }).waitFor();
  await page.getByText("It's an AI").waitFor();
  await pause();
  await page.getByRole('button', { name: 'Continue with email' }).click();
  await typeInto(page.getByRole('textbox', { name: 'Your email address' }), email);
  await page.getByRole('button', { name: 'Send link' }).click();
  await page.getByRole('heading', { name: 'Check your email.' }).waitFor();
  await pause();
  await page.goto(await readLinkFromInbox(email));
}

export async function answerName(page, capture, name) {
  await page.getByRole('heading', { name: 'What should your tutor call you?' }).waitFor();
  await typeInto(page.getByRole('textbox', { name: 'Your first name' }), name);
  await page.getByRole('heading', { name: `Made for ${name}` }).waitFor();
  await capture('name');
  await pause();
  await page.getByRole('button', { name: 'Continue' }).click();
}

export async function answerBirthDate(page, capture, { day, month, year }) {
  await page.getByRole('heading', { name: 'When were you born?' }).waitFor();
  await capture('birth-date');
  await page.getByRole('textbox', { name: 'Day' }).fill(day);
  await page.getByRole('textbox', { name: 'Month' }).fill(month);
  await page.getByRole('textbox', { name: 'Year' }).fill(year);
  await pause();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Yes, continue' }).click();
}

export async function answerQuestionsToHome(page, capture, { name, level, interests, goal }) {
  await page.getByRole('heading', { name: 'Where are you in your learning?' }).waitFor();
  await capture('level');
  await pause();
  await page.getByRole('button', { name: level }).click();

  await page.getByRole('heading', { name: 'What are you into?' }).waitFor();
  assert.equal(await page.getByRole('textbox').count(), 0, 'interests have no box to type in');
  for (const interest of interests) await page.getByRole('button', { name: interest, exact: true }).click();
  await capture('interests');
  await pause();
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('heading', { name: 'What brings you here?' }).waitFor();
  await capture('goal');
  await pause();
  await page.getByRole('button', { name: goal }).click();

  await page.getByRole('heading', { name: `Welcome, ${name}.` }).waitFor();
}

export async function assertReasonsClaimOnly(page, interests) {
  await page.getByText('Picked for you').waitFor();
  await page.locator('main li').first().waitFor();
  const claims = await page.getByText("Because you're into", { exact: false }).allTextContents();
  const named = claims.map((claim) => claim.replace("Because you're into ", ''));
  const chosen = interests.map((interest) => interest.toLowerCase());
  assert.ok(named.length > 0, 'a chosen interest brings at least one card');
  assert.deepEqual([...new Set(named)].filter((interest) => !chosen.includes(interest)), [], 'a reason names only a chosen interest');
}
