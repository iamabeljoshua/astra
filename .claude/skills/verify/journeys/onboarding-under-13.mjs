import { answerBirthDate, answerName, signInAsNewStudent } from './onboarding-support.mjs';

export const deadlineMs = 90_000;

const CLOSED_HEADING = "We can't set up this account.";

export default async function onboardingUnder13({ page, capture, viewportName, signInWithCode }) {
  await signInAsNewStudent(page, signInWithCode, `m2-4-young-${viewportName}-${Date.now()}@astra.test`);

  await answerName(page, capture, 'Maya');
  await answerBirthDate(page, capture, { day: '1', month: '6', year: String(new Date().getFullYear() - 10) });
  await page.getByRole('heading', { name: CLOSED_HEADING }).waitFor();
  await capture('closed');

  await page.reload();
  await page.getByRole('heading', { name: CLOSED_HEADING }).waitFor();
}
