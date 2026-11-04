/// <reference lib="dom" />
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { Browser } from 'playwright';
import { readTrace, summarise, type TraceRow } from './read-trace.ts';
import { listParticipantIdentities, listRoomNames } from './cloud-rooms.ts';
import { startCutProxy } from './cut-proxy.ts';
import { startVoiceStack, type VoiceStack } from './stack.ts';
import { launchProofBrowser, loadClip, openStudentPage, type StudentPage } from './student-page.ts';

const { values: args } = parseArgs({
  options: {
    only: { type: 'string', default: 'smoke' },
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
  const firedAfter = (await student.getTrace()).fired.filter((cue) => cue.turnId === stopTurn && silenceAtMs !== undefined && cue.firedEpochMs > silenceAtMs).length;
  return {
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

const SCENARIOS: Record<string, (context: RunContext) => Promise<unknown>> = {
  async interrupt({ stack, browser, out }) {
    const student = await openStudentPage(browser, { email: MAYA, title: 'Interrupt', recordVideoDir: join(out, 'video') });
    await startTalking(stack, student);
    const rows: StopRow[] = [];
    const count = Number(args.turns);
    for (let turn = 0; turn < count; turn += 1) rows.push(await interruptOnce({ stack, student, clipId: ['why-down', 'numerator', 'twice', 'reaction-wait'][turn % 4] as string }));
    await student.page.screenshot({ path: join(out, 'm3-6-talk.png') });
    await student.context.close();
    const pick = (name: keyof StopRow) => rows.flatMap((row) => (typeof row[name] === 'number' ? [row[name] as number] : []));
    return { rows, yieldFromFirstSoundMs: summarise(pick('yieldFromFirstSoundMs')), stopDecidedFromFirstSoundMs: summarise(pick('stopDecidedFromFirstSoundMs')), silenceFromFirstSoundMs: summarise(pick('silenceFromFirstSoundMs')), decisionToSilenceMs: summarise(pick('decisionToSilenceMs')), repliedAfterStop: rows.filter((row) => row.replyAfterStop).length, frozen: rows.filter((row) => row.boardFrozen).length, firedAfterStop: rows.reduce((sum, row) => sum + row.firedAfterStop, 0) };
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
    await student.page.screenshot({ path: join(out, 'm3-6-typed.png') });
    const museOpened = readTrace(stack.traceFolder, getRoomName(student)).some((row) => row.name === 'muse:opened');
    await student.context.close();
    return { soundBlocked: first.view.isSoundBlocked, clockKinds: last.clockKinds, museOpened, firstReplyWords: first.view.tutorHeard, stoppedByTyping: over.some((row) => row.name === 'stopDecided' && row.reason === 'typed'), lastWords: last.view.tutorHeard, studentLines: last.view.studentLines, rowsSeen: rows.map((row) => row.name).filter((name) => name === 'turnStarted').length };
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
    return { roomListedWhileOpen: before.includes(room), leftOnPurpose: left?.leftOnPurpose, jobClosedAfterMs: Math.round((closedRows.find((row) => row.name === 'jobClosed')?.atMs ?? closedAtMs) - closedAtMs), roomGoneAfterMs: goneAfterMs, museClosed: closedRows.some((row) => row.name === 'muse:closed') };
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
    await student.context.close();
    return summariseTurns(rows);
  },
  async smoke({ stack, browser, out }) {
    const student = await openStudentPage(browser, { email: MAYA, title: 'Smoke', recordVideoDir: join(out, 'video') });
    await student.pressTalk();
    await student.waitForLive();
    const joined = await waitForTrace(stack, student, 0, (rows) => rows.some((row) => row.name === 'turnFinished'), 30_000);
    await delay(800);
    const clip = loadClip(VOICE, 'twice');
    const said = await student.say(clip);
    const rows = await waitForTrace(stack, student, said.firstSoundEpochMs, (found) => found.filter((row) => row.name === 'turnFinished').length >= 2, 15_000);
    const trace = await student.getTrace();
    await student.page.screenshot({ path: join(out, 'smoke.png') });
    await student.context.close();
    return { joined: joined.map((row) => row.name), rows: rows.map((row) => ({ name: row.name, ms: Math.round(row.atMs - said.lastSoundEpochMs), kind: row.kind, via: row.via, isFinal: row.isFinal, reason: row.reason })), view: trace.view, firstAudio: Object.fromEntries(Object.entries(trace.firstAudioEpochMs).map(([turnId, atMs]) => [turnId, Math.round(atMs - said.lastSoundEpochMs)])), refused: trace.refused };
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
