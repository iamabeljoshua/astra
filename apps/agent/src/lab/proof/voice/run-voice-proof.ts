/// <reference lib="dom" />
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { Browser } from 'playwright';
import { readTrace, summarise, type TraceRow } from './read-trace.ts';
import { countRoomEgresses, listParticipantIdentities, listRoomNames } from './cloud-rooms.ts';
import { startCutProxy } from './cut-proxy.ts';
import { saveRecording } from './join-recording.ts';
import { LONG_LINES } from './make-speech.ts';
import { startVoiceStack, type VoiceStack } from './stack.ts';
import { clipFromSay, launchProofBrowser, loadClip, openStudentPage, type SpeechClip, type StudentPage } from './student-page.ts';
import { TURN_TIMINGS } from '../../../live/turn-rule.ts';

const { values: args } = parseArgs({
  options: {
    only: { type: 'string', default: 'turns' },
    out: { type: 'string', default: '/tmp/m3-6-proof' },
    fake: { type: 'boolean', default: false },
    turns: { type: 'string', default: '30' },
  },
});

const delay = (ms: number) => new Promise((done) => setTimeout(done, ms));
const MAYA = 'maya@astra.test';
const VOICE = 'say-samantha';

interface RunContext {
  stack: VoiceStack;
  browser: Browser;
  out: string;
}

const getRoomName = (student: StudentPage) => `session-${student.sessionId}`;

function nextTrace(stack: VoiceStack, student: StudentPage, afterMs: number): TraceRow[] {
  return readTrace(stack.traceFolder, getRoomName(student)).filter((row) => row.atMs >= afterMs);
}

async function waitForTrace(stack: VoiceStack, student: StudentPage, afterMs: number, isDone: (rows: TraceRow[]) => boolean, limitMs = 15_000): Promise<TraceRow[]> {
  const deadline = Date.now() + limitMs;
  for (;;) {
    const rows = nextTrace(stack, student, afterMs);
    if (isDone(rows) || Date.now() > deadline) return rows;
    await delay(50);
  }
}

interface TurnRow {
  line: string;
  transcript: string | null;
  voiceStartLagMs: number | null;
  voiceEndedMs: number | null;
  firstPartialFromFirstSoundMs: number | null;
  finalMs: number | null;
  decidedMs: number | null;
  reactDecidedMs: number | null;
  reactionCapturedMs: number | null;
  reactionHeardMs: number | null;
  dotHeardMs: number | null;
  replyDecidedMs: number | null;
  replyVia: string | null;
  firstAudioReadMs: number | null;
  replyCapturedMs: number | null;
  firstWordHeardMs: number | null;
  fromDecisionToReactionMs: number | null;
  voiceReadMs: number | null;
  tripMs: number | null;
}

// One student turn, in ms from the clip's last sound, read from the agent's and the browser's records on one Mac clock.
async function measureTurn({ stack, student, clipId, voice = VOICE, idleMs = 2000 }: { stack: VoiceStack; student: StudentPage; clipId: string; voice?: string; idleMs?: number }): Promise<TurnRow> {
  const clip = loadClip(voice, clipId);
  const before = await student.getTrace();
  const startedAtMs = Date.now();
  const said = await student.say(clip);
  const fromLast = (atMs: number | undefined) => (atMs === undefined ? null : Math.round(atMs - said.lastSoundEpochMs));
  const rows = await waitForTrace(stack, student, startedAtMs, (found) => found.some((row) => row.name === 'turnFinished' && (row.kind === 'reply' || row.kind === 'resume')), 12_000);
  await delay(idleMs);
  const after = await student.getTrace();
  const find = (name: string, kind?: string) => rows.find((row) => row.name === name && (kind === undefined || row.kind === kind));
  const newTurns = (Object.keys(after.turnStartedEpochMs) as string[]).filter((turnId) => !(turnId in before.turnStartedEpochMs));
  const turnKind = (turnId: string) => rows.find((row) => row.name === 'turnStarted' && row.turnId === turnId)?.kind;
  const reactionTurn = newTurns.find((turnId) => turnKind(turnId) === 'reaction');
  const replyTurn = newTurns.find((turnId) => turnKind(turnId) === 'reply');
  const reactionHeard = reactionTurn ? after.firstAudioEpochMs[reactionTurn] : undefined;
  const replyHeard = replyTurn ? after.firstAudioEpochMs[replyTurn] : undefined;
  const reactDecided = find('reactDecided')?.atMs;
  const replyRead = find('firstAudioRead', 'reply')?.atMs;
  const replyCaptured = find('firstFrameCaptured', 'reply')?.atMs;
  const replyDecided = find('replyDecided');
  const firstPartial = rows.find((row) => row.name === 'words');
  const final = rows.find((row) => row.name === 'words' && row.isFinal);
  const dot = after.heardEpochMs.find((atMs) => atMs >= startedAtMs);
  return {
    line: clip.text,
    transcript: (final?.text as string | undefined) ?? null,
    voiceStartLagMs: find('voiceStarted') ? Math.round((find('voiceStarted')?.atMs as number) - said.firstSoundEpochMs) : null,
    voiceEndedMs: fromLast(find('voiceEnded')?.atMs),
    firstPartialFromFirstSoundMs: firstPartial ? Math.round(firstPartial.atMs - said.firstSoundEpochMs) : null,
    finalMs: fromLast(final?.atMs),
    decidedMs: fromLast(find('turnDecided')?.atMs),
    reactDecidedMs: fromLast(reactDecided),
    reactionCapturedMs: fromLast(find('firstFrameCaptured', 'reaction')?.atMs),
    reactionHeardMs: fromLast(reactionHeard),
    dotHeardMs: fromLast(dot),
    replyDecidedMs: fromLast(replyDecided?.atMs),
    replyVia: (replyDecided?.via as string | undefined) ?? null,
    firstAudioReadMs: fromLast(replyRead),
    replyCapturedMs: fromLast(replyCaptured),
    firstWordHeardMs: fromLast(replyHeard),
    fromDecisionToReactionMs: reactDecided !== undefined && reactionHeard !== undefined ? Math.round(reactionHeard - reactDecided) : null,
    voiceReadMs: replyDecided && replyRead !== undefined ? Math.round(replyRead - replyDecided.atMs) : null,
    tripMs: replyCaptured !== undefined && replyHeard !== undefined ? Math.round(replyHeard - replyCaptured) : null,
  };
}

