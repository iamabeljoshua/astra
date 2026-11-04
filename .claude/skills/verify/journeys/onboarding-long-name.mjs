import assert from 'node:assert/strict';
import { answerBirthDate, answerName, answerQuestionsToHome, readChart, signInAsNewStudent, waitForChartToSettle } from './onboarding-support.mjs';

export const deadlineMs = 240_000;

const SESSION_STORAGE_KEY = 'astra-session';
const NARROWEST_WIDE_LAYOUT = 1021;
const LONG_NAME = 'Oluwaseyifunmilayo'.repeat(3) + 'Ade'.repeat(2);
const NAME_WITH_OVERHANG = 'Yousuf';
const ANSWERS = {
  name: LONG_NAME,
  level: 'High school',
  interests: ['Cooking'],
  goal: 'Improve my grades',
};

async function assertOverhangKeepsDots(page, capture) {
  await page.getByRole('heading', { name: 'What should I call you?' }).waitFor();
  const planet = await readChart(page);
  const field = page.getByRole('textbox', { name: 'Your first name' });
  await field.fill(NAME_WITH_OVERHANG);
  await waitForChartToSettle();
  await capture('name-with-overhang');
  assert.notEqual(await readChart(page), planet, `${NAME_WITH_OVERHANG} keeps the planet, so a final f that overhangs the paper's side lost the name's dots`);
  await field.clear();
}

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

async function assertTitleKeepsToOneLine(page, capture) {
  const widestWindow = page.viewportSize();
  await page.setViewportSize({ width: NARROWEST_WIDE_LAYOUT, height: widestWindow.height });
  const title = page.getByText('A learning app, made for', { exact: false });
  const { height, lineHeight } = await title.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
  }));
  await capture('title-at-1021');
  await page.setViewportSize(widestWindow);
  assert.ok(height < lineHeight * 2, `a long name's title takes ${height}px at ${NARROWEST_WIDE_LAYOUT} wide, more than one line of ${lineHeight}px, so it can reach the HISTORY label`);
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

  await assertOverhangKeepsDots(page, capture);
  await answerName(page, capture, LONG_NAME);
  await page.getByRole('heading', { name: 'When were you born?' }).waitFor();
  await assertNoSidewaysScroll(page, 'the date of birth question');
  if (viewportName === 'laptop') await assertTitleKeepsToOneLine(page, capture);
  await answerBirthDate(page, capture, { day: '1', month: '6', year: String(new Date().getFullYear() - 15) });
  await page.getByRole('heading', { name: 'Where are you in your learning?' }).waitFor();
  await assertNoSidewaysScroll(page, 'the level question');
  await page.reload();
  await answerQuestionsToHome(page, capture, ANSWERS);
  await assertNoSidewaysScroll(page, 'Home');
  await capture('home');

  assert.equal(await startSession(page), 201, 'a 15-year-old can start a session, with no parent step');
}
