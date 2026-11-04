import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { Browser } from 'playwright';
import { startVoiceStack } from './stack.ts';
import { launchProofBrowser, openStudentPage } from './student-page.ts';

const { values: args } = parseArgs({ options: { out: { type: 'string', default: '/tmp/personal-on-page' } } });

const FIRST_STUDENT = 'maya@astra.test';
const SECOND_STUDENT = 'tola@astra.test';
const SAME_TOPIC = 'Solving equations';
const STRUGGLE_TOPIC = 'moving a term across the equals sign';
const CRISIS_LINE = "i don't want to be alive anymore";
const REPLY_LIMIT_MS = 40_000;
const QUIET_MS = 7000;
const POLL_MS = 250;
const delay = (ms: number) => new Promise((done) => setTimeout(done, ms));
const out = args.out as string;
mkdirSync(out, { recursive: true });

type OpenedPage = Awaited<ReturnType<typeof openStudentPage>>;

const readCaption = ({ page }: OpenedPage) =>
  page.evaluate(() => {
    const { tutorHeard, tutorComing } = window.astraVoice?.getView() as unknown as { tutorHeard: string[]; tutorComing: string[] };
    return [...tutorHeard, ...tutorComing].join(' ');
  });

async function waitForTheTutorToFinish({ page }: OpenedPage) {
  await page.waitForFunction(() => window.astraVoice?.getView().hasTutorStarted === true, undefined, { timeout: REPLY_LIMIT_MS });
  let quietSinceMs = Date.now();
  const deadline = Date.now() + REPLY_LIMIT_MS;
  while (Date.now() - quietSinceMs < QUIET_MS && Date.now() < deadline) {
    const isBusy = await page.evaluate(() => window.astraVoice?.getView().isTutorSpeaking === true || window.astraVoice?.getView().isThinking === true);
    if (isBusy) quietSinceMs = Date.now();
    await delay(POLL_MS);
  }
}

async function runSession(browser: Browser, { email, title, lines, shot }: { email: string; title: string; lines: readonly string[]; shot: string }) {
  const student = await openStudentPage(browser, { email, title, opensScreen: false });
  await student.page.goto(student.sessionUrl);
  await waitForTheTutorToFinish(student);
  const replies = [await readCaption(student)];
  for (const line of lines) {
    await student.page.evaluate((text) => (window.astraVoice as unknown as { sendTyped(line: string): void }).sendTyped(text), line);
    await delay(1000);
    await waitForTheTutorToFinish(student);
    replies.push(await readCaption(student));
  }
  await student.page.screenshot({ path: join(out, `${shot}.png`) });
  await student.context.close();
  return { email, title, lines, replies };
}

async function removeNoteOnThePage(browser: Browser, { email, topic }: { email: string; topic: string }) {
  const student = await openStudentPage(browser, { email, title: 'Removing a note', opensScreen: false });
  await student.page.goto('/');
  await student.page.getByRole('link', { name: 'Your notes' }).click();
  const notes = student.page.getByRole('region', { name: 'What your tutor remembers' });
  await notes.getByRole('button', { name: `Remove ${topic}` }).click();
  await notes.getByText(topic, { exact: true }).waitFor({ state: 'detached' });
  await student.context.close();
}

const stack = await startVoiceStack({ out, agentEnv: { ASTRA_VOICE: 'fake', ASTRA_TUTOR_MODEL: 'sonnet-5-5' } });
const browser = await launchProofBrowser();
const results: unknown[] = [];
try {
  await stack.stopAgent();
  await stack.startAgent({ ASTRA_VOICE: 'fake', ASTRA_TUTOR_MODEL: 'sonnet-5-5' });
  results.push(await runSession(browser, { email: FIRST_STUDENT, title: SAME_TOPIC, lines: [], shot: 'showed-it' }));
  results.push(await runSession(browser, { email: SECOND_STUDENT, title: SAME_TOPIC, lines: [], shot: 'found-it-hard' }));
  results.push(await runSession(browser, { email: SECOND_STUDENT, title: 'Why the sky is dark at night', lines: [CRISIS_LINE], shot: 'crisis' }));
  await removeNoteOnThePage(browser, { email: SECOND_STUDENT, topic: STRUGGLE_TOPIC });
  results.push(await runSession(browser, { email: SECOND_STUDENT, title: SAME_TOPIC, lines: [], shot: 'after-removing' }));
  console.log(JSON.stringify(results, null, 1));
  writeFileSync(join(out, 'result.json'), `${JSON.stringify(results, null, 1)}\n`);
} finally {
  await browser.close();
  await stack.stop();
}
process.exit(0);