function summariseTurns(rows: readonly TurnRow[]) {
  const pick = (name: keyof TurnRow) => rows.flatMap((row) => (typeof row[name] === 'number' ? [row[name] as number] : []));
  const names: (keyof TurnRow)[] = ['voiceStartLagMs', 'voiceEndedMs', 'firstPartialFromFirstSoundMs', 'finalMs', 'decidedMs', 'reactDecidedMs', 'reactionCapturedMs', 'reactionHeardMs', 'dotHeardMs', 'replyDecidedMs', 'firstAudioReadMs', 'replyCapturedMs', 'firstWordHeardMs', 'fromDecisionToReactionMs', 'voiceReadMs', 'tripMs'];
  return Object.fromEntries(names.map((name) => [name, summarise(pick(name))]));
}

const TURN_LINES = ['twice', 'why-down', 'quadratic-roots', 'numerator', 'x-squared-over', 'denominator-x'];

async function startTalking(stack: VoiceStack, student: StudentPage): Promise<void> {
  await student.pressTalk();
  await student.waitForLive();
  await waitForTrace(stack, student, 0, (rows) => rows.some((row) => row.name === 'turnFinished'), 30_000);
  await delay(1000);
}

async function typeReply(student: StudentPage, text: string): Promise<void> {
  const box = student.page.getByRole('textbox', { name: 'Your reply' });
  await box.fill(text);
  await box.press('Enter');
}

interface StopRow {
  localYieldFromFirstSoundMs: number | null;
  reactionAfterStopMs: number | null;
  reactionCapturedAfterDecisionMs: number | null;
  reactionHeardAfterDecisionMs: number | null;
  yieldFromFirstSoundMs: number | null;
  stopDecidedFromFirstSoundMs: number | null;
  silenceFromFirstSoundMs: number | null;
  decisionToSilenceMs: number | null;
  reason: unknown;
  heardAtCut: number;
  firedAtStop: number;
  firedAfterStop: number;
  replyAfterStop: boolean;
  boardFrozen: boolean;
}

