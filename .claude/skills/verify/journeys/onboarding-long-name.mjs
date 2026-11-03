import assert from 'node:assert/strict';
import { answerBirthDate, answerName, answerQuestionsToHome, recordSpeech, signInAsNewStudent, waitForConsentLink } from './onboarding-support.mjs';

export const deadlineMs = 240_000;

const FIRST_ANSWER_LIMIT = 500;
const LONG_NAME = 'Oluwaseyifunmilayo'.repeat(3) + 'Ade'.repeat(2);
const ANSWERS = {
  name: LONG_NAME,
  interest: 'Arsenal',
  level: 'High school',
  goal: 'A class I am taking',
  firstQuestion: 'Why do free kicks curve?',
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

async function acceptAsParent(page, link) {
  const parentContext = await page.context().browser().newContext({ viewport: page.viewportSize() });
  const parentPage = await parentContext.newPage();
  await parentPage.goto(link);
  await parentPage.getByRole('heading', { name: `${LONG_NAME} would like to use Astra.` }).waitFor();
  await assertNoSidewaysScroll(parentPage, 'the parent page');
  await parentPage.getByRole('button', { name: 'I accept' }).click();
  await parentPage.getByRole('heading', { name: 'Thank you.' }).waitFor();
  await parentPage.getByText(`${LONG_NAME} can start now.`).waitFor();
  await assertNoSidewaysScroll(parentPage, 'the thank you page');
  await parentContext.close();
}

async function checkAnswerLimit(page, capture) {
  const answerBox = page.getByRole('textbox', { name: 'Your answer' });
  await answerBox.focus();
  await page.keyboard.insertText('Q'.repeat(FIRST_ANSWER_LIMIT + 100));
  assert.equal((await answerBox.inputValue()).length, FIRST_ANSWER_LIMIT, 'the box stops at the limit');
  await page.getByText(`Your answer can be up to ${FIRST_ANSWER_LIMIT} characters.`).waitFor();
  await assertNoSidewaysScroll(page, 'the hello at the limit');
  await capture('hello-limit');
  await answerBox.fill('');
}

export default async function onboardingLongName({ page, capture, viewportName }) {
  await recordSpeech(page);
  const parentEmail = `m2-4-long-parent-${viewportName}-${Date.now()}@astra.test`;
  await signInAsNewStudent(page, `m2-4-long-${viewportName}-${Date.now()}@astra.test`);

  await answerName(page, capture, LONG_NAME);
  await answerBirthDate(page, capture, { day: '1', month: '6', year: String(new Date().getFullYear() - 15) });
  await page.getByRole('textbox', { name: 'Their email address' }).fill(parentEmail);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('heading', { name: 'Waiting for your parent or guardian.' }).waitFor();
  const [link] = await waitForConsentLink(parentEmail);

  await acceptAsParent(page, link);

  await answerQuestionsToHome(page, capture, {
    answers: ANSWERS,
    checkSpeech: async () => undefined,
    checkHello: async () => {
      await assertNoSidewaysScroll(page, 'the hello');
      await checkAnswerLimit(page, capture);
    },
  });
  await assertNoSidewaysScroll(page, 'Home');
  await capture('home');
}
