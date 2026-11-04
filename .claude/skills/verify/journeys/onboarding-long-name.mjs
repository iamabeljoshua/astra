import assert from 'node:assert/strict';
import { answerBirthDate, answerName, answerQuestionsToHome, signInAsNewStudent } from './onboarding-support.mjs';

export const deadlineMs = 240_000;

const SESSION_STORAGE_KEY = 'astra-session';
const LONG_NAME = 'Oluwaseyifunmilayo'.repeat(3) + 'Ade'.repeat(2);
const ANSWERS = {
  name: LONG_NAME,
  level: 'High school',
  interests: ['Cooking'],
  goal: 'Improve my grades',
};

async function assertNoSidewaysScroll(page, screenName) {
  const widths = await page.evaluate(() => {
    const heading = document.querySelector('h1');
    return {
      page: document.documentElement.scrollWidth,
      window: window.innerWidth,
      heading: heading.scrollWidth,
      headingBox: heading.clientWidth,
    };
  });
  assert.ok(widths.page <= widths.window, `${screenName} scrolls sideways: ${JSON.stringify(widths)}`);
  assert.ok(widths.heading <= widths.headingBox, `${screenName} heading overflows: ${JSON.stringify(widths)}`);
}

async function startSession(page) {
  const session = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SESSION_STORAGE_KEY);
  const response = await fetch(new URL('/api/sessions', page.url()), {
    method: 'POST',
    headers: { authorization: `Bearer ${session.access_token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Free-body diagrams', subject: 'Physics', language: 'en' }),
  });
  return response.status;
}

export default async function onboardingLongName({ page, capture, viewportName, signInWithCode }) {
  await signInAsNewStudent(page, signInWithCode, `m2-4-long-${viewportName}-${Date.now()}@astra.test`);

  await answerName(page, capture, LONG_NAME);
  await answerBirthDate(page, capture, { day: '1', month: '6', year: String(new Date().getFullYear() - 15) });
  await page.getByRole('heading', { name: 'Where are you in your learning?' }).waitFor();
  await assertNoSidewaysScroll(page, 'the level question');
  await page.reload();
  await answerQuestionsToHome(page, capture, ANSWERS);
  await assertNoSidewaysScroll(page, 'Home');
  await capture('home');

  assert.equal(await startSession(page), 201, 'a 15-year-old can start a session, with no parent step');
}
