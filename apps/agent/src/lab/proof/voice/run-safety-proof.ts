/// <reference lib="dom" />
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { Room } from '@livekit/rtc-node';
import { readKey } from '../../../keys.ts';
import { deleteProofRooms, hasRoom, listParticipantIdentities } from './cloud-rooms.ts';
import { readTrace, type TraceRow } from './read-trace.ts';
import { startVoiceStack, type VoiceStack } from './stack.ts';
import { clipFromSay, launchProofBrowser, loadClip, openStudentPage, type SpeechClip, type StudentPage } from './student-page.ts';

const { values: args } = parseArgs({
  options: {
    only: { type: 'string', default: 'mic' },
    out: { type: 'string', default: '/tmp/m3-6-safety' },
    capture: { type: 'string' },
    quietLimitMs: { type: 'string', default: '40000' },
  },
});

const delay = (ms: number) => new Promise((done) => setTimeout(done, ms));
const MAYA = 'maya@astra.test';
const clipsFolder = join(args.out as string, 'clips');

const say = (id: string, text: string) => clipFromSay('Samantha', { id, text }, clipsFolder);

const LINES = [
  { id: 'wait-why', text: 'Wait, then why does it come down?' },
  { id: 'factor', text: 'Do I factor the quadratic first?' },
  { id: 'slope', text: 'Can you go back to the slope?' },
  { id: 'numerator', text: 'Is the numerator bigger than the denominator?' },
  { id: 'twice', text: 'It lands twice as far.' },
  { id: 'ball', text: 'Show me the ball.' },
];

const getWords = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, ' ').split(/\s+/).filter(Boolean);

function getLostWords(said: string, heard: string | null): string[] {
  const heardWords = new Set(getWords(heard ?? ''));
  return getWords(said).filter((word) => !heardWords.has(word));
}

const getRoomName = (student: StudentPage) => `session-${student.sessionId}`;

function rowsSince(stack: VoiceStack, student: StudentPage, afterMs: number): TraceRow[] {
  return readTrace(stack.traceFolder, getRoomName(student)).filter((row) => row.atMs >= afterMs);
}

async function waitForRows(stack: VoiceStack, student: StudentPage, afterMs: number, isDone: (rows: TraceRow[]) => boolean, limitMs = 20_000): Promise<TraceRow[]> {
  const deadline = Date.now() + limitMs;
  for (;;) {
    const rows = rowsSince(stack, student, afterMs);
    if (isDone(rows) || Date.now() > deadline) return rows;
    await delay(50);
  }
}

const hasReplyFinished = (rows: TraceRow[]) => rows.some((row) => row.name === 'turnFinished' && row.kind === 'reply');

async function typeReply(student: StudentPage, text: string): Promise<void> {
  const box = student.page.getByRole('textbox', { name: 'Your reply' });
  await box.fill(text);
  await box.press('Enter');
}

const getView = (student: StudentPage) => student.page.evaluate(() => window.astraVoice?.getView() as unknown as { phase: string; mic: string; isQuietWarning: boolean });
const getNotes = (student: StudentPage) => student.page.evaluate(() => [...document.querySelectorAll('[role="status"]')].map((element) => element.textContent).join(' | '));

async function waitForPhase(student: StudentPage, phase: string, limitMs: number): Promise<number | null> {
  const startedAtMs = Date.now();
  while (Date.now() - startedAtMs < limitMs) {
    if ((await getView(student))?.phase === phase) return Date.now() - startedAtMs;
    await delay(100);
  }
  return null;
}

async function typeAndWaitForAnswer(stack: VoiceStack, student: StudentPage, text: string): Promise<void> {
  const startedAtMs = Date.now();
  await typeReply(student, text);
  await waitForRows(stack, student, startedAtMs, hasReplyFinished, 30_000);
}

