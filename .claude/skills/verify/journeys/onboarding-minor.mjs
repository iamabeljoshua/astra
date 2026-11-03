import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { answerBirthDate, answerName, answerQuestionsToHome, recordSpeech, signInAsNewStudent } from './onboarding-support.mjs';

export const deadlineMs = 240_000;

const DEV_LOG = '.verify/dev.log';
const SESSION_STORAGE_KEY = 'astra-session';
const CONSENT_MOVE_ON_LIMIT_MS = 12_000;
const FADE_MS = 600;

const ANSWERS = {
  name: 'Tolu',
  interest: 'Afrobeats',
  level: 'High school',
  goal: 'A class I am taking',
  firstQuestion: 'How does a speaker make sound?',
};

async function readConsentLinks(parentEmail) {
  const log = await readFile(DEV_LOG, 'utf8');
  const lines = log.split('\n').filter((line) => line.includes(`Consent link for ${parentEmail}:`));
  return lines.map((line) => /https?:\/\/[^\s\u001b]+/.exec(line)[0]);
}

async function waitForConsentLink(parentEmail) {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const links = await readConsentLinks(parentEmail);
    if (links.length > 0) return links;
    await sleep(200);
  }
  throw new Error(`No consent link for ${parentEmail} in ${DEV_LOG}.`);
}

async function tryToStartSession(page) {
  const session = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SESSION_STORAGE_KEY);
  const response = await fetch(new URL('/api/sessions', page.url()), {
    method: 'POST',
    headers: { authorization: `Bearer ${session.access_token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Free-body diagrams', subject: 'Physics', language: 'en' }),
  });
  return response.status;
}

async function acceptAsParent(page, { folder, viewportName }, link) {
  const parentContext = await page.context().browser().newContext({ viewport: page.viewportSize() });
  const parentPage = await parentContext.newPage();
  await parentPage.goto(link);
  if (process.env.ONBOARDING_THEME === 'dark') await parentPage.getByRole('button', { name: 'Dark' }).click();
  await parentPage.getByRole('heading', { name: `${ANSWERS.name} would like to use Astra.` }).waitFor();
  await sleep(FADE_MS);
  await parentPage.screenshot({ path: `${folder}/onboarding-minor-${viewportName}-parent-page.png`, fullPage: true });
  await parentPage.getByRole('button', { name: 'I accept' }).click();
  await parentPage.getByRole('heading', { name: 'Thank you.' }).waitFor();
  await sleep(FADE_MS);
  await parentPage.screenshot({ path: `${folder}/onboarding-minor-${viewportName}-parent-accepted.png`, fullPage: true });
  await parentContext.close();
}

export default async function onboardingMinor({ page, capture, viewportName }) {
  await recordSpeech(page);
  const parentEmail = `m2-4-parent-${viewportName}-${Date.now()}@astra.test`;
  await signInAsNewStudent(page, `m2-4-minor-${viewportName}-${Date.now()}@astra.test`);

  await answerName(page, capture, ANSWERS.name);
  await answerBirthDate(page, capture, { day: '1', month: '6', year: String(new Date().getFullYear() - 15) });

  await page.getByRole('heading', { name: 'A parent or guardian approves your account.' }).waitFor();
  await capture('parent');
  await page.getByRole('textbox', { name: 'Their email address' }).fill(parentEmail);
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('heading', { name: 'Waiting for your parent or guardian.' }).waitFor();
  await page.getByText(parentEmail).waitFor();
  await capture('waiting');

  const links = await waitForConsentLink(parentEmail);
  assert.equal(links.length, 1, 'one consent link is logged');
  assert.ok(!links[0].includes('code='), 'the link does not use ?code=');
  assert.equal(await tryToStartSession(page), 403, 'an unconfirmed minor cannot start a session');
  await sleep(6_000);
  await page.getByRole('heading', { name: 'Waiting for your parent or guardian.' }).waitFor();

  await acceptAsParent(page, { folder: process.env.ONBOARDING_EVIDENCE ?? '.verify/evidence', viewportName }, links[0]);

  await page.getByRole('heading', { name: 'What are you into?' }).waitFor({ timeout: CONSENT_MOVE_ON_LIMIT_MS });
  await answerQuestionsToHome(page, capture, {
    answers: ANSWERS,
    checkSpeech: async () => {
      assert.equal((await page.evaluate(() => window.spokenLines)).length, 3, 'every voice plays');
    },
  });
  assert.equal(await tryToStartSession(page), 201, 'the student can start a session after consent');
  await capture('home');
}
