import assert from 'node:assert/strict';
import { answerBirthDate, answerName, answerQuestionsToHome, recordSpeech, signInAsNewStudent } from './onboarding-support.mjs';

export const deadlineMs = 240_000;

const ANSWERS = {
  name: 'Maya',
  interest: 'Arsenal',
  level: 'University',
  goal: 'An exam coming up',
  firstQuestion: 'Why do free kicks curve?',
};

async function changeAnswerLater(page, viewportName) {
  if (viewportName === 'phone') await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('link', { name: 'Your notes' }).click();
  await page.getByRole('heading', { name: "Your tutor's notes" }).waitFor();
  assert.equal(await page.getByRole('textbox', { name: 'Name' }).inputValue(), ANSWERS.name);
  assert.equal(await page.getByRole('button', { name: 'University' }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: 'High school' }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.getByText('Saved.').waitFor();
  await page.reload();
  await page.getByRole('heading', { name: "Your tutor's notes" }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'High school' }).getAttribute('aria-pressed'), 'true', 'the change survives a reload');
}

export default async function onboardingAdult({ page, capture, viewportName }) {
  await recordSpeech(page);
  const startedAt = Date.now();
  await signInAsNewStudent(page, `m2-4-adult-${viewportName}-${Date.now()}@astra.test`);

  await answerName(page, capture, ANSWERS.name);
  await answerBirthDate(page, capture, { day: '14', month: '3', year: '2004' });
  await answerQuestionsToHome(page, capture, {
    answers: ANSWERS,
    checkSpeech: async () => {
      const lines = await page.evaluate(() => window.spokenLines);
      assert.equal(lines.length, 3, 'every voice plays');
      assert.equal(new Set(lines.map((line) => `${line.pitch}/${line.rate}`)).size, 3, 'each voice has its own tone');
      assert.ok(lines.every((line) => line.isOnDevice), 'only on-device voices speak');
    },
  });
  console.log(`SECONDS from the tagline to Home at ${viewportName}: ${Math.round((Date.now() - startedAt) / 1000)}`);
  await capture('home');

  await changeAnswerLater(page, viewportName);
  await capture('notes');
}
