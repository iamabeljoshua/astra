import { setTimeout as sleep } from 'node:timers/promises';

const LOCAL_INBOX = 'http://127.0.0.1:54424';
const SIGN_IN_LINK = /https?:\/\/\S+\/verify\?\S+/;
const INBOX_POLL_MS = 200;
const INBOX_TRIES = 50;

// Set ONBOARDING_PACE_MS to stand in for a student reading each screen, for a timed run.
const PACE_MS = Number(process.env.ONBOARDING_PACE_MS ?? 0);
const TYPING_DELAY_MS = PACE_MS ? 90 : 0;

export const pause = () => sleep(PACE_MS);

export function typeInto(field, text) {
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

export async function answerName(page, capture, name) {
  await page.getByRole('heading', { name: 'What should your tutor call you?' }).waitFor();
  await typeInto(page.getByRole('textbox', { name: 'Your first name' }), name);
  await page.getByRole('heading', { name: `Made for ${name}` }).waitFor();
  await capture('name');
  await pause();
  await page.getByRole('button', { name: 'Continue' }).click();
}

export async function answerQuestionsToHome(page, capture, { answers, checkSpeech }) {
  await page.getByRole('heading', { name: 'What are you into?' }).waitFor();
  await page.getByRole('button', { name: 'Space' }).click();
  await typeInto(page.getByRole('textbox', { name: 'Be specific. Arsenal beats football.' }), answers.interest);
  await capture('into');
  await pause();
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('heading', { name: 'Where are you in your learning?' }).waitFor();
  await capture('level');
  await pause();
  await page.getByRole('button', { name: answers.level }).click();

  await page.getByRole('heading', { name: 'What brings you here?' }).waitFor();
  await capture('goal');
  await pause();
  await page.getByRole('button', { name: answers.goal }).click();

  await page.getByRole('heading', { name: "Pick your tutor's voice." }).waitFor();
  await page.getByRole('button', { name: /Ada/ }).click();
  await pause();
  await page.getByRole('button', { name: /Kofi/ }).click();
  await pause();
  await page.getByRole('button', { name: /Noor/ }).click();
  await capture('voice');
  await checkSpeech();
  await page.waitForFunction(() => window.spokenLines.at(-1).started, undefined, { timeout: 10_000 });
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('heading', { name: new RegExp(`Hi ${answers.name}\\. I'm your tutor, and I'm an AI\\. You said you're into ${answers.interest}`) }).waitFor();
  await page.getByText('Listening').waitFor({ timeout: 20_000 });
  await capture('hello');
  await page.waitForFunction(() => window.spokenLines.at(-1).text.includes("I'm an AI") && window.spokenLines.at(-1).started, undefined, { timeout: 10_000 });
  await pause();
  await typeInto(page.getByRole('textbox', { name: 'Your answer' }), answers.firstQuestion);
  await page.getByRole('button', { name: 'Send your answer' }).click();

  await page.getByRole('heading', { name: `Welcome, ${answers.name}.` }).waitFor();
  await page.getByRole('heading', { level: 2, name: answers.firstQuestion }).waitFor();
  await page.getByText('Start here').waitFor();
}

// Records what the page gives the speech engine, because the headless browser is muted.
export function recordSpeech(page) {
  return page.addInitScript(() => {
    window.spokenLines = [];
    const speak = window.speechSynthesis.speak.bind(window.speechSynthesis);
    window.speechSynthesis.speak = (utterance) => {
      const line = { text: utterance.text, pitch: utterance.pitch, rate: utterance.rate, isOnDevice: utterance.voice?.localService ?? null, started: false };
      window.spokenLines.push(line);
      utterance.addEventListener('start', () => {
        line.started = true;
      });
      speak(utterance);
    };
  });
}
