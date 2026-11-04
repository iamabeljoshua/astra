import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { startVoiceStack, WEB_URL } from './stack.ts';
import { launchProofBrowser, openStudentPage } from './student-page.ts';

const { values: args } = parseArgs({ options: { out: { type: 'string', default: '/tmp/return-at-edge' }, offsets: { type: 'string', default: '13,14,15,16' }, tries: { type: 'string', default: '3' }, emails: { type: 'string', default: 'maya@astra.test' } } });

const delay = (ms: number) => new Promise((done) => setTimeout(done, ms));
const WATCH_AFTER_RETURN_MS = 30_000;

interface PageView {
  phase: string;
  hasTutorStarted: boolean;
  startedFresh: boolean;
  studentLines: { text: string }[];
}

const readView = (page: Awaited<ReturnType<typeof openStudentPage>>['page']) => page.evaluate(() => (window.astraVoice?.getView() ?? null) as PageView | null);

const countJobs = (traceFolder: string, sessionId: string) => readdirSync(traceFolder).filter((name) => name.startsWith(`session-${sessionId}`)).length;

function getRoomsAndTurns(traceFolder: string, sessionId: string) {
  return readdirSync(traceFolder)
    .filter((name) => name.startsWith(`session-${sessionId}`))
    .map((name) => {
      const rows = readFileSync(join(traceFolder, name), 'utf8').trim().split('\n').map((line) => JSON.parse(line) as { name: string });
      const count = (wanted: string) => rows.filter((row) => row.name === wanted).length;
      return { room: name.slice(-14, -6), joins: count('studentJoined'), left: count('studentLeft'), replies: count('replyDecided'), closed: count('jobClosing') };
    });
}

// Opens a session, leaves for Home, comes back at the edge of the 15 s the job waits, and reads whether a tutor answers.
async function tryOffset(stack: Awaited<ReturnType<typeof startVoiceStack>>, browser: Awaited<ReturnType<typeof launchProofBrowser>>, email: string, offsetSeconds: number, tryNumber: number) {
  const student = await openStudentPage(browser, { email, title: `Edge ${offsetSeconds} try ${tryNumber}` });
  await student.page.waitForFunction(() => window.astraVoice?.getView().hasTutorStarted === true, undefined, { timeout: 40_000 });
  await student.page.goto(`${WEB_URL}/`);
  const leftAtMs = Date.now();
  await delay(offsetSeconds * 1000 - (Date.now() - leftAtMs));
  const returnedAtMs = Date.now();
  await student.page.goto(student.sessionUrl);
  let firstTurnMs: number | null = null;
  const timeline: string[] = [];
  let last = '';
  for (;;) {
    const view = await readView(student.page).catch(() => null);
    const stamp = `${view?.phase}/${view?.hasTutorStarted}`;
    const elapsedMs = Date.now() - returnedAtMs;
    if (stamp !== last) timeline.push(`${elapsedMs} ${stamp}`);
    last = stamp;
    if (view?.hasTutorStarted) {
      firstTurnMs = elapsedMs;
      break;
    }
    if (view && (view.phase === 'noTutor' || view.phase === 'ended' || view.phase === 'tutorLost')) break;
    if (elapsedMs > WATCH_AFTER_RETURN_MS) break;
    await delay(100);
  }
  await delay(1500);
  const final = await readView(student.page).catch(() => null);
  const note = await student.page.getByRole('status').allInnerTexts().catch(() => []);
  const rooms = getRoomsAndTurns(stack.traceFolder, student.sessionId);
  const result = { offsetSeconds, tryNumber, firstTurnMs, phase: final?.phase, hasTutorStarted: final?.hasTutorStarted, startedFresh: final?.startedFresh, youLines: final?.studentLines, timeline, jobs: countJobs(stack.traceFolder, student.sessionId), rooms, note: note.join(' | ').slice(0, 200) };
  await student.context.close();
  return result;
}

const out = args.out as string;
mkdirSync(out, { recursive: true });
const stack = await startVoiceStack({ out, agentEnv: { ASTRA_VOICE: 'fake' } });
const browser = await launchProofBrowser();
const results: unknown[] = [];
const offsets = (args.offsets as string).split(',').map(Number);
const emails = (args.emails as string).split(',');
let attempt = 0;
try {
  for (let tryNumber = 1; tryNumber <= Number(args.tries); tryNumber += 1) {
    for (const offset of offsets) {
      const email = emails[attempt % emails.length] as string;
      attempt += 1;
      const result = await tryOffset(stack, browser, email, offset, tryNumber);
      results.push(result);
      console.log(JSON.stringify(result));
      writeFileSync(join(out, 'result.json'), `${JSON.stringify(results, null, 1)}\n`);
    }
  }
} finally {
  await browser.close();
  await stack.stop();
}
process.exit(0);