// The tutor is mid-sentence on a long line with the ball moving, and the student cuts in with real speech.
async function interruptOnce({ stack, student, clipId, waitMs = 1800 }: { stack: VoiceStack; student: StudentPage; clipId: string; waitMs?: number }): Promise<StopRow> {
  const startedAtMs = Date.now();
  await typeReply(student, 'show me the ball');
  await waitForTrace(stack, student, startedAtMs, (rows) => rows.some((row) => row.name === 'firstFrameCaptured' && row.kind === 'reply'));
  await delay(waitMs);
  const before = await student.getTrace();
  const said = await student.say(loadClip(VOICE, clipId));
  const rows = await waitForTrace(stack, student, said.firstSoundEpochMs - 50, (found) => found.some((row) => row.name === 'stopDecided'), 4000);
  const stopped = rows.find((row) => row.name === 'stopDecided');
  await delay(400);
  const atStop = await student.getTrace();
  const boardBefore = await student.page.evaluate(() => JSON.stringify(window.astraVoice?.player.getOperations().map((operation: { kind: string; atMs: number }) => [operation.kind, operation.atMs])));
  await delay(300);
  const boardAfter = await student.page.evaluate(() => JSON.stringify(window.astraVoice?.player.getOperations().map((operation: { kind: string; atMs: number }) => [operation.kind, operation.atMs])));
  const stopTurn = stopped?.turnId as string | undefined;
  const silenceAtMs = stopTurn ? atStop.stopEpochMs[stopTurn] : undefined;
  const firstYield = atStop.yieldEpochMs.find((entry) => entry.atMs >= said.firstSoundEpochMs - 50 && entry.isYielding);
  const finalRows = await waitForTrace(stack, student, said.firstSoundEpochMs - 50, (found) => found.some((row) => row.name === 'firstFrameCaptured' && row.kind === 'reply'), 8000);
  await delay(2500);
  const settled = await student.getTrace();
  const firedAfter = settled.fired.filter((cue) => cue.turnId === stopTurn && silenceAtMs !== undefined && cue.firedEpochMs > silenceAtMs).length;
  const localYield = settled.localYieldEpochMs.find((atMs) => atMs >= said.firstSoundEpochMs - 50);
  const reactDecided = finalRows.find((row) => row.name === 'reactDecided');
  const reactionCaptured = finalRows.find((row) => row.name === 'firstFrameCaptured' && row.kind === 'reaction');
  const reactionTurnId = finalRows.find((row) => row.name === 'turnStarted' && row.kind === 'reaction')?.turnId as string | undefined;
  const reactionHeard = reactionTurnId ? settled.firstAudioEpochMs[reactionTurnId] : undefined;
  return {
    localYieldFromFirstSoundMs: localYield === undefined ? null : Math.round(localYield - said.firstSoundEpochMs),
    reactionAfterStopMs: reactDecided && stopped ? Math.round(reactDecided.atMs - stopped.atMs) : null,
    reactionCapturedAfterDecisionMs: reactDecided && reactionCaptured ? Math.round(reactionCaptured.atMs - reactDecided.atMs) : null,
    reactionHeardAfterDecisionMs: reactDecided && reactionHeard !== undefined ? Math.round(reactionHeard - reactDecided.atMs) : null,
    yieldFromFirstSoundMs: firstYield ? Math.round(firstYield.atMs - said.firstSoundEpochMs) : null,
    stopDecidedFromFirstSoundMs: stopped ? Math.round(stopped.atMs - said.firstSoundEpochMs) : null,
    silenceFromFirstSoundMs: silenceAtMs !== undefined ? Math.round(silenceAtMs - said.firstSoundEpochMs) : null,
    decisionToSilenceMs: stopped && silenceAtMs !== undefined ? Math.round(silenceAtMs - stopped.atMs) : null,
    reason: stopped?.reason,
    heardAtCut: atStop.view.tutorHeard.length,
    firedAtStop: before.fired.length,
    firedAfterStop: firedAfter,
    replyAfterStop: finalRows.some((row) => row.name === 'firstFrameCaptured' && row.kind === 'reply'),
    boardFrozen: boardBefore === boardAfter,
  };
}

const WAIT_FOR_QUESTION_MS = 20_000;