async function speakAndRead(stack: VoiceStack, student: StudentPage, clip: SpeechClip, startedAtMs: number) {
  const said = await student.say(clip);
  const rows = await waitForRows(stack, student, startedAtMs, (found) => found.some((row) => row.name === 'words' && row.isFinal) && hasReplyFinished(found), 12_000);
  const final = rows.find((row) => row.name === 'words' && row.isFinal);
  return { said: clip.text, heard: final?.text ?? null, lostWords: getLostWords(clip.text, final?.text ?? null), finalAfterLastSoundMs: final ? Math.round(final.atMs - said.lastSoundEpochMs) : null, rows };
}

type Scenario = (stack: VoiceStack) => Promise<unknown>;

// Real Chromium with its real getUserMedia, reading a fake capture file, so the tracks and sender bytes are the browser's own.
async function withRealCapture<Result>(run: (open: (title: string) => Promise<StudentPage>) => Promise<Result>): Promise<Result> {
  if (!args.capture) throw new Error('this scenario needs --capture with a wav file');
  const browser = await launchProofBrowser({ captureFile: args.capture });
  try {
    return await run((title) => openStudentPage(browser, { email: MAYA, title, usesRealCapture: true }));
  } finally {
    await browser.close();
  }
}

const SCENARIOS: Record<string, Scenario> = {
  // Double press, then every press pattern around starting, then one off press with the student still talking. Off must mean no live track and no bytes moving.
  mic: (stack) =>
    withRealCapture(async (open) => {
      const results: Record<string, unknown> = {};

      const doublePress = await open('Double press');
      await doublePress.pressTalk();
      await delay(200);
      await doublePress.pressTalk();
      await doublePress.waitForLive();
      await delay(6000);
      results.doublePress = { view: (await getView(doublePress)).mic, pressed: await doublePress.page.getByRole('button', { name: 'Talk' }).getAttribute('aria-pressed'), evidence: await doublePress.getMicEvidence() };
      await doublePress.context.close();

      const student = await open('One off press');
      await student.pressTalk();
      await delay(200);
      await student.pressTalk();
      await delay(200);
      await student.pressTalk();
      await student.waitForLive();
      await student.page.getByText('Your microphone is on.').waitFor({ timeout: 20_000 });
      await waitForRows(stack, student, 0, (rows) => rows.some((row) => row.name === 'muse:hearing'), 20_000);
      await delay(4000);
      const whileOn = await student.getMicEvidence();
      await delay(3000);
      const whileOnLater = await student.getMicEvidence();
      await student.pressTalk();
      const offAtMs = Date.now();
      await delay(1000);
      const afterOff = await student.getMicEvidence();
      await delay(3000);
      const afterOffLater = await student.getMicEvidence();
      await delay(6000);
      results.threePressesThenOff = {
        micAfterOff: (await getView(student)).mic,
        pressed: await student.page.getByRole('button', { name: 'Talk' }).getAttribute('aria-pressed'),
        whileOn,
        bytesMovedWhileOn: whileOnLater.senders.reduce((sum, sender) => sum + sender.bytes, 0) - whileOn.senders.reduce((sum, sender) => sum + sender.bytes, 0),
        afterOff,
        bytesMovedAfterOff: afterOffLater.senders.reduce((sum, sender) => sum + sender.bytes, 0) - afterOff.senders.reduce((sum, sender) => sum + sender.bytes, 0),
        agentHeardAfterOff: rowsSince(stack, student, offAtMs + 2500).filter((row) => row.name === 'words' || row.name === 'turnDecided' || row.name === 'voiceStarted').map((row) => row.name),
        museClosedAfterOffMs: (() => {
          const closed = rowsSince(stack, student, offAtMs).find((row) => row.name === 'muse:closed');
          return closed ? Math.round(closed.atMs - offAtMs) : null;
        })(),
      };
      await student.context.close();

      const pressDuringStart = await open('Press during starting');
      await typeAndWaitForAnswer(stack, pressDuringStart, 'hello there');
      const rows = [];
      for (const gapMs of [0, 20, 60, 200]) {
        await pressDuringStart.pressTalk();
        await delay(gapMs);
        await pressDuringStart.pressTalk();
        await delay(1500);
        const evidence = await pressDuringStart.getMicEvidence();
        rows.push({ gapMs, mic: (await getView(pressDuringStart)).mic, liveTracks: evidence.tracks.filter((state) => state === 'live').length, liveSenders: evidence.senders.filter((sender) => sender.state === 'live').length });
      }
      results.pressDuringStarting = rows;
      await pressDuringStart.context.close();
      return results;
    }),

  // A publish the room refuses must leave nothing captured, and must not call it a refusal by the browser.
  publishFails: (stack) =>
    withRealCapture(async (open) => {
      const student = await open('Publish fails');
      await typeAndWaitForAnswer(stack, student, 'hello there');
      await student.page.evaluate(() => {
        RTCPeerConnection.prototype.addTransceiver = () => {
          throw new Error('this proof refuses the track');
        };
      });
      await student.pressTalk();
      await student.page.waitForFunction(() => window.astraVoice?.getView().mic === 'failed', undefined, { timeout: 30_000 });
      const evidence = await student.getMicEvidence();
      const result = { mic: (await getView(student)).mic, tracks: evidence.tracks, senders: evidence.senders, notes: await getNotes(student) };
      await student.context.close();
      return result;
    }),

  // A page leaving, both ways a page can go. Read at once, with no chance for anything to wait.
  leaving: () =>
    withRealCapture(async (open) => {
      const student = await open('Leaving');
      await student.pressTalk();
      await student.waitForLive();
      await student.page.getByText('Your microphone is on.').waitFor({ timeout: 20_000 });
      const before = await student.getMicEvidence();
      const onPageHide = await student.page.evaluate(() => {
        window.dispatchEvent(new PageTransitionEvent('pagehide'));
        return (window as unknown as { capturedTracks: MediaStreamTrack[] }).capturedTracks.map((track) => track.readyState);
      });
      await student.context.close();

      const inApp = await open('Leaving inside the app');
      await inApp.pressTalk();
      await inApp.waitForLive();
      await inApp.page.getByText('Your microphone is on.').waitFor({ timeout: 20_000 });
      await inApp.page.evaluate(() => {
        history.pushState({}, '', '/sessions');
        dispatchEvent(new PopStateEvent('popstate'));
      });
      await delay(1500);
      const afterRoute = await inApp.getMicEvidence();
      await inApp.context.close();
      return { before: before.tracks, onPageHide, afterRoute };
    }),

  async noDevice() {
    const browser = await launchProofBrowser();
    const student = await openStudentPage(browser, { email: MAYA, title: 'No device' });
    await student.page.evaluate(() => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('no microphone', 'NotFoundError'));
    });
    await student.pressTalk();
    await student.waitForLive();
    await delay(1000);
    const noDevice = { view: (await getView(student)).mic, notes: await getNotes(student) };
    await student.page.evaluate(() => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('refused', 'NotAllowedError'));
    });
    await student.pressTalk();
    await delay(500);
    const denied = { view: (await getView(student)).mic, notes: await getNotes(student) };
    await student.context.close();
    await browser.close();
    return { noDevice, denied };
  },

  // Blocker 4's first case: type, wait for the answer, press Talk, and speak 300 ms later, into a Muse that has never opened.
  async typedThenTalk(stack) {
    const browser = await launchProofBrowser();
    const rows = [];
    for (const line of LINES) {
      const student = await openStudentPage(browser, { email: MAYA, title: `Typed first ${line.id}` });
      await typeAndWaitForAnswer(stack, student, 'hello there');
      await delay(800);
      const pressedAtMs = Date.now();
      await student.pressTalk();
      await delay(300);
      const { rows: found, ...heard } = await speakAndRead(stack, student, say(line.id, line.text), pressedAtMs);
      const ready = found.find((row) => row.name === 'muse:ready');
      const trace = await student.getTrace();
      const earsOpen = (await student.page.evaluate(() => (window.astraVoice?.records as { earsOpenEpochMs?: number[] }).earsOpenEpochMs ?? []))[0];
      rows.push({ ...heard, museHandshakeMs: ready?.handshakeMs ?? null, earsOpenAfterPressMs: earsOpen ? Math.round(earsOpen - pressedAtMs) : null, refused: trace.refused.length });
      await student.context.close();
    }
    await browser.close();
    return { rows, linesWithALostWord: rows.filter((row) => row.lostWords.length > 0).length };
  },

  // Blocker 4's second case: off and on with Muse still open, and off long enough for Muse to close, speaking at once each time.
  async offOn(stack) {
    const browser = await launchProofBrowser();
    const student = await openStudentPage(browser, { email: MAYA, title: 'Off and on' });
    await student.pressTalk();
    await student.waitForLive();
    await waitForRows(stack, student, 0, (rows) => rows.some((row) => row.name === 'turnFinished'), 30_000);
    await delay(1000);
    const measure = async (offMs: number, lines: typeof LINES) => {
      const rows = [];
      for (const line of lines) {
        await student.pressTalk();
        const offAtMs = Date.now();
        await delay(offMs);
        const pressedAtMs = Date.now();
        await student.pressTalk();
        const { rows: found, ...heard } = await speakAndRead(stack, student, say(line.id, line.text), pressedAtMs);
        rows.push({ ...heard, museClosedWhileOff: rowsSince(stack, student, offAtMs).some((row) => row.name === 'muse:closed' && row.atMs < pressedAtMs), museOpenedAgain: found.some((row) => row.name === 'muse:opened') });
        await delay(1000);
      }
      return { rows, linesWithALostWord: rows.filter((row) => row.lostWords.length > 0).length };
    };
    const results = { offFor3sMuseStillOpen: await measure(3000, LINES.slice(0, 3)), offFor14sMuseClosed: await measure(14_000, LINES.slice(3)) };
    await student.context.close();
    await browser.close();
    return results;
  },

  // Blocker 3: a pause mid-thought, on the clip that jumps in. The second reply must carry both halves.
  async pause(stack) {
    const browser = await launchProofBrowser();
    const student = await openStudentPage(browser, { email: MAYA, title: 'Pause' });
    await student.pressTalk();
    await student.waitForLive();
    await waitForRows(stack, student, 0, (rows) => rows.some((row) => row.name === 'turnFinished'), 30_000);
    await delay(1000);
    const rows = [];
    for (let round = 0; round < 3; round += 1) {
      const startedAtMs = Date.now();
      await typeAndWaitForAnswer(stack, student, 'show me the ball');
      await delay(600);
      const askedAtMs = Date.now();
      const first = loadClip('say-samantha', 'pause-first');
      const second = loadClip('say-samantha', 'pause-second');
      await student.say(first);
      await delay(1500);
      await student.say(second);
      await delay(5000);
      const replies = rowsSince(stack, student, askedAtMs).filter((row) => row.name === 'replyDecided');
      rows.push({ startedAfterMs: askedAtMs - startedAtMs, replies: replies.map((row) => row.text), jumpedIn: replies.length > 1, lastCarriesBoth: getLostWords(`${first.text} ${second.text}`, String(replies.at(-1)?.text ?? '')).length === 0 });
      await delay(1500);
    }
    await student.context.close();
    await browser.close();
    return { rows };
  },

  // A session ended from elsewhere, with the page still open: the room closes, the page says so, and the old token starts nothing.
  async finished(stack) {
    const browser = await launchProofBrowser();
    const student = await openStudentPage(browser, { email: MAYA, title: 'Finished elsewhere' });
    await typeAndWaitForAnswer(stack, student, 'hello there');
    const room = getRoomName(student);
    const authToken = await student.page.evaluate(() => {
      for (let index = 0; index < localStorage.length; index += 1) {
        const value = localStorage.getItem(localStorage.key(index) as string) ?? '';
        if (value.includes('access_token')) return (JSON.parse(value) as { access_token: string }).access_token;
      }
      return '';
    });
    const headers = { authorization: `Bearer ${authToken}` };
    const url = `/api/sessions/${student.sessionId}`;
    const oldAccess = (await (await student.page.request.post(`${url}/live-room`, { headers })).json()) as { token: string };
    const jobsBefore = readTrace(stack.traceFolder, room).filter((row) => row.name === 'jobStarted').length;
    const finishedAtMs = Date.now();
    const finish = await student.page.request.patch(url, { headers, data: { durationSeconds: 5, status: 'finished' } });
    const pageEndedAfterMs = await waitForPhase(student, 'ended', 15_000);
    let roomGoneAfterMs: number | null = null;
    while (Date.now() - finishedAtMs < 20_000) {
      if (!(await hasRoom(room))) {
        roomGoneAfterMs = Date.now() - finishedAtMs;
        break;
      }
      await delay(300);
    }
    const jobClosed = await waitForRows(stack, student, finishedAtMs, (rows) => rows.some((row) => row.name === 'jobClosed'), 20_000);
    const newToken = (await student.page.request.post(`${url}/live-room`, { headers })).status();

    const usedOldToken = new Room();
    let oldTokenJoined = false;
    await usedOldToken.connect(readKey('LIVEKIT_URL'), oldAccess.token).then(() => (oldTokenJoined = true), () => {});
    await delay(10_000);
    const participantsWithOldToken = oldTokenJoined ? await listParticipantIdentities(room).catch(() => []) : [];
    const jobsAfter = readTrace(stack.traceFolder, room).filter((row) => row.name === 'jobStarted').length;
    await usedOldToken.disconnect();
    await deleteProofRooms([room]);
    const notes = await getNotes(student);
    await student.context.close();
    await browser.close();
    return { finishStatus: finish.status(), jobsBefore, pageEndedAfterMs, roomGoneAfterMs, jobClosedAfterMs: Math.round((jobClosed.find((row) => row.name === 'jobClosed')?.atMs ?? finishedAtMs) - finishedAtMs), newTokenStatus: newToken, oldTokenJoined, participantsWithOldToken, jobsAfter, notes };
  },

  // A job killed mid-session: a clear message and few tokens, then Try again brings a new tutor to the same screen.
  async crash(stack) {
    const browser = await launchProofBrowser();
    const student = await openStudentPage(browser, { email: MAYA, title: 'Crash' });
    const asks: number[] = [];
    student.page.on('request', (request) => {
      if (request.url().includes('/live-room')) asks.push(Date.now());
    });
    await student.pressTalk();
    await student.waitForLive();
    await waitForRows(stack, student, 0, (rows) => rows.some((row) => row.name === 'turnFinished'), 30_000);
    const room = getRoomName(student);
    const jobPid = readTrace(stack.traceFolder, room).find((row) => row.name === 'jobStarted')?.pid as number;
    const killedAtMs = Date.now();
    process.kill(jobPid, 'SIGKILL');
    const timeline: string[] = [];
    let lostAfterMs: number | null = null;
    while (Date.now() - killedAtMs < 45_000) {
      const { phase } = await getView(student);
      if (phase !== timeline.at(-1)?.split(' ')[1]) timeline.push(`${Date.now() - killedAtMs} ${phase}`);
      if (phase === 'tutorLost') {
        lostAfterMs = Date.now() - killedAtMs;
        break;
      }
      await delay(100);
    }
    const asksBeforeGivingUp = asks.filter((atMs) => atMs >= killedAtMs).length;
    const evidence = await student.getMicEvidence();
    const notes = await getNotes(student);
    await delay(8000);
    const asksAfterWaiting = asks.filter((atMs) => atMs >= killedAtMs).length;
    const pressedAtMs = Date.now();
    await student.page.getByRole('button', { name: 'Try again' }).click();
    const rowsAfter = await waitForRows(stack, student, pressedAtMs, (rows) => rows.some((row) => row.name === 'jobStarted'), 30_000);
    await student.waitForLive();
    const backAfterMs = Date.now() - pressedAtMs;
    await delay(1000);
    await typeAndWaitForAnswer(stack, student, 'are you back');
    const heard = (await student.getTrace()).view.tutorHeard;
    await student.context.close();
    await browser.close();
    return { timeline, lostAfterMs, asksBeforeGivingUp, asksAfterWaiting, micAfterLoss: evidence.tracks, notes, newJobs: rowsAfter.filter((row) => row.name === 'jobStarted').length, backAfterMs, heard };
  },

  // A short limit stands in for ten minutes. The warning shows, the button holds the room open, and the room closes with a way back.
  async quiet(stack) {
    await stack.stopAgent();
    await stack.startAgent({ ASTRA_QUIET_LIMIT_MS: args.quietLimitMs as string });
    const browser = await launchProofBrowser();
    const student = await openStudentPage(browser, { email: MAYA, title: 'Quiet' });
    await typeAndWaitForAnswer(stack, student, 'hello there');
    const limitMs = Number(args.quietLimitMs);
    const room = getRoomName(student);
    const waitForWarning = async () => {
      const startedAtMs = Date.now();
      while (Date.now() - startedAtMs < limitMs) {
        if ((await getView(student)).isQuietWarning) return Date.now() - startedAtMs;
        await delay(100);
      }
      return null;
    };
    const firstWarningAfterMs = await waitForWarning();
    const noteWithWarning = await getNotes(student);
    await student.page.getByRole('button', { name: 'Keep the room open' }).click();
    await delay(500);
    const warningAfterAnswer = (await getView(student)).isQuietWarning;
    const secondWarningAfterMs = await waitForWarning();
    const closedAfterMs = await waitForPhase(student, 'closedForQuiet', limitMs);
    const noteWhenClosed = await getNotes(student);
    await delay(2000);
    const roomGone = !(await hasRoom(room));
    const typedInClosedRoom = { boxIsReadOnly: (await student.page.getByRole('textbox', { name: 'Your reply' }).getAttribute('readonly')) !== null, notes: await getNotes(student) };
    const pressedAtMs = Date.now();
    await student.page.getByRole('button', { name: 'Open the room again' }).click();
    await waitForRows(stack, student, pressedAtMs, (rows) => rows.some((row) => row.name === 'jobStarted'), 30_000);
    await student.waitForLive();
    const backAfterMs = Date.now() - pressedAtMs;
    await delay(1000);
    await typeAndWaitForAnswer(stack, student, 'i am back');
    const heard = (await student.getTrace()).view.tutorHeard;
    await student.context.close();
    await browser.close();
    await stack.stopAgent();
    await stack.startAgent();
    return { limitMs, firstWarningAfterMs, noteWithWarning, warningAfterAnswer, secondWarningAfterMs, closedAfterMs, noteWhenClosed, roomGone, typedInClosedRoom, backAfterMs, heard };
  },
};

const out = args.out as string;
mkdirSync(out, { recursive: true });
const stack = await startVoiceStack({ out, agentEnv: { ASTRA_VOICE: 'fake' } });
const results: Record<string, unknown> = {};
try {
  for (const name of (args.only as string).split(',')) {
    const scenario = SCENARIOS[name];
    if (!scenario) throw new Error(`no scenario ${name}`);
    results[name] = await scenario(stack);
    console.log(name, JSON.stringify(results[name], null, 1));
  }
} finally {
  writeFileSync(join(out, `result-${args.only as string}.json`), `${JSON.stringify(results, null, 1)}\n`);
  await stack.stop();
}
process.exit(0);
