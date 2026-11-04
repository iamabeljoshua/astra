import assert from 'node:assert/strict';
import { answerBirthDate, answerName, answerQuestionsToHome, assertReasonsClaimOnly, signInAsNewStudent } from './onboarding-support.mjs';

export const deadlineMs = 240_000;

const ANSWERS = {
  name: 'Maya',
  level: 'University',
  interests: ['Space', 'Music'],
  goal: 'Get ready for an exam',
};

async function changeAnswerLater(page, viewportName) {
  if (viewportName === 'phone') await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('link', { name: 'Your notes' }).click();
  await page.getByRole('heading', { name: "Your tutor's notes" }).waitFor();
  assert.equal(await page.getByRole('textbox', { name: 'Name' }).inputValue(), ANSWERS.name);
  assert.equal(await page.getByRole('button', { name: 'University' }).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.getByRole('button', { name: 'Space', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.getByRole('button', { name: 'Get ready for an exam' }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: 'High school' }).click();
  await page.getByRole('button', { name: 'Art', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.getByText('Saved.').waitFor();
  await page.reload();
  await page.getByRole('heading', { name: "Your tutor's notes" }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'High school' }).getAttribute('aria-pressed'), 'true', 'the level survives a reload');
  assert.equal(await page.getByRole('button', { name: 'Art', exact: true }).getAttribute('aria-pressed'), 'true', 'the chip survives a reload');
}

export default async function onboarding({ page, capture, viewportName }) {
  const startedAt = Date.now();
  await signInAsNewStudent(page, `m2-4-${viewportName}-${Date.now()}@astra.test`);
  const signedInAt = Date.now();

  await answerName(page, capture, ANSWERS.name);
  await answerBirthDate(page, capture, { day: '14', month: '3', year: '2004' });
  await answerQuestionsToHome(page, capture, ANSWERS);
  const homeAt = Date.now();
  console.log(`SECONDS from sign-in to Home at ${viewportName}: ${Math.round((homeAt - signedInAt) / 1000)}`);
  console.log(`SECONDS from the tagline to Home at ${viewportName}: ${Math.round((homeAt - startedAt) / 1000)}`);
  await assertReasonsClaimOnly(page, ANSWERS.interests);
  await capture('home');

  await page.reload();
  await page.getByRole('heading', { name: `Welcome, ${ANSWERS.name}.` }).waitFor();

  await changeAnswerLater(page, viewportName);
  await capture('notes');
}
