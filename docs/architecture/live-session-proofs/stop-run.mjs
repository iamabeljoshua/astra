import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { loadavg } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AccessToken } from 'livekit-server-sdk';
import { chromium } from 'playwright-core';
import { getPlayedCues, parseBeat } from '../../../packages/contracts/src/index.ts';
import { clearScript, delay, disposeNative, setFakeSettings, setScript, Student } from './student.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'runs', 'stop', 'result.json');
mkdirSync(dirname(OUT), { recursive: true });
const LIVEKIT_URL = process.env.LIVEKIT_URL ?? 'ws://127.0.0.1:7880';
const PAGE_PORT = Number(process.env.STOP_PAGE_PORT ?? 17812);
const INTERRUPT_OFFSETS_MS = [800, 1500, 2200, 3000, 3800, 4600, 5500, 6500, 8000, 10000];
const UHHUH_ATTEMPTS = 4;
const STALL_ATTEMPTS = 6;
const STALL_MS = 400;
const STALL_AT_FLUSH = 3;
const QUESTION_ATTEMPTS = 3;
const RESUME_ATTEMPTS = 4;
const EARLY_MS = 40;
const LATE_MS = 100;


const bundle = (await build({ entryPoints: [join(HERE, 'stop-page.js')], bundle: true, write: false, format: 'iife', platform: 'browser' })).outputFiles[0].text;
const worklet = readFileSync(join(HERE, 'clock-worklet.js'), 'utf8');
const server = createServer((request, response) => {
  if (request.url === '/clock-worklet.js') { response.setHeader('content-type', 'text/javascript'); response.end(worklet); return; }
  if (request.url === '/page.js') { response.setHeader('content-type', 'text/javascript'); response.end(bundle); return; }
  response.setHeader('content-type', 'text/html');
  response.end('<!doctype html><title>board</title><script src="/page.js"></script>');
});
await new Promise((resolve) => server.listen(PAGE_PORT, '127.0.0.1', resolve));

