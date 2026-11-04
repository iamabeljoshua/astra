import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';

const PACE_MS = Number(process.env.ONBOARDING_PACE_MS ?? 0);
const TYPING_DELAY_MS = PACE_MS ? 90 : 0;
const INTEREST_COUNT = 12;

const pause = () => sleep(PACE_MS);

function typeInto(field, text) {
  return field.pressSequentially(text, { delay: TYPING_DELAY_MS });
}

export async function signInAsNewStudent(page, signInWithCode, email) {
  await page.goto('/');
  if (process.env.ONBOARDING_THEME === 'dark') await page.getByRole('button', { name: 'Dark' }).click();
  await page.getByRole('heading', { name: 'Welcome, I am Astra, your personal AI tutor.' }).waitFor();
  await pause();
  await signInWithCode(email);
}

export async function answerName(page, capture, name) {
  await page.getByRole('heading', { name: 'What should I call you?' }).waitFor();
  await typeInto(page.getByRole('textbox', { name: 'Your first name' }), name);
  await page.getByText(`A learning app, made for ${name}`).waitFor();
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
  assert.equal(await page.getByRole('group', { name: 'What are you into?' }).locator('button svg[aria-hidden="true"]').count(), INTEREST_COUNT, 'every chip has a picture hidden from a screen reader');
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