const SCENARIOS: Record<string, (context: RunContext) => Promise<unknown>> = {
  // Decision 4 on real transcripts: how long the turn decision takes, how often the detector doubts a long answer, and whether a pause after a question gets cut.
  async patience({ stack, browser, out }) {
    const student = await openStudentPage(browser, { email: MAYA, title: 'Patience' });
    await startTalking(stack, student);
    const clipsFolder = join(out, 'clips');
    const decide = async (clip: SpeechClip) => {
      const startedAtMs = Date.now();
      const said = await student.say(clip);
      const rows = await waitForTrace(stack, student, startedAtMs, (found) => found.some((row) => row.name === 'turnFinished' && row.kind === 'reply'), 15_000);
      await delay(800);
      const voiceEnded = rows.filter((row) => row.name === 'voiceEnded').at(-1);
      const decided = rows.find((row) => row.name === 'turnDecided');
      const final = rows.find((row) => row.name === 'words' && row.isFinal);
      return { id: clip.id, decidedAfterVoiceEndedMs: voiceEnded && decided ? Math.round(decided.atMs - voiceEnded.atMs) : null, finalAfterLastSoundMs: final ? Math.round(final.atMs - said.lastSoundEpochMs) : null, decidedAfterLastSoundMs: decided ? Math.round(decided.atMs - said.lastSoundEpochMs) : null };
    };
    const long = [];
    for (let round = 0; round < 5; round += 1) for (const line of LONG_LINES) long.push(await decide(clipFromSay('Samantha', line, clipsFolder)));
    const short = [];
    for (let round = 0; round < 12; round += 1) short.push(await decide(loadClip(VOICE, TURN_LINES[round % TURN_LINES.length] as string)));
    const fillers = [];
    for (let round = 0; round < 3; round += 1) {
      const startedAtMs = Date.now();
      const said = await student.say(loadClip(VOICE, 'reaction-hmm-think'));
      const rows = await waitForTrace(stack, student, startedAtMs, (found) => found.some((row) => row.name === 'turnStarted' && row.kind === 'prompt'), 12_000);
      const prompt = rows.find((row) => row.name === 'turnStarted' && row.kind === 'prompt');
      fillers.push({ heard: rows.filter((row) => row.name === 'words').at(-1)?.text, replied: rows.some((row) => row.name === 'replyDecided'), promptAfterMs: prompt ? Math.round(prompt.atMs - said.lastSoundEpochMs) : null });
      await delay(1500);
    }
    const pauses = [];
    for (let round = 0; round < 3; round += 1) {
      const startedAtMs = Date.now();
      await typeReply(student, 'show me the ball');
      await waitForTrace(stack, student, startedAtMs, (found) => found.some((row) => row.name === 'turnFinished' && row.kind === 'reply'), WAIT_FOR_QUESTION_MS);
      await delay(600);
      const askedAtMs = Date.now();
      await student.say(loadClip(VOICE, 'pause-first'));
      await delay(1500);
      await student.say(loadClip(VOICE, 'pause-second'));
      const rows = await waitForTrace(stack, student, askedAtMs, (found) => found.some((row) => row.name === 'replyDecided' && String(row.text).length > 0) && found.some((row) => row.name === 'turnFinished' && row.kind === 'reply'), 15_000);
      pauses.push({ replies: rows.filter((row) => row.name === 'replyDecided').map((row) => row.text) });
      await delay(1000);
    }
    await student.context.close();
    const gaps = (rows: { decidedAfterVoiceEndedMs: number | null }[]) => rows.flatMap((row) => (row.decidedAfterVoiceEndedMs === null ? [] : [row.decidedAfterVoiceEndedMs]));
    const isAtCap = (ms: number) => ms >= TURN_TIMINGS.turnCapMs - 80;
    return { long: { decided: summarise(gaps(long)), atTheCap: gaps(long).filter(isAtCap).length, of: gaps(long).length, fromLastSound: summarise(long.flatMap((row) => (row.decidedAfterLastSoundMs === null ? [] : [row.decidedAfterLastSoundMs]))) }, short: { decided: summarise(gaps(short)), atTheCap: gaps(short).filter(isAtCap).length, of: gaps(short).length, fromLastSound: summarise(short.flatMap((row) => (row.decidedAfterLastSoundMs === null ? [] : [row.decidedAfterLastSoundMs]))) }, fillers, pauses };
  },

  // From pressing Talk to the tutor's first sound, the first word of a session.
  async join({ stack, browser }) {
    const rows: { connectedMs: number; jobStartedMs: number; trackUpMs: number; greetingHeardMs: number | null; museHandshakeMs: unknown; roundTripMs: number | null }[] = [];
    for (let run = 0; run < Number(args.turns); run += 1) {
      const student = await openStudentPage(browser, { email: MAYA, title: 'Join' });
      const pressedAtMs = Date.now();
      await student.pressTalk();
      await student.waitForLive();
      const liveAtMs = Date.now();
      const trace = await waitForTrace(stack, student, 0, (found) => found.some((row) => row.name === 'turnFinished'), 30_000);
      const after = await student.getTrace();
      const firstAudio = after.firstAudioEpochMs['turn-1'];
      const ready = trace.find((row) => row.name === 'muse:ready');
      const rtt = await student.getRoundTripMs();
      rows.push({ connectedMs: liveAtMs - pressedAtMs, jobStartedMs: Math.round((trace.find((row) => row.name === 'jobStarted')?.atMs ?? 0) - pressedAtMs), trackUpMs: Math.round((trace.find((row) => row.name === 'voiceTrackUp')?.atMs ?? 0) - pressedAtMs), greetingHeardMs: firstAudio === undefined ? null : Math.round(firstAudio - pressedAtMs), museHandshakeMs: ready?.handshakeMs ?? null, roundTripMs: rtt === null ? null : Math.round(rtt) });
      await student.context.close();
      await delay(3000);
    }
    const pick = (name: 'connectedMs' | 'jobStartedMs' | 'trackUpMs' | 'greetingHeardMs' | 'museHandshakeMs' | 'roundTripMs') => rows.flatMap((row) => (typeof row[name] === 'number' ? [row[name] as number] : []));
    return { rows, connected: summarise(pick('connectedMs')), greetingHeard: summarise(pick('greetingHeardMs')), museHandshake: summarise(pick('museHandshakeMs')), roundTrip: summarise(pick('roundTripMs')) };
  },

  // One take a person can watch: a talk, a mid-sentence cut, a reaction over the tutor, and a typed line.
  async film({ stack, browser, out }) {
    const student = await openStudentPage(browser, { email: MAYA, title: 'Why does a ball come down?', recordVideoDir: join(out, 'video') });
    await student.pressTalk();
    await student.waitForLive();
    await student.page.waitForFunction(() => window.speechInPage.canRecord(), undefined, { timeout: 30_000 });
    await student.page.evaluate(() => window.speechInPage.startRecording());
    await waitForTrace(stack, student, 0, (rows) => rows.some((row) => row.name === 'turnFinished'), 30_000);
    await delay(800);
    await measureTurn({ stack, student, clipId: 'twice', idleMs: 800 });
    await student.page.screenshot({ path: join(out, 'm3-6-talk.png') });
    const startedAtMs = Date.now();
    await student.say(clipFromSay('Samantha', { id: 'show-ball', text: 'Show me the ball.' }, join(out, 'clips')));
    await waitForTrace(stack, student, startedAtMs, (rows) => rows.some((row) => row.name === 'firstFrameCaptured' && row.kind === 'reply'));
    await delay(2600);
    await student.say(loadClip(VOICE, 'why-down'));
    await delay(1000);
    await student.page.screenshot({ path: join(out, 'm3-6-stop.png') });
    await delay(3000);
    const typedAtMs = Date.now();
    await typeReply(student, 'show me the ball again');
    await waitForTrace(stack, student, typedAtMs, (rows) => rows.some((row) => row.name === 'firstFrameCaptured' && row.kind === 'reply'));
    await delay(2000);
    await student.say(loadClip(VOICE, 'reaction-uh-huh'));
    await waitForTrace(stack, student, typedAtMs, (rows) => rows.some((row) => row.name === 'turnFinished' && row.kind === 'reply'), 20_000);
    await delay(1500);
    await saveRecording({ page: student.page, videoStartedEpochMs: student.videoStartedEpochMs, outputPath: join(out, 'm3-6-talk.mp4') });
    await student.context.close();
    return { saved: 'm3-6-talk.mp4' };
  },

  // Walks the microphone test page as Abel would, with a clip for his voice, so the steps in `docs/tests/voice.md` are known to work.
  async micPage({ stack, browser }) {
    const student = await openStudentPage(browser, { email: MAYA, title: 'Before the test page' });
    await student.page.goto('/lab/voice-test');
    await student.page.getByRole('button', { name: 'Start with speech cleanup on' }).click();
    await student.page.getByRole('button', { name: 'Talk', exact: true }).click();
    await student.page.getByRole('button', { name: 'First line' }).waitFor({ timeout: 30_000 });
    await delay(5000);
    await student.page.getByRole('button', { name: 'First line' }).click();
    await student.say(loadClip(VOICE, 'twice'));
    await delay(6000);
    await student.page.getByRole('button', { name: 'Next line' }).click();
    await student.say(loadClip(VOICE, 'why-down'));
    await delay(6000);
    await student.context.close();
    return { traceFolder: stack.traceFolder };
  },

  // One take of a real drop and its return. The cut happens mid-sentence, with the ball in the air.
  async filmDrop({ stack, out }) {
    const proxy = await startCutProxy();
    const browser = await launchProofBrowser({ proxy: `127.0.0.1:${proxy.port}` });
    const student = await openStudentPage(browser, { email: MAYA, title: 'A dropped network', recordVideoDir: join(out, 'video') });
    await student.pressTalk();
    await student.waitForLive();
    await student.page.waitForFunction(() => window.speechInPage.canRecord(), undefined, { timeout: 30_000 });
    await student.page.evaluate(() => window.speechInPage.startRecording());
    await waitForTrace(stack, student, 0, (rows) => rows.some((row) => row.name === 'turnFinished'), 30_000);
    await delay(800);
    const startedAtMs = Date.now();
    await typeReply(student, 'show me the ball');
    await waitForTrace(stack, student, startedAtMs, (rows) => rows.some((row) => row.name === 'firstFrameCaptured' && row.kind === 'reply'));
    await delay(2400);
    const cutAtMs = Date.now();
    proxy.cut();
    await delay(3500);
    const during = await student.getTrace();
    await student.page.screenshot({ path: join(out, 'm3-6-drop.png') });
    proxy.restore();
    const rows = await waitForTrace(stack, student, cutAtMs, (found) => found.some((row) => row.name === 'turnFinished' && row.kind === 'resume'), 45_000);
    await delay(1500);
    const after = await student.getTrace();
    await student.page.screenshot({ path: join(out, 'm3-6-resumed.png') });
    await saveRecording({ page: student.page, videoStartedEpochMs: student.videoStartedEpochMs, outputPath: join(out, 'm3-6-drop.mp4') });
    await student.context.close();
    await browser.close();
    proxy.close();
    return { heardAtDrop: during.view.tutorHeard.join(' '), heardAfterResume: after.view.tutorHeard.join(' '), resumed: rows.some((row) => row.name === 'resumeStarted') };
  },

  // The screen at laptop and phone widths, in both themes, mid-sentence with the ball moving and captions on.
  async shots({ stack, browser, out }) {
    for (const [name, viewport] of [['laptop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]] as const) {
      for (const theme of ['light', 'dark'] as const) {
        const student = await openStudentPage(browser, { email: MAYA, title: 'Why does a ball come down?', viewport });
        await student.page.getByRole('button', { name: theme === 'dark' ? 'Dark' : 'Light', exact: true }).click();
        await delay(700);
        await student.page.screenshot({ path: join(out, `m3-6-session-idle-${name}-${theme}.png`) });
        const startedAtMs = Date.now();
        await typeReply(student, 'show me the ball');
        await student.waitForLive();
        await waitForTrace(stack, student, startedAtMs, (rows) => rows.some((row) => row.name === 'firstFrameCaptured' && row.kind === 'reply'), 30_000);
        await delay(3000);
        await student.page.screenshot({ path: join(out, `m3-6-session-live-${name}-${theme}.png`) });
        await student.context.close();
        await delay(1000);
      }
    }
    return { saved: true };
  },

  async interrupt({ stack, browser, out }) {
    const student = await openStudentPage(browser, { email: MAYA, title: 'Interrupt', recordVideoDir: join(out, 'video') });
    await startTalking(stack, student);
    const rows: StopRow[] = [];
    const count = Number(args.turns);
    for (let turn = 0; turn < count; turn += 1) rows.push(await interruptOnce({ stack, student, clipId: ['why-down', 'numerator', 'twice', 'reaction-wait'][turn % 4] as string }));
    await student.page.screenshot({ path: join(out, 'm3-6-talk.png') });
    await student.context.close();
    const pick = (name: keyof StopRow) => rows.flatMap((row) => (typeof row[name] === 'number' ? [row[name] as number] : []));
    return { rows, localYieldFromFirstSoundMs: summarise(pick('localYieldFromFirstSoundMs')), reactionCapturedAfterDecisionMs: summarise(pick('reactionCapturedAfterDecisionMs')), reactionHeardAfterDecisionMs: summarise(pick('reactionHeardAfterDecisionMs')), yieldFromFirstSoundMs: summarise(pick('yieldFromFirstSoundMs')), stopDecidedFromFirstSoundMs: summarise(pick('stopDecidedFromFirstSoundMs')), silenceFromFirstSoundMs: summarise(pick('silenceFromFirstSoundMs')), decisionToSilenceMs: summarise(pick('decisionToSilenceMs')), repliedAfterStop: rows.filter((row) => row.replyAfterStop).length, frozen: rows.filter((row) => row.boardFrozen).length, firedAfterStop: rows.reduce((sum, row) => sum + row.firedAfterStop, 0) };
  },

  // "Uh-huh" over the tutor lowers the voice and does not stop it, even over a question.
  async backchannel({ stack, browser }) {
    const student = await openStudentPage(browser, { email: MAYA, title: 'Backchannel' });
    await startTalking(stack, student);
    const rows = [];
    for (const clipId of ['reaction-uh-huh', 'reaction-mm-hmm', 'reaction-hmm', 'reaction-yeah', 'reaction-okay', 'reaction-right']) {
      const startedAtMs = Date.now();
      await typeReply(student, 'show me the ball');
      await waitForTrace(stack, student, startedAtMs, (found) => found.some((row) => row.name === 'firstFrameCaptured' && row.kind === 'reply'));
      await delay(1500);
      const said = await student.say(loadClip(VOICE, clipId));
      const found = await waitForTrace(stack, student, said.firstSoundEpochMs - 50, (seen) => seen.some((row) => row.name === 'turnFinished' && row.kind === 'reply'), 15_000);
      const trace = await student.getTrace();
      const firstYield = trace.yieldEpochMs.find((entry) => entry.atMs >= said.firstSoundEpochMs - 50 && entry.isYielding);
      const release = trace.yieldEpochMs.find((entry) => entry.atMs >= said.firstSoundEpochMs - 50 && !entry.isYielding);
      await delay(1000);
      rows.push({ clipId, heardAs: found.filter((row) => row.name === 'words').map((row) => row.text), stopped: found.some((row) => row.name === 'stopDecided'), reason: found.find((row) => row.name === 'stopDecided')?.reason, yieldMs: firstYield ? Math.round(firstYield.atMs - said.firstSoundEpochMs) : null, loweredForMs: firstYield && release ? Math.round(release.atMs - firstYield.atMs) : null });
    }
    await student.context.close();
    return { rows, stops: rows.filter((row) => row.stopped).length };
  },

  // The student's room noise makes Muse hold finals, so the tutor must answer from the partial within the bound.
  async held({ stack, browser }) {
    const student = await openStudentPage(browser, { email: MAYA, title: 'Held finals' });
    await startTalking(stack, student);
    await student.setNoise(Number(process.env.PROOF_NOISE ?? 0.02));
    await delay(2000);
    const rows: TurnRow[] = [];
    const count = Number(args.turns);
    for (let turn = 0; turn < count; turn += 1) rows.push(await measureTurn({ stack, student, clipId: TURN_LINES[turn % TURN_LINES.length] as string, idleMs: 1500 }));
    await student.context.close();
    return { rows: rows.map((row) => ({ line: row.line, transcript: row.transcript, finalMs: row.finalMs, replyDecidedMs: row.replyDecidedMs, via: row.replyVia })), viaPartial: rows.filter((row) => row.replyVia === 'partial').length, noReply: rows.filter((row) => row.replyDecidedMs === null).length, replyDecidedMs: summarise(rows.flatMap((row) => (row.replyDecidedMs === null ? [] : [row.replyDecidedMs]))), finalMs: summarise(rows.flatMap((row) => (row.finalMs === null ? [] : [row.finalMs]))) };
  },

  // The whole exchange by typing, with no microphone and no sound.
  async typed({ stack, browser, out }) {
    const student = await openStudentPage(browser, { email: MAYA, title: 'Typed', blocksAudio: true, recordVideoDir: join(out, 'video') });
    const startedAtMs = Date.now();
    await typeReply(student, 'why does it come down');
    await student.waitForLive();
    const rows = await waitForTrace(stack, student, startedAtMs, (found) => found.some((row) => row.name === 'turnFinished' && row.kind === 'reply'), 30_000);
    await delay(2500);
    const first = await student.getTrace();
    const secondAtMs = Date.now();
    await typeReply(student, 'show me the ball');
    await waitForTrace(stack, student, secondAtMs, (found) => found.some((row) => row.name === 'firstFrameCaptured' && row.kind === 'reply'));
    await delay(1500);
    const overAtMs = Date.now();
    await typeReply(student, 'wait, why');
    const over = await waitForTrace(stack, student, overAtMs, (found) => found.some((row) => row.name === 'firstFrameCaptured' && row.kind === 'reply'));
    await delay(2500);
    const last = await student.getTrace();
    const reactDecided = over.find((row) => row.name === 'reactDecided');
    const reactionCaptured = over.find((row) => row.name === 'firstFrameCaptured' && row.kind === 'reaction');
    await student.page.screenshot({ path: join(out, 'm3-6-typed.png') });
    const video = student.page.video();
    const museOpened = readTrace(stack.traceFolder, getRoomName(student)).some((row) => row.name === 'muse:opened');
    await student.context.close();
    await video?.saveAs(join(out, 'm3-6-typed.webm'));
    return { reactionCapturedAfterStopMs: reactDecided && reactionCaptured ? Math.round(reactionCaptured.atMs - reactDecided.atMs) : null, soundBlocked: first.view.isSoundBlocked, clockKinds: last.clockKinds, museOpened, firstReplyWords: first.view.tutorHeard, stoppedByTyping: over.some((row) => row.name === 'stopDecided' && row.reason === 'typed'), lastWords: last.view.tutorHeard, studentLines: last.view.studentLines, rowsSeen: rows.map((row) => row.name).filter((name) => name === 'turnStarted').length };
  },

  // A real drop: every connection the browser has goes through a proxy this script cuts.
  async drop({ stack, out }) {
    const proxy = await startCutProxy();
    const browser = await launchProofBrowser({ proxy: `127.0.0.1:${proxy.port}` });
    const student = await openStudentPage(browser, { email: MAYA, title: 'Drop', recordVideoDir: join(out, 'video') });
    await startTalking(stack, student);
    const rows = [];
    for (let run = 0; run < Number(args.turns); run += 1) {
      const startedAtMs = Date.now();
      await typeReply(student, 'show me the ball');
      await waitForTrace(stack, student, startedAtMs, (found) => found.some((row) => row.name === 'firstFrameCaptured' && row.kind === 'reply'));
      await delay(2500);
      const cutAtMs = Date.now();
      proxy.cut();
      await delay(Number(process.env.PROOF_DROP_MS ?? 4000));
      const during = await student.getTrace();
      proxy.restore();
      const backAtMs = Date.now();
      const found = await waitForTrace(stack, student, cutAtMs, (seen) => seen.some((row) => row.name === 'resumeStarted') && seen.some((row) => row.name === 'turnFinished' && row.kind === 'resume'), 45_000);
      await delay(1000);
      const after = await student.getTrace();
      const lost = found.find((row) => row.name === 'linkLost');
      const resumed = found.find((row) => row.name === 'resumeStarted');
      const report = found.find((row) => row.name === 'played' && row.ending === 'interrupted');
      rows.push({ lostAfterCutMs: lost ? Math.round(lost.atMs - cutAtMs) : null, resumedAfterBackMs: resumed ? Math.round(resumed.atMs - backAtMs) : null, reported: report ? { playedWords: report.playedWords, firedCues: report.firedCues } : null, reportedBeforeResume: resumed?.reported, phaseDuringDrop: during.view.phase, heardAtDrop: during.view.tutorHeard, heardAfterResume: after.view.tutorHeard, firedPerTurn: after.fired.length });
      await delay(1500);
    }
    await student.page.screenshot({ path: join(out, 'm3-6-drop.png') });
    await student.context.close();
    await browser.close();
    proxy.close();
    return { rows };
  },

  // Closing the tab ends the job, closes the vendors' sockets, and removes the room.
  async tab({ stack, browser }) {
    const student = await openStudentPage(browser, { email: MAYA, title: 'Tab' });
    await startTalking(stack, student);
    const room = getRoomName(student);
    const before = await listRoomNames();
    const closedAtMs = Date.now();
    await student.page.close();
    const closedRows = await waitForTrace(stack, student, closedAtMs, (found) => found.some((row) => row.name === 'jobClosed'), 40_000);
    let goneAfterMs: number | null = null;
    while (Date.now() - closedAtMs < 40_000) {
      if (!(await listRoomNames()).includes(room)) {
        goneAfterMs = Date.now() - closedAtMs;
        break;
      }
      await delay(500);
    }
    await student.context.close();
    const left = closedRows.find((row) => row.name === 'studentLeft');
    const egresses = await countRoomEgresses(room);
    return { egressesOfRoom: egresses, roomListedWhileOpen: before.includes(room), leftOnPurpose: left?.leftOnPurpose, jobClosedAfterMs: Math.round((closedRows.find((row) => row.name === 'jobClosed')?.atMs ?? closedAtMs) - closedAtMs), roomGoneAfterMs: goneAfterMs, museClosed: closedRows.some((row) => row.name === 'muse:closed') };
  },

  // A second student gets their own room, sees none of the first student's words, and cannot get a token for the first room.
  async second({ stack, browser }) {
    const maya = await openStudentPage(browser, { email: MAYA, title: 'Maya' });
    const tola = await openStudentPage(browser, { email: 'tola@astra.test', title: 'Tola' });
    await typeReply(maya, 'gravity pulls it down');
    await typeReply(tola, 'photosynthesis makes sugar');
    await maya.waitForLive();
    await tola.waitForLive();
    await delay(6000);
    const [mayaTrace, tolaTrace] = await Promise.all([maya.getTrace(), tola.getTrace()]);
    const rooms = await listRoomNames();
    const tokenForOthersRoom = await tola.page.evaluate(async (sessionId) => {
      for (let index = 0; index < localStorage.length; index += 1) {
        const value = localStorage.getItem(localStorage.key(index) as string) ?? '';
        if (!value.includes('access_token')) continue;
        const { access_token: token } = JSON.parse(value) as { access_token: string };
        return (await fetch(`/api/sessions/${sessionId}/live-room`, { method: 'POST', headers: { authorization: `Bearer ${token}` } })).status;
      }
      return null;
    }, maya.sessionId);
    const roomsInUse = [getRoomName(maya), getRoomName(tola)];
    const participants = await Promise.all(roomsInUse.map(listParticipantIdentities));
    await maya.context.close();
    await tola.context.close();
    void stack;
    return { roomsAreDifferent: roomsInUse[0] !== roomsInUse[1], bothListed: roomsInUse.every((name) => rooms.includes(name)), participants, tokenForOthersRoom, mayaHeard: mayaTrace.view.tutorHeard, tolaHeard: tolaTrace.view.tutorHeard, mayaSawTolasWords: JSON.stringify(mayaTrace.view).includes('photosynthesis'), tolaSawMayasWords: JSON.stringify(tolaTrace.view).includes('gravity') };
  },

  async turns({ stack, browser, out }) {
    const student = await openStudentPage(browser, { email: MAYA, title: 'Turns' });
    await startTalking(stack, student);
    const rows: TurnRow[] = [];
    const count = Number(args.turns);
    for (let turn = 0; turn < count; turn += 1) rows.push(await measureTurn({ stack, student, clipId: TURN_LINES[turn % TURN_LINES.length] as string }));
    writeFileSync(join(out, 'turn-rows.json'), `${JSON.stringify(rows, null, 1)}\n`);
    const roundTripMs = await student.getRoundTripMs();
    await student.context.close();
    return { roundTripMs, ...summariseTurns(rows) };
  },
};

const out = args.out;
mkdirSync(out, { recursive: true });
const stack = await startVoiceStack({ out, agentEnv: args.fake ? { ASTRA_VOICE: 'fake' } : {} });
const browser = await launchProofBrowser();
const results: Record<string, unknown> = {};
try {
  for (const name of (args.only ?? '').split(',')) {
    const scenario = SCENARIOS[name];
    if (!scenario) throw new Error(`no scenario ${name}`);
    results[name] = await scenario({ stack, browser, out });
    console.log(name, JSON.stringify(results[name], null, 1));
  }
} finally {
  writeFileSync(join(out, `result-${args.only}.json`), `${JSON.stringify(results, null, 1)}\n`);
  await browser.close();
  await stack.stop();
}
process.exit(0);