const fakes = spawn('node', [join(HERE, 'fake-providers.mjs')], { stdio: 'ignore' });
await delay(500);
await clearScript();
const agentEvents = [];
const agentRaw = [];
const agent = spawn('node', [join(HERE, 'stop-agent.mjs'), 'start'], { env: { ...process.env, LIVEKIT_URL, LIVEKIT_API_KEY: 'devkey', LIVEKIT_API_SECRET: 'secret' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
function readAgentEvent(line) {
  try {
    const parsed = JSON.parse(line);
    return parsed.source === 'agent' ? parsed : null;
  } catch {
    return null;
  }
}

let buffer = '';
const onData = (chunk) => {
  buffer += chunk;
  const lines = buffer.split('\n');
  buffer = lines.pop();
  for (const line of lines) {
    agentRaw.push(line);
    const event = readAgentEvent(line);
    if (event) agentEvents.push(event);
  }
};
agent.stdout.on('data', onData);
agent.stderr.on('data', onData);
await delay(4000);

const waitFor = async (predicate, timeoutMs, from = 0) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = agentEvents.slice(from).find(predicate);
    if (found) return found;
    await delay(5);
  }
  return null;
};

const roomName = `stop-${Date.now()}`;
const student = new Student();
student.answersStop = false;
await student.join(roomName);
const started = await waitFor((event) => event.event === 'session_started', 30000);
if (!started) { console.error(agentRaw.slice(-30).join('\n')); throw new Error('session did not start'); }
const token = new AccessToken('devkey', 'secret', { identity: 'board', ttl: '20m' });
token.addGrant({ room: roomName, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });
const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--use-mock-keychain'] });
const page = await browser.newPage();
page.on('pageerror', (error) => console.error('page error', error.message));
await page.goto(`http://127.0.0.1:${PAGE_PORT}/`);
const audioInfo = await page.evaluate(async (options) => window.startBoard(options), { url: LIVEKIT_URL, token: await token.toJwt() });
await delay(1500);

const toListening = (from) => waitFor((event) => event.event === 'agent_state_changed' && event.newState === 'listening', 60000, from);
const results = [];

async function interruptAttempt(offsetMs) {
  const agentMark = agentEvents.length;
  await setScript('Once the ball leaves my hand, what makes it come down?');
  const studentMark = student.log.length;
  await student.say('question');
  const audio = await student.waitForEvent((event, index) => index >= studentMark && event.event === 'agent_audio_started', 8000);
  if (!audio) return { kind: 'interrupt', offsetMs, failed: 'no audio' };
  const turnStart = agentEvents.slice(agentMark).find((event) => event.event === 'tts_node_started');
  await delay(offsetMs);
  await setScript('Wait, then why does it come down?');
  const beforeSay = agentEvents.length;
  const spoken = student.say('interrupt');
  await waitFor((event) => event.event === 'policy_interrupt', 4000, beforeSay);
  await spoken;
  const listening = await toListening(beforeSay);
  await waitFor((event) => event.event === 'tts_node_started' && event.reply === 'short', 8000, beforeSay);
  await delay(1800);
  return { kind: 'interrupt', offsetMs, turnId: turnStart?.turnId, sawListening: Boolean(listening) };
}

async function uhhuhAttempt(speech = 'uhhuh', spokenText = 'Uh-huh') {
  const agentMark = agentEvents.length;
  await setScript('Gravity.');
  const studentMark = student.log.length;
  await student.say('gravity');
  const audio = await student.waitForEvent((event, index) => index >= studentMark && event.event === 'agent_audio_started', 8000);
  if (!audio) return { kind: 'uhhuh', failed: 'no audio' };
  const turnStart = agentEvents.slice(agentMark).find((event) => event.event === 'tts_node_started');
  await delay(1200);
  await setScript(spokenText);
  const beforeSay = agentEvents.length;
  await student.say(speech);
  await toListening(beforeSay);
  await delay(2500);
  return { kind: 'uhhuh', spokenText, turnId: turnStart?.turnId };
}

async function stallAttempt() {
  await setFakeSettings({ voiceStallMs: STALL_MS, voiceStallAtFlush: STALL_AT_FLUSH });
  const agentMark = agentEvents.length;
  await setScript('Gravity.');
  await student.say('gravity');
  await waitFor((event) => event.event === 'agent_state_changed' && event.newState === 'speaking', 8000, agentMark);
  const speaking = agentEvents.findLastIndex((event) => event.event === 'agent_state_changed' && event.newState === 'speaking');
  const turnStart = agentEvents.slice(agentMark).find((event) => event.event === 'tts_node_started');
  await toListening(speaking);
  await setFakeSettings({ voiceStallMs: 0, voiceStallAtFlush: 0 });
  await delay(1500);
  return { kind: 'stall', turnId: turnStart?.turnId };
}

// The reply is a question, and the student reacts over it, so the browser's report of its last word decides what counts as an answer.
async function questionAttempt(speech, spokenText, afterQuestionHeard) {
  const agentMark = agentEvents.length;
  await setScript('What pulls on it?');
  await student.say('question');
  await waitFor((event) => event.event === 'agent_state_changed' && event.newState === 'speaking', 8000, agentMark);
  const turnStart = agentEvents.slice(agentMark).find((event) => event.event === 'tts_node_started');
  if (afterQuestionHeard) await waitFor((event) => event.event === 'question_heard', 20000, agentMark);
  else await delay(1500);
  await setScript(spokenText);
  await student.say(speech);
  await delay(afterQuestionHeard ? 2500 : 0);
  await toListening(agentEvents.length - 1);
  await delay(1500);
  return { kind: 'question', spokenText, afterQuestionHeard, turnId: turnStart?.turnId, agentMark };
}

// A long noise with no words cuts a reply with a ball in the air, and the resume must set it moving again.
async function resumeAttempt() {
  const agentMark = agentEvents.length;
  await setScript('Watch my shot.');
  await student.say('gravity');
  await waitFor((event) => event.event === 'agent_state_changed' && event.newState === 'speaking', 8000, agentMark);
  const turnStart = agentEvents.slice(agentMark).find((event) => event.event === 'tts_node_started');
  await delay(2600);
  await clearScript();
  const beforeSay = agentEvents.length;
  await student.say('interrupt');
  const resume = await waitFor((event) => event.event === 'policy_resume', 6000, beforeSay);
  const resumed = await waitFor((event) => event.event === 'tts_node_started' && event.reply === 'resumed', 6000, beforeSay);
  await waitFor((event) => event.event === 'agent_state_changed' && event.newState === 'listening', 30000, resumed ? agentEvents.indexOf(resumed) : beforeSay);
  await delay(1500);
  return { kind: 'resume', turnId: turnStart?.turnId, resumedTurnId: resumed?.turnId, frozen: resume?.frozen, resumeFromWord: resume?.fromWord };
}

for (const offsetMs of INTERRUPT_OFFSETS_MS) {
  results.push(await interruptAttempt(offsetMs));
  console.log(JSON.stringify(results.at(-1)));
}
for (let index = 0; index < UHHUH_ATTEMPTS; index++) {
  results.push(await uhhuhAttempt());
  console.log(JSON.stringify(results.at(-1)));
}
for (let index = 0; index < 2; index++) {
  results.push(await uhhuhAttempt('interrupt', 'yeah yeah okay right'));
  console.log(JSON.stringify(results.at(-1)));
}
for (let index = 0; index < STALL_ATTEMPTS; index++) {
  results.push(await stallAttempt());
  console.log(JSON.stringify(results.at(-1)));
}
for (let index = 0; index < QUESTION_ATTEMPTS; index++) {
  results.push(await questionAttempt('uhhuh', 'Uh-huh', false));
  results.push(await questionAttempt('hmm', 'Hmm', false));
  results.push(await questionAttempt('gravity', 'Yes.', true));
  console.log(JSON.stringify(results.at(-1)));
}
for (let index = 0; index < RESUME_ATTEMPTS; index++) {
  results.push(await resumeAttempt());
  console.log(JSON.stringify(results.at(-1)));
}
const records = await page.evaluate(() => JSON.parse(JSON.stringify(window.boardRecords)));
await browser.close();
await student.leave();
process.kill(-agent.pid, 'SIGTERM');
await delay(800);
try { process.kill(-agent.pid, 'SIGKILL'); } catch { /* gone */ }
fakes.kill('SIGTERM');
server.close();

function rebuildFromReport(beats, report) {
  const rebuilt = [];
  const problems = [];
  for (const beat of beats) {
    const parsed = parseBeat({ id: beat.beatId, script: beat.script, expectsReply: beat.expectsReply });
    if (!parsed.ok) {
      problems.push(`${beat.beatId}: ${parsed.problem}`);
      continue;
    }
    const firedCues = (report?.fired ?? []).filter((cue) => cue.atWord >= beat.firstWord && cue.atWord < beat.firstWord + beat.wordCount).length;
    for (const cue of getPlayedCues(parsed.value, firedCues)) rebuilt.push({ atWord: beat.firstWord + cue.atWord, id: cue.command.id, kind: cue.command.kind });
  }
  return { rebuilt, problems };
}

function analyseStall(attempt, { turn, events, bursts }) {
  const fired = events.filter((event) => event.kind === 'cueFired');
  const errors = fired.map((event) => event.atMs - (bursts[event.atWord]?.atMs ?? Number.NaN));
  const onsets = events.filter((event) => event.kind === 'arriving-onset');
  const ends = events.filter((event) => event.kind === 'arriving-end');
  const silences = onsets.flatMap((onset) => {
    const end = ends.filter((item) => item.atMs < onset.atMs).at(-1);
    return end ? [Math.round(onset.atMs - end.atMs)] : [];
  });
  return {
    kind: 'stall',
    turnId: attempt.turnId,
    gapsReportedMs: events.filter((event) => event.kind === 'audioGap' && event.ms !== undefined).map((event) => event.ms),
    silencesHeardMs: silences,
    cuesFired: fired.length,
    cuesReceived: turn.cues.length,
    cueErrorsMs: errors.map(Math.round),
    earlyOver40: errors.filter((error) => error < -EARLY_MS).length,
    lateOver100: errors.filter((error) => error > LATE_MS).length,
  };
}

function analyseQuestion(attempt, { turn, events, bursts }) {
  const lastWord = turn.questionWords[0]?.at;
  const agentForAttempt = agentEvents.slice(attempt.agentMark);
  return {
    kind: 'question',
    spokenText: attempt.spokenText,
    afterQuestionHeard: attempt.afterQuestionHeard,
    frozen: turn.frozen,
    questionHeardSent: events.some((event) => event.kind === 'questionHeard'),
    wordsHeard: bursts.length,
    wordsInQuestion: lastWord === undefined ? null : lastWord + 1,
    repliesAfter: agentForAttempt.filter((event) => event.event === 'tts_node_started').length - 1,
    answerReachedTutor: agentForAttempt.some((event) => event.event === 'user_input_transcribed' && event.isFinal && event.transcript === attempt.spokenText),
  };
}

function analyseResume(attempt) {
  const cutTurn = records.turns.find((item) => item.turnId === attempt.turnId);
  const resumedTurn = records.turns.find((item) => item.turnId === attempt.resumedTurnId);
  if (!resumedTurn) return { kind: 'resume', failed: 'no resumed turn', turnId: attempt.turnId };
  const firedIds = [...cutTurn.fired, ...resumedTurn.fired].filter((cue) => cue.id).map((cue) => cue.id);
  const restarted = resumedTurn.cues.find((cue) => cue.command.kind === 'runSimulation' && cue.command.action === 'play');
  const burstsIn = (turnId) => records.events.filter((event) => event.turnId === turnId && event.kind === 'arriving-burst');
  return {
    kind: 'resume',
    frozen: attempt.frozen,
    fromWord: attempt.resumeFromWord,
    playCueAfterResume: restarted?.command ?? null,
    playFiredOnFirstWord: resumedTurn.fired.find((cue) => cue.kind === 'runSimulation')?.atWord === 0,
    noDrawingFiredTwice: new Set(firedIds).size === firedIds.length,
    wordsBefore: cutTurn.playedWords,
    wordsAfter: burstsIn(attempt.resumedTurnId).length,
    wordsInReply: cutTurn.wordStartsMs.length,
  };
}

function analyse(attempt) {
  if (attempt.failed) return attempt;
  if (attempt.kind === 'resume') return analyseResume(attempt);
  const turn = records.turns.find((item) => item.turnId === attempt.turnId);
  const events = records.events.filter((event) => event.turnId === attempt.turnId);
  const agentForTurn = agentEvents.filter((event) => event.turnId === attempt.turnId);
  const beats = agentForTurn.filter((event) => event.event === 'beat_end');
  const firstOnset = events.find((event) => event.kind === 'arriving-onset');
  const stop = events.find((event) => event.kind === 'frozen');
  const bursts = events.filter((event) => event.kind === 'arriving-burst');
  if (attempt.kind === 'stall') return analyseStall(attempt, { turn, events, bursts });
  if (attempt.kind === 'question') return analyseQuestion(attempt, { turn, events, bursts });
  if (attempt.kind === 'uhhuh') {
    const silences = events.filter((event) => event.kind === 'output-end').filter((event, index, list) => index < list.length - 1);
    const cueWords = turn.fired.map((cue) => cue.atWord);
    const yieldOn = events.find((event) => event.kind === 'yield' && event.isYielding);
    const yieldOff = events.find((event) => event.kind === 'yield' && !event.isYielding);
    const firedDuringYield = events.filter((event) => event.kind === 'cueFired' && yieldOn && event.atMs > yieldOn.atMs && (!yieldOff || event.atMs < yieldOff.atMs)).length;
    return { kind: 'uhhuh', spokenText: attempt.spokenText, turnId: attempt.turnId, frozen: Boolean(stop), wordsTimed: turn.wordStartsMs.length, burstsHeard: bursts.length, playedWords: turn.playedWords, cuesReceived: turn.cues.length, cuesFired: cueWords.length, firedDuringYield, yieldHeldMs: yieldOn && yieldOff ? Math.round(yieldOff.atMs - yieldOn.atMs) : null, outputSilences: silences.length };
  }
  if (!stop) return { kind: 'interrupt', offsetMs: attempt.offsetMs, turnId: attempt.turnId, failed: 'never froze', policy: agentForTurn.length };
  const lastArriving = events.filter((event) => event.kind === 'arriving-end').find((event) => event.atMs >= stop.atMs - 150);
  const outputEnd = events.filter((event) => event.kind === 'output-end').find((event) => event.atMs >= stop.atMs - 150);
  const allStops = records.events.filter((event) => event.kind === 'stopReceived' && event.atMs >= stop.atMs - 2000 && event.atMs <= stop.atMs + 2000);
  const burstsBeforeStop = bursts.filter((event) => event.atMs <= stop.atMs).length;
  const cuesAfterFreeze = events.filter((event) => event.kind === 'cueReceived' && event.afterFreeze);
  const firedAfterFreeze = events.filter((event) => event.kind === 'cueFired' && event.atMs > stop.atMs);
  const stopEvent = agentEvents.find((event) => event.event === 'policy_interrupt' && event.at >= (agentForTurn[0]?.at ?? 0));
  const cuesSentAfterStop = agentForTurn.filter((event) => event.event === 'cue_sent' && stopEvent && event.at > stopEvent.at);
  const modelWroteAllBeforeStop = agentEvents.some((event) => event.event === 'model_wrote_everything' && stopEvent && event.at < stopEvent.at && event.at >= (agentForTurn[0]?.at ?? 0));
  const report = agentEvents.find((event) => event.event === 'board_report' && event.report.type === 'played' && event.report.turnId === attempt.turnId)?.report;
  const { rebuilt, problems } = rebuildFromReport(beats, report);
  const liveIds = turn.fired.map((cue) => cue.id);
  const rebuiltIds = rebuilt.map((cue) => cue.id);
  const firedWords = turn.fired.map((cue) => cue.atWord);
  return {
    kind: 'interrupt',
    offsetMs: attempt.offsetMs,
    turnId: attempt.turnId,
    positionAtStopMs: Math.round(stop.positionMs),
    playedWordsReported: report?.playedWords ?? null,
    burstsBeforeStop,
    burstsArrivedAfterStop: bursts.length - burstsBeforeStop,
    arrivingAudioAfterStopMs: lastArriving ? Math.round(lastArriving.atMs - stop.atMs) : null,
    outputAudioAfterStopMs: outputEnd ? Math.round(outputEnd.atMs - stop.atMs) : null,
    stopChannelsSeen: allStops.map((event) => event.via),
    modelWroteAllBeforeStop,
    wordsTimedAtEnd: turn.wordStartsMs.length,
    cuesReceived: turn.cues.length,
    cuesSentAfterStop: cuesSentAfterStop.length,
    cuesReceivedAfterFreeze: cuesAfterFreeze.length,
    cuesFired: firedWords.length,
    cuesFiredAfterFreeze: firedAfterFreeze.length,
    cuesHeldBackUnfired: turn.cues.length - firedWords.length,
    firedPastHeardWord: firedWords.filter((word) => word >= burstsBeforeStop + 1).length,
    cuesForHeardWordsNotFired: turn.cues.filter((cue) => cue.atWord < burstsBeforeStop - 1 && cue.firedAtMs === undefined).length,
    rebuildMatchesLiveBoard: JSON.stringify(liveIds) === JSON.stringify(rebuiltIds),
    live: liveIds,
    rebuilt: rebuiltIds,
    problems,
  };
}

const analysed = results.map(analyse);
const describe = (values) => { const sorted = values.filter((value) => value !== null && value !== undefined).sort((a, b) => a - b); return { count: sorted.length, p50: sorted[Math.floor(sorted.length * 0.5)], max: sorted.at(-1), min: sorted[0] }; };
const interrupts = analysed.filter((row) => row.kind === 'interrupt' && !row.failed);
const summary = {
  machineLoadAtEnd: Math.round(loadavg()[0]),
  audioInfo,
  interrupts: interrupts.length,
  frozeEveryTime: interrupts.length === analysed.filter((row) => row.kind === 'interrupt').length,
  outputAudioAfterStopMs: describe(interrupts.map((row) => row.outputAudioAfterStopMs)),
  arrivingAudioAfterStopMs: describe(interrupts.map((row) => row.arrivingAudioAfterStopMs)),
  stopDeliveryMs: describe(records.events.filter((event) => event.kind === 'stopReceived' && event.sentAt).map((event) => Math.round(event.epochMs - event.sentAt))),
  uhhuh: analysed.filter((row) => row.kind === 'uhhuh'),
  cuesFiredAfterFreeze: interrupts.reduce((sum, row) => sum + row.cuesFiredAfterFreeze, 0),
  cuesSentAfterStop: interrupts.reduce((sum, row) => sum + row.cuesSentAfterStop, 0),
  cuesReceivedAfterFreeze: interrupts.reduce((sum, row) => sum + row.cuesReceivedAfterFreeze, 0),
  firedPastHeardWord: interrupts.reduce((sum, row) => sum + row.firedPastHeardWord, 0),
  cuesForHeardWordsNotFired: interrupts.reduce((sum, row) => sum + row.cuesForHeardWordsNotFired, 0),
  rebuildMatches: interrupts.filter((row) => row.rebuildMatchesLiveBoard).length,
  attemptsWhereModelStillWriting: interrupts.filter((row) => !row.modelWroteAllBeforeStop).length,
  stalls: {
    attempts: analysed.filter((row) => row.kind === 'stall').length,
    gapsReportedMs: analysed.filter((row) => row.kind === 'stall').flatMap((row) => row.gapsReportedMs),
    silencesHeardMs: analysed.filter((row) => row.kind === 'stall').flatMap((row) => row.silencesHeardMs),
    cuesFired: analysed.filter((row) => row.kind === 'stall').reduce((sum, row) => sum + row.cuesFired, 0),
    earlyOver40: analysed.filter((row) => row.kind === 'stall').reduce((sum, row) => sum + row.earlyOver40, 0),
    lateOver100: analysed.filter((row) => row.kind === 'stall').reduce((sum, row) => sum + row.lateOver100, 0),
    worstCueErrorMs: Math.max(0, ...analysed.filter((row) => row.kind === 'stall').flatMap((row) => row.cueErrorsMs.map(Math.abs))),
  },
  questions: analysed.filter((row) => row.kind === 'question'),
  resumes: analysed.filter((row) => row.kind === 'resume'),
};
writeFileSync(OUT, `${JSON.stringify({ summary, attempts: analysed, agentEvents, boardEvents: records.events }, null, 1)}\n`);
console.log(JSON.stringify(summary, null, 1));
for (const row of analysed) console.log(JSON.stringify(row));
await disposeNative();
process.exit(0);
