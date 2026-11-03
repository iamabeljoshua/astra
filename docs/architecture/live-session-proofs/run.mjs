import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { clearScript, delay, disposeNative, getFakeSettings, setFakeSettings, setScript, Student } from './student.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const { values: args } = parseArgs({ options: { sdk: { type: 'string', default: 'node' }, only: { type: 'string' }, repeat: { type: 'string', default: '10' }, label: { type: 'string', default: '' } } });
const REPEAT = Number(args.repeat);
const RUNS = join(HERE, 'runs', args.label ? `${args.sdk}-${args.label}` : args.sdk);
mkdirSync(RUNS, { recursive: true });

const SHORT_REPLY = 'Good question. Gravity pulls on it the whole time, even at the very top of the arc.';
const AGENT_COMMANDS = {
  node: ['node', [join(HERE, 'agent-node.mjs'), 'start']],
  python: [process.env.PYTHON_BIN ?? 'python3', [join(HERE, 'agent_python.py'), 'start']],
  beats: ['node', [join(HERE, 'agent-node-beats.mjs'), 'start']],
};
const BASE_ENV = { LIVEKIT_URL: process.env.LIVEKIT_URL ?? 'ws://127.0.0.1:7880', LIVEKIT_API_KEY: 'devkey', LIVEKIT_API_SECRET: 'secret' };

function percentile(values, fraction) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
}

function describeSeries(values) {
  return { count: values.length, p50: percentile(values, 0.5), p95: percentile(values, 0.95), min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null };
}

async function startAgent(env) {
  const [command, commandArgs] = AGENT_COMMANDS[args.sdk];
  const child = spawn(command, commandArgs, { env: { ...process.env, ...BASE_ENV, ...env }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  const events = [];
  const raw = [];
  const onLine = (text) => {
    raw.push(text);
    try {
      const parsed = JSON.parse(text);
      if (parsed.source === 'agent') events.push(parsed);
    } catch {
      return;
    }
  };
  let buffer = '';
  const onData = (chunk) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop();
    lines.forEach(onLine);
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  await delay(args.sdk === 'python' ? 6000 : 4000);
  return { child, events, raw };
}

async function stopAgent(agent) {
  process.kill(-agent.child.pid, 'SIGTERM');
  await delay(800);
  try {
    process.kill(-agent.child.pid, 'SIGKILL');
  } catch {
    return;
  }
  await delay(300);
}

function getAgentMemoryMb(groupId) {
  const rows = execFileSync('ps', ['-o', 'pgid=,rss=', '-A'], { encoding: 'utf8' }).trim().split('\n');
  const kilobytes = rows.map((row) => row.trim().split(/\s+/).map(Number)).filter(([pgid]) => pgid === groupId).reduce((sum, [, rss]) => sum + rss, 0);
  return Math.round(kilobytes / 1024);
}

function save(name, payload) {
  writeFileSync(join(RUNS, `${name}.json`), `${JSON.stringify(payload, null, 1)}\n`);
}

async function withSession(name, env, drive) {
  await clearScript();
  const agent = await startAgent(env);
  const student = new Student();
  const joinStartedAt = Date.now();
  await student.join(`${name}-${Date.now()}`);
  // A first run on a fresh Python environment spends most of a minute compiling and loading its models.
  const started = await waitForAgentEvent(agent, (event) => event.event === 'session_started', args.sdk === 'python' ? 90000 : 20000);
  if (!started) {
    save(`${name}.failed`, { raw: agent.raw.slice(-40), student: student.log });
    await student.leave();
    await stopAgent(agent);
    throw new Error(`${name}: agent session did not start. See runs/${args.sdk}/${name}.failed.json`);
  }
  await delay(1500);
  const summary = await drive({ agent, student });
  summary.joinToSessionStartedMs = started.at - joinStartedAt;
  summary.agentMemoryMb = getAgentMemoryMb(agent.child.pid);
  summary.machineLoadAtEnd = Math.round(loadavg()[0]);
  await student.leave();
  await stopAgent(agent);
  save(name, { summary, env, agent: agent.events, student: student.log });
  if (process.env.SAVE_RAW) writeFileSync(join(RUNS, `${name}.raw.log`), agent.raw.join('\n'));
  console.log(JSON.stringify({ scenario: name, summary }));
  return summary;
}

async function waitForAgentEvent(agent, predicate, timeoutMs, fromIndex = 0) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = agent.events.slice(fromIndex).find(predicate);
    if (found) return found;
    await delay(5);
  }
  return null;
}

async function waitForAgentState(agent, state, timeoutMs, fromIndex) {
  return waitForAgentEvent(agent, (event) => event.event === 'agent_state_changed' && event.newState === state, timeoutMs, fromIndex);
}

async function driveBeats({ agent, student }) {
  const attempts = [];
  for (let attempt = 0; attempt < REPEAT; attempt++) {
    await setScript('What pulls on it?');
    const agentMark = agent.events.length;
    const studentMark = student.log.length;
    await student.say('gravity');
    const speechEnd = student.voicedEndedAt;
    const audio = await student.waitForEvent((event, index) => index >= studentMark && event.event === 'agent_audio_started', 8000);
    const thinking = await waitForAgentState(agent, 'thinking', 8000, agentMark);
    const fragment = await waitForAgentEvent(agent, (event) => event.event === 'first_fragment', 8000, agentMark);
    const firstFrame = await waitForAgentEvent(agent, (event) => event.event === 'first_tts_frame', 8000, agentMark);
    await waitForAgentState(agent, 'listening', 20000, agent.events.indexOf(thinking) + 1);
    await delay(800);
    const turnEvents = student.log.slice(studentMark);
    const bursts = turnEvents.filter((event) => event.event === 'word_burst');
    const messages = turnEvents.filter((event) => event.event === 'data_received' && event.topic === 'astra.live').map((event) => ({ ...JSON.parse(event.text), at: event.at }));
    const cues = messages.filter((message) => message.type === 'cue');
    const wordTimes = messages.filter((message) => message.type === 'wordTimes');
    const firstTimesAt = wordTimes[0]?.at;
    const sdkTranscript = turnEvents.filter((event) => event.event === 'transcription_stream_chunk' && event.from !== 'student').map((event) => event.text).join('');
    attempts.push({
      sdkTranscriptShowsCommands: sdkTranscript.includes('{"kind"'),
      speechEndToFirstAudioMs: audio ? audio.at - speechEnd : null,
      firstFragmentToFirstAudioMs: audio && fragment ? audio.at - fragment.at : null,
      firstFragmentToFirstTtsFrameMs: firstFrame && fragment ? firstFrame.at - fragment.at : null,
      wordsHeard: bursts.length,
      wordsTimed: wordTimes.flatMap((message) => message.words).length,
      wordTimesLeadOverAudioMs: audio && firstTimesAt ? audio.at - firstTimesAt : null,
      cueLeadOverWordMs: cues.map((cue) => (bursts[cue.atWord] ? bursts[cue.atWord].at - cue.at : null)),
      cueKinds: cues.map((cue) => cue.command.kind),
      cueWords: cues.map((cue) => cue.atWord),
    });
  }
  return { attempts: attempts.length, speechEndToFirstAudioMs: describeSeries(attempts.map((item) => item.speechEndToFirstAudioMs).filter((value) => value !== null)), firstFragmentToFirstAudioMs: describeSeries(attempts.map((item) => item.firstFragmentToFirstAudioMs).filter((value) => value !== null)), lowestCueLeadMs: Math.min(...attempts.flatMap((item) => item.cueLeadOverWordMs).filter((value) => value !== null)), wordsHeard: attempts.reduce((total, item) => total + item.wordsHeard, 0), wordsTimed: attempts.reduce((total, item) => total + item.wordsTimed, 0), sdkTranscriptShowedCommands: attempts.filter((item) => item.sdkTranscriptShowsCommands).length, agentStatesSeenByStudent: [...new Set(student.log.filter((event) => event.event === 'agent_state_attribute').map((event) => event.state))], sample: attempts.at(-1) };
}

// The student pauses mid-thought for less than the maximum delay, so the agent starts the model early and then throws that reply away.
async function waitForAgentQuiet(agent, quietMs) {
  let count = agent.events.length;
  let quietSince = Date.now();
  while (Date.now() - quietSince < quietMs) {
    await delay(50);
    if (agent.events.length !== count) {
      count = agent.events.length;
      quietSince = Date.now();
    }
  }
}

function countSeparateCuts(cuts) {
  return cuts.filter((cut, index) => index === 0 || cut.at - cuts[index - 1].at > 300).length;
}

// The student pauses mid-thought, so the model starts early. A reply the SDK then cuts must reach the browser as a stop.
async function driveSpeculativeBeats({ agent, student }) {
  const outcomes = [];
  for (let attempt = 0; attempt < Math.min(REPEAT, 15); attempt++) {
    const agentMark = agent.events.length;
    const studentMark = student.log.length;
    await setScript('Hmm, let me think.');
    await student.say('hmm');
    await delay(1000);
    const cuesDuringPause = readLiveMessages(student.log, studentMark).filter((message) => message.type === 'cue').length;
    await setScript('It lands twice as far.');
    await student.say('twice');
    await waitForAgentQuiet(agent, 2500);
    const agentEvents = agent.events.slice(agentMark);
    const messages = readLiveMessages(student.log, studentMark);
    const cuts = agentEvents.filter((event) => event.event === 'reply_cut');
    outcomes.push({ cuesDuringPause, replies: agentEvents.filter((event) => event.event === 'tts_node_started').length, cuts: countSeparateCuts(cuts), stopsHeard: countSeparateCuts(messages.filter((message) => message.type === 'stop').map((message) => ({ at: message.receivedAt }))) });
  }
  const repliesCut = outcomes.filter((outcome) => outcome.replies > 1 || outcome.cuesDuringPause > 0);
  return { attempts: outcomes.length, attemptsWithAStaleReply: repliesCut.length, attemptsWhereEveryCutSentAStop: repliesCut.filter((outcome) => outcome.stopsHeard >= outcome.replies - 1).length, outcomes };
}

function readLiveMessages(log, fromIndex) {
  return log.slice(fromIndex).filter((event) => event.event === 'data_received' && event.topic === 'astra.live').map((event) => ({ ...JSON.parse(event.text), receivedAt: event.at }));
}

async function driveTieredInterrupts({ agent, student }) {
  const toYield = [];
  const toStopMessage = [];
  const toLastAudio = [];
  const stopMessageToLastAudio = [];
  const reasons = [];
  for (let attempt = 0; attempt < REPEAT; attempt++) {
    const { studentMark } = await startLongReply({ agent, student });
    await setScript('Wait, then why does it come down?');
    const stateMark = agent.events.length;
    const speechMark = student.log.length;
    const spoken = student.say('interrupt');
    await student.waitForEvent((event, index) => index >= speechMark && event.event === 'speech_started' && event.speech === 'interrupt', 2000);
    const speechStart = student.voicedStartedAt;
    await spoken;
    await delay(400);
    const messages = readLiveMessages(student.log, speechMark);
    const yieldMessage = messages.find((message) => message.type === 'yield' && message.isYielding !== false);
    const stopMessage = messages.find((message) => message.type === 'stop');
    const firstStop = student.log.slice(studentMark).find((event) => event.event === 'agent_audio_stopped' && event.lastAudibleAt > speechStart);
    if (yieldMessage) toYield.push(yieldMessage.receivedAt - speechStart);
    if (stopMessage) toStopMessage.push(stopMessage.receivedAt - speechStart);
    if (firstStop) toLastAudio.push(firstStop.lastAudibleAt - speechStart);
    if (firstStop && stopMessage) stopMessageToLastAudio.push(firstStop.lastAudibleAt - stopMessage.receivedAt);
    reasons.push(agent.events.slice(stateMark).find((event) => event.event === 'policy_interrupt')?.reason ?? null);
    await waitForAgentState(agent, 'listening', 15000, stateMark + 1);
    await delay(1500);
  }
  return { speechStartToYieldMessageMs: describeSeries(toYield), speechStartToStopMessageMs: describeSeries(toStopMessage), speechStartToLastAudioMs: describeSeries(toLastAudio), stopMessageToLastAudioMs: describeSeries(stopMessageToLastAudio), reasons };
}

async function driveTieredBackchannels({ agent, student }) {
  const outcomes = [];
  for (let attempt = 0; attempt < Math.min(REPEAT, 10); attempt++) {
    await startLongReply({ agent, student });
    await setScript('Uh-huh');
    const stateMark = agent.events.length;
    const speechMark = student.log.length;
    await student.say('uhhuh');
    const speechStart = student.voicedStartedAt;
    await delay(1200);
    const stopped = agent.events.slice(stateMark).find((event) => event.event === 'agent_state_changed' && event.oldState === 'speaking');
    const messages = readLiveMessages(student.log, speechMark);
    const yieldMessage = messages.find((message) => message.type === 'yield' && message.isYielding !== false);
    const unyieldMessage = messages.find((message) => message.type === 'yield' && message.isYielding === false);
    const silence = student.log.slice(speechMark).filter((event) => event.event === 'agent_audio_stopped');
    outcomes.push({ agentStopped: Boolean(stopped), audioWentSilent: silence.length > 0, yieldAfterMs: yieldMessage ? yieldMessage.receivedAt - speechStart : null, yieldHeldMs: yieldMessage && unyieldMessage ? unyieldMessage.receivedAt - yieldMessage.receivedAt : null });
    if (!stopped) await waitForAgentState(agent, 'listening', 40000, stateMark);
    await delay(1500);
  }
  return { attempts: outcomes.length, stopped: outcomes.filter((outcome) => outcome.agentStopped).length, audioWentSilent: outcomes.filter((outcome) => outcome.audioWentSilent).length, outcomes };
}

async function driveReconnect({ agent, student }) {
  const roomName = student.roomName;
  const outcomes = [];
  for (let attempt = 0; attempt < Math.min(REPEAT, 3); attempt++) {
    await setScript('What about gravity?');
    await student.say('question');
    await student.waitForEvent((event) => event.event === 'agent_audio_started', 8000);
    await delay(800);
    await student.leave();
    await delay(3000);
    const closedWhileAway = agent.events.some((event) => event.event === 'close');
    await student.join(roomName);
    await delay(1500);
    const agentMark = agent.events.length;
    const studentMark = student.log.length;
    await setScript('Why does it come down?');
    await student.say('interrupt');
    const heardSpeech = await waitForAgentEvent(agent, (event) => event.event === 'user_input_transcribed' && event.isFinal, 6000, agentMark);
    const audio = await student.waitForEvent((event, index) => index >= studentMark && event.event === 'agent_audio_started', 8000);
    outcomes.push({ sessionClosedWhileAway: closedWhileAway, agentHeardStudentAfterRejoin: Boolean(heardSpeech), agentSpokeAfterRejoin: Boolean(audio) });
    await waitForAgentState(agent, 'listening', 15000, agentMark);
    await delay(1000);
  }
  return { attempts: outcomes.length, outcomes };
}

const FAST_TURN = { AGENT_REPLY: SHORT_REPLY, TURN_MODE: 'detector' };
const BEATS_TURN = { EP_MIN_MS: '300', EP_MAX_MS: '1000' };
const PATIENCE_TURN = { TURN_MODE: 'detector', EP_MIN_MS: '300', EP_MAX_MS: '1000' };
const CAP_HIT_MS = 1000;
const SPOKEN_PHRASES = [
  ['question', 'Once the ball leaves my hand, what makes it come down?'],
  ['gravity', 'Gravity.'],
  ['twice', 'It lands twice as far.'],
  ['interrupt', 'Wait, then why does it come down?'],
];


async function driveOneWord({ agent, student }) {
  const outcomes = [];
  for (let attempt = 0; attempt < Math.min(REPEAT, 5); attempt++) {
    await startLongReply({ agent, student });
    await setScript('Wait.');
    const stateMark = agent.events.length;
    const speechMark = student.log.length;
    await student.say('wait');
    const speechStart = student.voicedStartedAt;
    await delay(2500);
    const stopMessage = readLiveMessages(student.log, speechMark).find((message) => message.type === 'stop');
    outcomes.push({ stopped: Boolean(stopMessage), stopAfterMs: stopMessage ? stopMessage.receivedAt - speechStart : null, reason: agent.events.slice(stateMark).find((event) => event.event === 'policy_interrupt')?.reason ?? null });
    await waitForAgentState(agent, 'listening', 40000, stateMark);
    await delay(1500);
    await clearScript();
  }
  return { attempts: outcomes.length, stopped: outcomes.filter((outcome) => outcome.stopped).length, stopAfterMs: describeSeries(outcomes.flatMap((outcome) => outcome.stopAfterMs ?? [])), outcomes };
}

function countBursts(log, fromIndex, toIndex = log.length) {
  return log.slice(fromIndex, toIndex).filter((event) => event.event === 'word_burst').length;
}

async function driveNoiseResume({ agent, student }) {
  const outcomes = [];
  for (let attempt = 0; attempt < Math.min(REPEAT, 5); attempt++) {
    student.startCountingReplyWords();
    const replyMark = student.log.length;
    await startLongReply({ agent, student });
    await clearScript();
    const stateMark = agent.events.length;
    const speechMark = student.log.length;
    await student.say('interrupt');
    const speechStart = student.voicedStartedAt;
    const speechEnd = student.voicedEndedAt;
    const resume = await waitForAgentEvent(agent, (event) => event.event === 'policy_resume', 6000, stateMark);
    const stopEvent = student.log.slice(speechMark).find((event) => event.event === 'data_received' && event.topic === 'astra.live' && JSON.parse(event.text).type === 'stop');
    const restarted = await student.waitForEvent((event, index) => index >= student.log.indexOf(stopEvent) && event.event === 'agent_audio_started', 6000);
    const speakingAgain = await waitForAgentState(agent, 'speaking', 6000, stateMark + 1);
    await waitForAgentState(agent, 'listening', 60000, agent.events.indexOf(speakingAgain) + 1);
    await delay(600);
    outcomes.push({
      stopAfterMs: stopEvent ? stopEvent.at - speechStart : null,
      resumed: Boolean(resume),
      voiceEndToResumedAudioMs: restarted ? restarted.at - speechEnd : null,
      wordsHeardBefore: countBursts(student.log, replyMark, student.log.indexOf(stopEvent)),
      fromWord: resume?.fromWord ?? null,
      wordsHeardAfter: countBursts(student.log, student.log.indexOf(restarted)),
      replyWords: resume?.of ?? null,
    });
    await delay(1000);
  }
  const isExact = (outcome) => outcome.wordsHeardBefore + outcome.wordsHeardAfter === outcome.replyWords + 1;
  return { attempts: outcomes.length, resumed: outcomes.filter((outcome) => outcome.resumed).length, everyWordHeardWithTheCutWordTwice: outcomes.filter(isExact).length, voiceEndToResumedAudioMs: describeSeries(outcomes.flatMap((outcome) => outcome.voiceEndToResumedAudioMs ?? [])), outcomes };
}

async function driveSilenceAfter({ agent, student, speech, script, waitMs }) {
  const waitedMs = [];
  for (let attempt = 0; attempt < Math.min(REPEAT, 5); attempt++) {
    await setScript(script);
    const agentMark = agent.events.length;
    await student.say(speech);
    const speechEnd = student.voicedEndedAt;
    const thinking = await waitForAgentState(agent, 'thinking', waitMs, agentMark);
    waitedMs.push(thinking ? thinking.at - speechEnd : null);
    await waitForAgentState(agent, 'listening', 15000, thinking ? agent.events.indexOf(thinking) + 1 : agentMark);
    await delay(1000);
  }
  return { attempts: waitedMs.length, tutorStartedAfterMs: waitedMs };
}

async function driveThinkingPause({ agent, student, firstSpeech, firstScript, pauseMs }) {
  const outcomes = [];
  for (let attempt = 0; attempt < Math.min(REPEAT, 5); attempt++) {
    await setScript(firstScript);
    const agentMark = agent.events.length;
    await student.say(firstSpeech);
    await delay(pauseMs);
    const jumpedIn = agent.events.slice(agentMark).find((event) => event.event === 'agent_state_changed' && event.newState === 'thinking');
    await setScript('It lands twice as far.');
    await student.say('twice');
    const answerEnd = student.voicedEndedAt;
    const thinking = await waitForAgentState(agent, 'thinking', 8000, agentMark);
    outcomes.push({ agentJumpedInDuringPause: Boolean(jumpedIn), answerEndToThinkingMs: thinking ? thinking.at - answerEnd : null });
    await waitForAgentState(agent, 'listening', 20000, agent.events.indexOf(thinking) + 1);
    await delay(1500);
  }
  return { attempts: outcomes.length, jumpedIn: outcomes.filter((outcome) => outcome.agentJumpedInDuringPause).length, outcomes };
}

async function driveSpeechEndToFirstAudio({ agent, student }) {
  const firstAudioMs = [];
  for (let attempt = 0; attempt < 8; attempt++) {
    await setScript('What pulls on it?');
    const agentMark = agent.events.length;
    const studentMark = student.log.length;
    await student.say('gravity');
    const speechEnd = student.voicedEndedAt;
    const audio = await student.waitForEvent((event, index) => index >= studentMark && event.event === 'agent_audio_started', 8000);
    firstAudioMs.push(audio ? audio.at - speechEnd : null);
    await waitForAgentState(agent, 'listening', 20000, agentMark + 1);
    await delay(800);
  }
  return { speechEndToFirstAudioMs: describeSeries(firstAudioMs.filter((value) => value !== null)), firstAudioMs };
}

const COMMAND_BYTES = [
  { kind: 'plot', id: 'p', expression: '(x-1)*(x+1)*(x+2)', domain: [-3, 3] },
  { kind: 'writeMath', id: 'm', tex: 'a^{*} \\cdot b^{*} = c' },
  { kind: 'code', id: 'c', language: 'python', source: 'total = fs[i](x) + gs[j](y)' },
  { kind: 'text', id: 't', text: 'about ~~5~~ 6' },
];

// Commands whose text the SDK's markdown filter would change, spoken through the real pipeline.
async function driveCommandBytes({ agent, student }) {
  await setScript('Show me.');
  const studentMark = student.log.length;
  await student.say('gravity');
  await student.waitForEvent((event, index) => index >= studentMark && event.event === 'agent_audio_started', 8000);
  await waitForAgentQuiet(agent, 2500);
  const messages = readLiveMessages(student.log, studentMark);
  const cues = messages.filter((message) => message.type === 'cue').map((message) => message.command);
  const getReceived = (command) => cues.find((cue) => cue.id === command.id) ?? null;
  const isSame = (command) => JSON.stringify(getReceived(command)) === JSON.stringify(command);
  return {
    cuesSent: COMMAND_BYTES.length,
    cuesReceived: cues.length,
    cuesUnchanged: COMMAND_BYTES.filter(isSame).length,
    changed: COMMAND_BYTES.filter((command) => !isSame(command)).map((command) => ({ sent: command, received: getReceived(command) })),
    spoken: messages.filter((message) => message.type === 'wordTimes').flatMap((message) => message.words.map((word) => word.text)).join(' '),
  };
}

const QUESTION_REPLY = 'So once the ball has left your hand and nothing is pushing it forward any more, what do you think is still pulling on it while it flies through the air?';
const QUESTION_WORDS = QUESTION_REPLY.split(' ').length;
const T5_WAIT_MS = 8000;

function countBurstsSince(log, fromIndex) {
  return log.slice(fromIndex).filter((event) => event.event === 'word_burst').length;
}

// Each attempt asks the question, and the student reacts over it, so the rule must wait for the browser to report its last word.
function driveReactionOverQuestion(speech, script) {
  return async ({ agent, student }) => {
    const outcomes = [];
    for (let attempt = 0; attempt < Math.min(REPEAT, 5); attempt++) {
      student.startCountingReplyWords();
      student.questionHasWords = QUESTION_WORDS;
      const replyMark = student.log.length;
      const { agentMark } = await startLongReply({ agent, student });
      await setScript(script);
      const speechMark = student.log.length;
      await student.say(speech);
      await waitForAgentState(agent, 'listening', 30000, agentMark + 1);
      const repliesBefore = agent.events.slice(agentMark).filter((event) => event.event === 'llm_node_started').length;
      await delay(T5_WAIT_MS);
      const events = agent.events.slice(agentMark);
      outcomes.push({
        stopped: readLiveMessages(student.log, speechMark).some((message) => message.type === 'stop'),
        wordsHeard: countBurstsSince(student.log, replyMark),
        ofWords: QUESTION_WORDS,
        questionHeardSent: student.log.slice(replyMark).some((event) => event.event === 'question_heard_sent'),
        repliesWithinT5: events.filter((event) => event.event === 'llm_node_started').length - repliesBefore,
      });
      await clearScript();
    }
    return { attempts: outcomes.length, stopped: outcomes.filter((outcome) => outcome.stopped).length, heardInFull: outcomes.filter((outcome) => outcome.wordsHeard === outcome.ofWords).length, tutorStayedQuietForT5: outcomes.filter((outcome) => outcome.repliesWithinT5 === 0).length, outcomes };
  };
}

// "Yes." once the question's last word has started is an answer, and the tutor answers it.
async function driveAnswerOverLastWord({ agent, student }) {
  const outcomes = [];
  for (let attempt = 0; attempt < Math.min(REPEAT, 5); attempt++) {
    student.startCountingReplyWords();
    student.questionHasWords = QUESTION_WORDS;
    const replyMark = student.log.length;
    const { agentMark } = await startLongReply({ agent, student });
    await student.waitForEvent((event, index) => index >= replyMark && event.event === 'question_heard_sent', 20000);
    await setScript('Yes.');
    const speechMark = student.log.length;
    await student.say('gravity');
    const speechEnd = student.voicedEndedAt;
    const reply = await waitForAgentEvent(agent, (event) => event.event === 'llm_node_started' && event.at > speechEnd - 2000, 4000, agentMark + 1);
    await delay(500);
    const events = agent.events.slice(agentMark);
    outcomes.push({
      stopped: readLiveMessages(student.log, speechMark).some((message) => message.type === 'stop'),
      answerReachedModel: events.some((event) => event.event === 'conversation_item_added' && event.role === 'user' && event.text === 'Yes.'),
      voiceEndToReplyMs: reply ? reply.at - speechEnd : null,
    });
    await waitForAgentState(agent, 'listening', 30000, agent.events.length);
    await delay(1000);
    await clearScript();
  }
  return { attempts: outcomes.length, answerReachedModel: outcomes.filter((outcome) => outcome.answerReachedModel).length, voiceEndToReplyMs: describeSeries(outcomes.flatMap((outcome) => outcome.voiceEndToReplyMs ?? [])), outcomes };
}

// The student finishes a thought, the turn is confirmed, the model is thinking, and the student carries on.
async function driveTalkIntoTheGap({ agent, student }) {
  const outcomes = [];
  const offsets = [100, 400, 600];
  for (let attempt = 0; attempt < Math.min(REPEAT, 6); attempt++) {
    await setScript('Gravity.');
    const agentMark = agent.events.length;
    const studentMark = student.log.length;
    const rawMark = agent.raw.length;
    await student.say('gravity');
    await waitForAgentState(agent, 'thinking', 6000, agentMark);
    await delay(offsets[attempt % offsets.length]);
    await setScript('It lands twice as far.');
    await student.say('twice');
    await waitForAgentQuiet(agent, 3000);
    const events = agent.events.slice(agentMark);
    outcomes.push({
      offsetAfterThinkingMs: offsets[attempt % offsets.length],
      stops: readLiveMessages(student.log, studentMark).filter((message) => message.type === 'stop').length,
      secondSentenceReachedModel: events.some((event) => event.event === 'conversation_item_added' && event.role === 'user' && event.text?.includes('twice')),
      repliesStarted: events.filter((event) => event.event === 'llm_node_started').length,
      turnsDroppedBySdk: agent.raw.slice(rawMark).filter((line) => line.includes('skipping user input')).length,
    });
    await waitForAgentState(agent, 'listening', 30000, agent.events.length - 1);
    await delay(1000);
    await clearScript();
  }
  return { attempts: outcomes.length, answered: outcomes.filter((outcome) => outcome.secondSentenceReachedModel).length, dropped: outcomes.filter((outcome) => outcome.turnsDroppedBySdk > 0).length, outcomes };
}

// Interim words and then no final words, as when speech to text takes them back.
async function driveWordsNeverFinal({ agent, student }) {
  const outcomes = [];
  for (let attempt = 0; attempt < Math.min(REPEAT, 5); attempt++) {
    const { agentMark } = await startLongReply({ agent, student });
    const stateMark = agent.events.length;
    await setScript('~Wait then why');
    await student.say('question');
    const speechEnd = student.voicedEndedAt;
    const resume = await waitForAgentEvent(agent, (event) => event.event === 'policy_resume', 6000, stateMark);
    outcomes.push({ stopped: agent.events.slice(stateMark).some((event) => event.event === 'policy_interrupt'), resumed: Boolean(resume), voiceEndToResumeMs: resume ? resume.at - speechEnd : null });
    await waitForAgentState(agent, 'listening', 60000, (resume ? agent.events.indexOf(resume) : agentMark) + 1);
    await delay(1000);
    await clearScript();
  }
  return { attempts: outcomes.length, stopped: outcomes.filter((outcome) => outcome.stopped).length, resumed: outcomes.filter((outcome) => outcome.resumed).length, outcomes };
}

async function driveHeldReaction({ agent, student }) {
  const outcomes = [];
  for (let attempt = 0; attempt < Math.min(REPEAT, 6); attempt++) {
    await setScript('Once the ball leaves my hand, what makes it come down?');
    const replyMark = student.log.length;
    await student.say('question');
    await student.waitForEvent((event, index) => index >= replyMark && event.event === 'agent_audio_started', 8000);
    await delay(1500);
    await setScript('Uh-huh');
    const reactionMark = agent.events.length;
    await student.say('uhhuh');
    await waitForAgentState(agent, 'listening', 40000, reactionMark);
    await delay(2500);
    const answeredOnItsOwn = agent.events.slice(reactionMark).some((event) => event.event === 'llm_node_started');
    await waitForAgentState(agent, 'listening', 40000, agent.events.length);
    await setScript('Gravity.');
    const nextMark = agent.events.length;
    await student.say('gravity');
    await waitForAgentState(agent, 'thinking', 6000, nextMark);
    await delay(400);
    const nextTurn = agent.events.slice(nextMark).find((event) => event.event === 'conversation_item_added' && event.role === 'user');
    outcomes.push({ answeredOnItsOwn, nextTurnText: nextTurn?.text ?? null, staleInNextTurn: Boolean(nextTurn?.text?.toLowerCase().includes('uh')) });
    await waitForAgentState(agent, 'listening', 40000, nextMark + 1);
    await delay(1000);
  }
  return { attempts: outcomes.length, answeredOnItsOwn: outcomes.filter((outcome) => outcome.answeredOnItsOwn).length, staleInNextTurn: outcomes.filter((outcome) => outcome.staleInNextTurn).length, outcomes };
}

async function speakOver({ agent, student }) {
  await setScript('Wait, then why does it come down?');
  const agentMark = agent.events.length;
  const speechMark = student.log.length;
  student.say('interrupt');
  await student.waitForEvent((event, index) => index >= speechMark && event.event === 'speech_started', 2000);
  const speechStart = student.voicedStartedAt;
  await delay(2500);
  const stopMessage = readLiveMessages(student.log, speechMark).find((message) => message.type === 'stop');
  const heardWords = agent.events.slice(agentMark).some((event) => event.event === 'user_input_transcribed' && event.transcript.trim() !== '');
  return { tutorStopped: Boolean(stopMessage), stopAfterMs: stopMessage ? stopMessage.receivedAt - speechStart : null, heardWords };
}

// Each attempt is a new agent, because the SDK arms its wait once per link.
function makeFirstSpeechScenario(name, env) {
  return async () => {
    const outcomes = [];
    for (let attempt = 0; attempt < Math.min(REPEAT, 5); attempt++) {
      const summary = await withSession(`${name}_${attempt}`, { TURN_MODE: 'detector', POLICY: 'tiered', ...env }, async ({ agent, student }) => {
        await setScript('Once the ball leaves my hand, what makes it come down?');
        const mark = student.log.length;
        await student.say('question');
        await student.waitForEvent((event, index) => index >= mark && event.event === 'agent_audio_started', 8000);
        await delay(500);
        return speakOver({ agent, student });
      });
      outcomes.push(summary);
    }
    return { attempts: outcomes.length, stopped: outcomes.filter((outcome) => outcome.tutorStopped).length, heardWords: outcomes.filter((outcome) => outcome.heardWords).length, stopAfterMs: describeSeries(outcomes.flatMap((outcome) => outcome.stopAfterMs ?? [])) };
  };
}

async function driveRejoinOverReply({ agent, student }) {
  const outcomes = [];
  for (let attempt = 0; attempt < Math.min(REPEAT, 3); attempt++) {
    await setScript('Once the ball leaves my hand, what makes it come down?');
    const mark = student.log.length;
    await student.say('question');
    await student.waitForEvent((event, index) => index >= mark && event.event === 'agent_audio_started', 8000);
    await delay(800);
    const roomName = student.roomName;
    await student.leave();
    await delay(1000);
    await student.join(roomName);
    await delay(2000);
    const stillTalking = agent.events.findLast((event) => event.event === 'agent_state_changed')?.newState === 'speaking';
    outcomes.push({ stillTalking, ...(await speakOver({ agent, student })) });
    await waitForAgentState(agent, 'listening', 40000, agent.events.length);
    await delay(1500);
  }
  return { attempts: outcomes.length, stopped: outcomes.filter((outcome) => outcome.tutorStopped).length, heardWords: outcomes.filter((outcome) => outcome.heardWords).length, outcomes };
}

const SCENARIOS = {
  async turn_phrases() {
    return withSession('turn_phrases', { AGENT_REPLY: 'Right.', TURN_MODE: 'detector', EP_MIN_MS: '300', EP_MAX_MS: '1000' }, drivePhrases);
  },
  async question_uhhuh() {
    return withSession('question_uhhuh', { TURN_MODE: 'detector', POLICY: 'tiered', AGENT_REPLY: QUESTION_REPLY }, driveReactionOverQuestion('uhhuh', 'Uh-huh'));
  },
  async question_hmm() {
    return withSession('question_hmm', { TURN_MODE: 'detector', POLICY: 'tiered', AGENT_REPLY: QUESTION_REPLY, ...PATIENCE_TURN, FILLER_WAIT_MS: '8000' }, driveReactionOverQuestion('hmm', 'Hmm'));
  },
  async question_answer_over_last_word() {
    return withSession('question_answer_over_last_word', { TURN_MODE: 'detector', POLICY: 'tiered', AGENT_REPLY: QUESTION_REPLY }, driveAnswerOverLastWord);
  },
  async gap_talkover() {
    return withSession('gap_talkover', { TURN_MODE: 'detector', POLICY: 'tiered', FAKE_LLM_TTFT_MS: '800' }, driveTalkIntoTheGap);
  },
  async gap_talkover_late_final() {
    await setFakeSettings({ transcriptDelayMs: 200 });
    const summary = await withSession('gap_talkover_late_final', { TURN_MODE: 'detector', POLICY: 'tiered', FAKE_LLM_TTFT_MS: '800' }, driveTalkIntoTheGap);
    await setFakeSettings({ transcriptDelayMs: 0 });
    return summary;
  },
  async words_never_final() {
    return withSession('words_never_final', { TURN_MODE: 'detector', POLICY: 'tiered' }, driveWordsNeverFinal);
  },
  async tiered_interrupt() {
    return withSession('tiered_interrupt', { TURN_MODE: 'detector', POLICY: 'tiered' }, driveTieredInterrupts);
  },
  async tiered_backchannel() {
    return withSession('tiered_backchannel', { TURN_MODE: 'detector', POLICY: 'tiered' }, driveTieredBackchannels);
  },
  async reconnect() {
    return withSession('reconnect', { TURN_MODE: 'detector', CLOSE_ON_DISCONNECT: '0', AGENT_REPLY: SHORT_REPLY, INT_MIN_MS: '150' }, driveReconnect);
  },
  async beats_flush_chosen() {
    return withSession('beats_flush_chosen', { ...BEATS_TURN, BEAT_FLUSH: 'chosen' }, driveBeats);
  },
  async beats_flush_at_beat_end() {
    return withSession('beats_flush_at_beat_end', { ...BEATS_TURN, BEAT_FLUSH: 'beatEnd' }, driveBeats);
  },
  async beats_no_flush() {
    return withSession('beats_no_flush', { ...BEATS_TURN, BEAT_FLUSH: 'none' }, driveBeats);
  },
  async beats_sdk_transcript_on() {
    return withSession('beats_sdk_transcript_on', { ...BEATS_TURN, BEAT_FLUSH: 'chosen', SDK_TRANSCRIPT: '1' }, driveBeats);
  },
  async beats_speculative() {
    return withSession('beats_speculative', { ...BEATS_TURN, EP_MAX_MS: '3000', BEAT_FLUSH: 'chosen', PREEMPT: '1', FAKE_LLM_TTFT_MS: '300' }, driveSpeculativeBeats);
  },
  async policy_interrupt() {
    return withSession('policy_interrupt', { TURN_MODE: 'detector', POLICY: 'words', INT_MIN_MS: '150' }, driveInterrupts);
  },
  async policy_backchannel() {
    return withSession('policy_backchannel', { TURN_MODE: 'detector', POLICY: 'words', INT_MIN_MS: '150' }, driveBackchannel);
  },
  async typed() {
    return withSession('typed', { TURN_MODE: 'detector', INT_MIN_MS: '150' }, driveTyped);
  },
  async floor_detector_min0() {
    return withSession('floor_detector_min0', { ...FAST_TURN, EP_MIN_MS: '0' }, driveTurns);
  },
  async floor_detector_min100() {
    return withSession('floor_detector_min100', { ...FAST_TURN, EP_MIN_MS: '100' }, driveTurns);
  },
  async preempt_off() {
    return withSession('preempt_off', { ...FAST_TURN, EP_MIN_MS: '300', EP_MAX_MS: '1000', FAKE_LLM_TTFT_MS: '300', PREEMPT: '0' }, driveTurns);
  },
  async preempt_on() {
    return withSession('preempt_on', { ...FAST_TURN, EP_MIN_MS: '300', EP_MAX_MS: '1000', FAKE_LLM_TTFT_MS: '300', PREEMPT: '1' }, driveTurns);
  },
  async turn_vad() {
    return withSession('turn_vad', { AGENT_REPLY: SHORT_REPLY, TURN_MODE: 'vad', EP_MIN_MS: '300' }, driveTurns);
  },
  async turn_detector() {
    return withSession('turn_detector', { AGENT_REPLY: SHORT_REPLY, TURN_MODE: 'detector', EP_MIN_MS: '300' }, driveTurns);
  },
  async pause_vad() {
    return withSession('pause_vad', { AGENT_REPLY: SHORT_REPLY, TURN_MODE: 'vad', EP_MIN_MS: '300' }, drivePause);
  },
  async pause_detector_cap_1s() {
    return withSession('pause_detector_cap_1s', { AGENT_REPLY: SHORT_REPLY, TURN_MODE: 'detector', EP_MIN_MS: '300', EP_MAX_MS: '1000' }, drivePause);
  },
  async pause_filler_rule() {
    return withSession('pause_filler_rule', { AGENT_REPLY: SHORT_REPLY, TURN_MODE: 'detector', EP_MIN_MS: '300', EP_MAX_MS: '1000', FILLER_WAIT_MS: '3000' }, drivePause);
  },
  async pause_detector() {
    return withSession('pause_detector', { AGENT_REPLY: SHORT_REPLY, TURN_MODE: 'detector', EP_MIN_MS: '300' }, drivePause);
  },
  async interrupt_default() {
    return withSession('interrupt_default', { TURN_MODE: 'vad', INT_MIN_MS: '500' }, driveInterrupts);
  },
  async interrupt_fast() {
    return withSession('interrupt_fast', { TURN_MODE: 'vad', INT_MIN_MS: '150' }, driveInterrupts);
  },
  async backchannel_min_words() {
    return withSession('backchannel_min_words', { TURN_MODE: 'vad', INT_MIN_MS: '150', INT_MIN_WORDS: '2' }, driveBackchannel);
  },
  async backchannel_no_rule() {
    return withSession('backchannel_no_rule', { TURN_MODE: 'vad', INT_MIN_MS: '150', INT_MIN_WORDS: '0' }, driveBackchannel);
  },
  async false_interruption() {
    return withSession('false_interruption', { TURN_MODE: 'vad', INT_MIN_MS: '150', INT_FALSE_MS: '1000' }, driveFalseInterruption);
  },
  async one_word_transcript_0() {
    await setFakeSettings({ transcriptDelayMs: 0 });
    return withSession('one_word_transcript_0', { TURN_MODE: 'detector', POLICY: 'tiered' }, driveOneWord);
  },
  async one_word_transcript_300() {
    await setFakeSettings({ transcriptDelayMs: 300 });
    return withSession('one_word_transcript_300', { TURN_MODE: 'detector', POLICY: 'tiered' }, driveOneWord);
  },
  async one_word_transcript_600() {
    await setFakeSettings({ transcriptDelayMs: 600 });
    return withSession('one_word_transcript_600', { TURN_MODE: 'detector', POLICY: 'tiered' }, driveOneWord);
  },
  async one_word_transcript_900() {
    await setFakeSettings({ transcriptDelayMs: 900 });
    const summary = await withSession('one_word_transcript_900', { TURN_MODE: 'detector', POLICY: 'tiered' }, driveOneWord);
    await setFakeSettings({ transcriptDelayMs: 0 });
    return summary;
  },
  async noise_resume() {
    return withSession('noise_resume', { TURN_MODE: 'detector', POLICY: 'tiered' }, driveNoiseResume);
  },
  async patience_filler_8s() {
    return withSession('patience_filler_8s', { AGENT_REPLY: SHORT_REPLY, ...PATIENCE_TURN, FILLER_WAIT_MS: '8000' }, (context) => driveSilenceAfter({ ...context, speech: 'hmm', script: 'Hmm, let me think.', waitMs: 12000 }));
  },
  async patience_filler_then_answer() {
    return withSession('patience_filler_then_answer', { AGENT_REPLY: SHORT_REPLY, ...PATIENCE_TURN, FILLER_WAIT_MS: '8000' }, (context) => driveThinkingPause({ ...context, firstSpeech: 'hmm', firstScript: 'Hmm, let me think.', pauseMs: 5000 }));
  },
  async patience_filler_3s() {
    return withSession('patience_filler_3s', { AGENT_REPLY: SHORT_REPLY, ...PATIENCE_TURN, FILLER_WAIT_MS: '3000' }, (context) => driveSilenceAfter({ ...context, speech: 'hmm', script: 'Hmm, let me think.', waitMs: 12000 }));
  },
  async patience_words_silence_1s() {
    return withSession('patience_words_silence_1s', { AGENT_REPLY: SHORT_REPLY, ...PATIENCE_TURN }, (context) => driveSilenceAfter({ ...context, speech: 'itwould', script: 'It would land', waitMs: 8000 }));
  },
  async patience_words_silence_2s() {
    return withSession('patience_words_silence_2s', { AGENT_REPLY: SHORT_REPLY, ...PATIENCE_TURN, EP_MAX_MS: '2000' }, (context) => driveSilenceAfter({ ...context, speech: 'itwould', script: 'It would land', waitMs: 8000 }));
  },
  async patience_words_pause_1s() {
    return withSession('patience_words_pause_1s', { AGENT_REPLY: SHORT_REPLY, ...PATIENCE_TURN }, (context) => driveThinkingPause({ ...context, firstSpeech: 'itwould', firstScript: 'It would land', pauseMs: 1500 }));
  },
  async patience_words_pause_2s() {
    return withSession('patience_words_pause_2s', { AGENT_REPLY: SHORT_REPLY, ...PATIENCE_TURN, EP_MAX_MS: '2000' }, (context) => driveThinkingPause({ ...context, firstSpeech: 'itwould', firstScript: 'It would land', pauseMs: 1500 }));
  },
  async patience_phrases_2s() {
    return withSession('patience_phrases_2s', { AGENT_REPLY: 'Right.', ...PATIENCE_TURN, EP_MAX_MS: '2000' }, drivePhrases);
  },
  async beats_budget_voice_0() {
    await setFakeSettings({ ttsFirstAudioMs: 0 });
    return withSession('beats_budget_voice_0', { ...BEATS_TURN, BEAT_FLUSH: 'chosen', PREEMPT: '1', FAKE_LLM_TTFT_MS: '50', EP_MIN_MS: '900', EP_MAX_MS: '1000' }, driveSpeechEndToFirstAudio);
  },
  async beats_budget_voice_200() {
    await setFakeSettings({ ttsFirstAudioMs: 200 });
    const summary = await withSession('beats_budget_voice_200', { ...BEATS_TURN, BEAT_FLUSH: 'chosen', PREEMPT: '1', FAKE_LLM_TTFT_MS: '50', EP_MIN_MS: '900', EP_MAX_MS: '1000' }, driveSpeechEndToFirstAudio);
    await setFakeSettings({ ttsFirstAudioMs: 0 });
    return summary;
  },
  async beats_command_bytes_sdk_default() {
    return withSession('beats_command_bytes_sdk_default', { ...BEATS_TURN, BEAT_FLUSH: 'chosen', MODEL_TEXT_KIND: 'bytes', TTS_TRANSFORMS: 'sdk-default' }, driveCommandBytes);
  },
  async held_reaction_uncleared() {
    return withSession('held_reaction_uncleared', { TURN_MODE: 'detector', POLICY: 'tiered', CLEAR_HELD: '0' }, driveHeldReaction);
  },
  async held_reaction_cleared() {
    return withSession('held_reaction_cleared', { TURN_MODE: 'detector', POLICY: 'tiered' }, driveHeldReaction);
  },
  warmup_first_speech_sdk_default: makeFirstSpeechScenario('warmup_first_speech_sdk_default', { AEC_WARMUP: 'sdk-default' }),
  warmup_first_speech_off: makeFirstSpeechScenario('warmup_first_speech_off', {}),
  async warmup_rejoin_sdk_default() {
    return withSession('warmup_rejoin_sdk_default', { TURN_MODE: 'detector', POLICY: 'tiered', CLOSE_ON_DISCONNECT: '0', AEC_WARMUP: 'sdk-default' }, driveRejoinOverReply);
  },
  async warmup_rejoin_off() {
    return withSession('warmup_rejoin_off', { TURN_MODE: 'detector', POLICY: 'tiered', CLOSE_ON_DISCONNECT: '0' }, driveRejoinOverReply);
  },
  async budget_voice_0() {
    await setFakeSettings({ ttsFirstAudioMs: 0 });
    return withSession('budget_voice_0', { ...FAST_TURN, EP_MIN_MS: '300', EP_MAX_MS: '1000', PREEMPT: '1', FAKE_LLM_TTFT_MS: '50' }, driveSpeechEndToFirstAudio);
  },
  async budget_voice_200() {
    await setFakeSettings({ ttsFirstAudioMs: 200 });
    const summary = await withSession('budget_voice_200', { ...FAST_TURN, EP_MIN_MS: '300', EP_MAX_MS: '1000', PREEMPT: '1', FAKE_LLM_TTFT_MS: '50' }, driveSpeechEndToFirstAudio);
    await setFakeSettings({ ttsFirstAudioMs: 0 });
    return summary;
  },
  async budget_voice_200_preemptive_tts() {
    await setFakeSettings({ ttsFirstAudioMs: 200 });
    const summary = await withSession('budget_voice_200_preemptive_tts', { ...FAST_TURN, EP_MIN_MS: '300', EP_MAX_MS: '1000', PREEMPT: '1', PREEMPT_TTS: '1', FAKE_LLM_TTFT_MS: '50' }, driveSpeechEndToFirstAudio);
    await setFakeSettings({ ttsFirstAudioMs: 0 });
    return summary;
  },
  async beats_speculative_late_final() {
    await setFakeSettings({ transcriptDelayMs: 200 });
    const summary = await withSession('beats_speculative_late_final', { ...BEATS_TURN, EP_MAX_MS: '3000', BEAT_FLUSH: 'chosen', PREEMPT: '1', FAKE_LLM_TTFT_MS: '300' }, driveSpeculativeBeats);
    await setFakeSettings({ transcriptDelayMs: 0 });
    return summary;
  },
  async vendor_settings() {
    return withSession('vendor_settings', { TURN_MODE: 'detector' }, async () => {
      const { lastSpeechToTextQuery } = await getFakeSettings();
      return { speechToTextAsksNotToTrain: lastSpeechToTextQuery.includes('mip_opt_out=true') };
    });
  },
  async beats_command_bytes_off() {
    return withSession('beats_command_bytes_off', { ...BEATS_TURN, BEAT_FLUSH: 'chosen', MODEL_TEXT_KIND: 'bytes' }, driveCommandBytes);
  },
};

// How far LiveKit's own synced transcript sits behind the audio it describes, word by word.
function getTranscriptLags(log) {
  const lags = [];
  let pending = [];
  let chunks = [];
  const flush = () => {
    const count = Math.min(pending.length, chunks.length);
    for (let index = 0; index < count; index++) lags.push(chunks[index] - pending[index]);
    pending = [];
    chunks = [];
  };
  for (const event of log) {
    if (event.event === 'agent_audio_started') flush();
    if (event.event === 'word_burst') pending.push(event.at);
    if (event.event === 'transcription_stream_chunk' && event.final === 'false' && event.from !== 'student') chunks.push(event.at);
  }
  flush();
  return lags;
}

async function driveTurns({ agent, student }) {
  const toFirstAudio = [];
  const toThinking = [];
  for (let attempt = 0; attempt < REPEAT; attempt++) {
    await setScript('Once the ball leaves my hand, what makes it come down?');
    const agentMark = agent.events.length;
    const studentMark = student.log.length;
    await student.say('question');
    const speechEnd = student.voicedEndedAt;
    const thinking = await waitForAgentState(agent, 'thinking', 6000, agentMark);
    const audio = await student.waitForEvent((event, index) => index >= studentMark && event.event === 'agent_audio_started', 6000);
    if (thinking) toThinking.push(thinking.at - speechEnd);
    if (audio) toFirstAudio.push(audio.at - speechEnd);
    await waitForAgentState(agent, 'listening', 15000, agent.events.indexOf(thinking) + 1);
    await delay(600);
  }
  return { speechEndToThinkingMs: describeSeries(toThinking), speechEndToFirstAudioMs: describeSeries(toFirstAudio), builtInTranscriptLagMs: describeSeries(getTranscriptLags(student.log)) };
}

async function drivePhrases({ agent, student }) {
  const perPhrase = {};
  for (const [name, text] of SPOKEN_PHRASES) {
    const toFirstAudio = [];
    const probabilities = [];
    for (let attempt = 0; attempt < REPEAT; attempt++) {
      await setScript(text);
      const agentMark = agent.events.length;
      const studentMark = student.log.length;
      await student.say(name);
      const speechEnd = student.voicedEndedAt;
      const audio = await student.waitForEvent((event, index) => index >= studentMark && event.event === 'agent_audio_started', 6000);
      if (audio) toFirstAudio.push(audio.at - speechEnd);
      const prediction = agent.events.slice(agentMark).find((event) => event.event === 'eot_prediction');
      if (prediction?.probability !== undefined) probabilities.push(Math.round(prediction.probability * 100) / 100);
      await waitForAgentState(agent, 'listening', 8000, agentMark + 1);
      await delay(800);
    }
    perPhrase[name] = { speechEndToFirstAudioMs: describeSeries(toFirstAudio), attemptsMs: toFirstAudio, hitCap: toFirstAudio.filter((value) => value >= CAP_HIT_MS).length, probabilities };
  }
  return { perPhrase };
}

async function drivePause({ agent, student }) {
  const outcomes = [];
  for (let attempt = 0; attempt < Math.min(REPEAT, 5); attempt++) {
    await setScript('Hmm, let me think.');
    const agentMark = agent.events.length;
    await student.say('hmm');
    const firstPartEnd = student.voicedEndedAt;
    await delay(1200);
    const jumpedIn = agent.events.slice(agentMark).find((event) => event.event === 'agent_state_changed' && event.newState === 'thinking');
    await setScript('It lands twice as far.');
    await student.say('twice');
    const thinking = await waitForAgentState(agent, 'thinking', 6000, agentMark);
    outcomes.push({ agentJumpedInDuringPause: Boolean(jumpedIn), thinkingAfterFirstPartMs: thinking ? thinking.at - firstPartEnd : null });
    await waitForAgentState(agent, 'listening', 15000, agent.events.indexOf(thinking) + 1);
    await delay(1000);
    await delay(800);
  }
  return { attempts: outcomes.length, jumpedIn: outcomes.filter((outcome) => outcome.agentJumpedInDuringPause).length, outcomes };
}

async function startLongReply({ agent, student }) {
  await setScript('Once the ball leaves my hand, what makes it come down?');
  const agentMark = agent.events.length;
  const studentMark = student.log.length;
  await student.say('question');
  const speaking = await student.waitForEvent((event, index) => index >= studentMark && event.event === 'agent_audio_started', 8000);
  await delay(2500);
  return { agentMark, studentMark, speaking };
}

async function driveInterrupts({ agent, student }) {
  const toLastAudio = [];
  const toAgentListening = [];
  const words = [];
  for (let attempt = 0; attempt < REPEAT; attempt++) {
    const { agentMark, studentMark } = await startLongReply({ agent, student });
    await setScript('Wait, then why does it come down?');
    const stateMark = agent.events.length;
    const burstsBefore = student.audio.burstCount;
    const spoken = student.say('interrupt');
    await student.waitForEvent((event, index) => index >= studentMark && event.event === 'speech_started' && event.speech === 'interrupt', 2000);
    const speechStart = student.voicedStartedAt;
    const left = await waitForAgentEvent(agent, (event) => event.event === 'agent_state_changed' && event.oldState === 'speaking', 4000, stateMark);
    await spoken;
    await delay(400);
    if (left) toAgentListening.push(left.at - speechStart);
    const firstStop = student.log.slice(studentMark).find((event) => event.event === 'agent_audio_stopped' && event.lastAudibleAt > speechStart);
    if (firstStop) toLastAudio.push(firstStop.lastAudibleAt - speechStart);
    const heardBursts = student.audio.burstCount;
    const item = agent.events.slice(agentMark).find((event) => event.event === 'conversation_item_added' && event.role === 'assistant');
    words.push({ burstsHeardInTurn: student.log.slice(studentMark).filter((event) => event.event === 'word_burst').length, reportedText: item?.text ?? null, reportedWordCount: item?.text ? item.text.split(/\s+/).filter(Boolean).length : null, reportedInterrupted: item?.interrupted ?? null, burstsBefore, heardBursts });
    await waitForAgentState(agent, 'listening', 15000, stateMark + 1);
    await delay(1500);
  }
  return { speechStartToAgentStopMs: describeSeries(toAgentListening), speechStartToLastAudioMs: describeSeries(toLastAudio), words };
}

async function driveBackchannel({ agent, student }) {
  const outcomes = [];
  for (let attempt = 0; attempt < Math.min(REPEAT, 5); attempt++) {
    await startLongReply({ agent, student });
    await setScript('Uh-huh');
    const stateMark = agent.events.length;
    await student.say('uhhuh');
    const speechStart = student.voicedStartedAt;
    await delay(1000);
    const stopped = agent.events.slice(stateMark).find((event) => event.event === 'agent_state_changed' && event.oldState === 'speaking');
    outcomes.push({ agentStopped: Boolean(stopped), stoppedAfterMs: stopped ? stopped.at - speechStart : null, stillAudible: Date.now() - student.audio.lastAudibleAt < 200 });
    if (!stopped) await waitForAgentState(agent, 'listening', 40000, stateMark);
    await delay(1500);
  }
  return { attempts: outcomes.length, stopped: outcomes.filter((outcome) => outcome.agentStopped).length, outcomes };
}

async function driveTyped({ agent, student }) {
  const outcomes = [];
  for (let attempt = 0; attempt < Math.min(REPEAT, 5); attempt++) {
    const agentMark = agent.events.length;
    const studentMark = student.log.length;
    const sentAt = Date.now();
    await student.room.localParticipant.sendText('Why does it come down?', { topic: 'lk.chat' });
    const audio = await student.waitForEvent((event, index) => index >= studentMark && event.event === 'agent_audio_started', 6000);
    await delay(2500);
    const stateMark = agent.events.length;
    const interruptedAt = Date.now();
    await student.room.localParticipant.sendText('Wait, what about gravity?', { topic: 'lk.chat' });
    const stopped = await waitForAgentEvent(agent, (event) => event.event === 'conversation_item_added' && event.role === 'assistant' && event.interrupted === true, 3000, stateMark);
    const secondReply = await waitForAgentEvent(agent, (event) => event.event === 'llm_node_started', 6000, stateMark);
    await delay(500);
    const speakingIndex = agent.events.findLastIndex((event) => event.event === 'agent_state_changed' && event.newState === 'speaking');
    await waitForAgentState(agent, 'listening', 40000, speakingIndex + 1);
    await delay(1000);
    const userItems = agent.events.slice(agentMark).filter((event) => event.event === 'conversation_item_added' && event.role === 'user').map((event) => event.text);
    outcomes.push({ typedToFirstAudioMs: audio ? audio.at - sentAt : null, typedInterruptToStopMs: stopped ? stopped.at - interruptedAt : null, secondMessageStartedReply: Boolean(secondReply), userItems });
  }
  return {
    attempts: outcomes.length,
    replyStarted: outcomes.filter((outcome) => outcome.typedToFirstAudioMs !== null).length,
    tutorStopped: outcomes.filter((outcome) => outcome.typedInterruptToStopMs !== null).length,
    secondMessageAnswered: outcomes.filter((outcome) => outcome.secondMessageStartedReply && outcome.userItems.length === 2).length,
    typedToFirstAudioMs: describeSeries(outcomes.map((outcome) => outcome.typedToFirstAudioMs).filter((value) => value !== null)),
    typedInterruptToStopMs: describeSeries(outcomes.map((outcome) => outcome.typedInterruptToStopMs).filter((value) => value !== null)),
    outcomes,
  };
}

async function driveFalseInterruption({ agent, student }) {
  const outcomes = [];
  for (let attempt = 0; attempt < Math.min(REPEAT, 5); attempt++) {
    await startLongReply({ agent, student });
    await setScript('');
    const stateMark = agent.events.length;
    const studentMark = student.log.length;
    await student.say('uhhuh');
    const speechStart = student.voicedStartedAt;
    const falseEvent = await waitForAgentEvent(agent, (event) => event.event === 'agent_false_interruption', 5000, stateMark);
    await delay(1200);
    const stops = student.log.slice(studentMark).filter((event) => event.event === 'agent_audio_stopped');
    const restarts = student.log.slice(studentMark).filter((event) => event.event === 'agent_audio_started');
    outcomes.push({ reportedFalse: Boolean(falseEvent), resumed: falseEvent?.resumed ?? null, falseAfterMs: falseEvent ? falseEvent.at - speechStart : null, audioStopped: stops.length > 0, audioRestarted: restarts.length > 0 });
    await waitForAgentState(agent, 'listening', 40000, stateMark);
    await delay(1500);
  }
  return { attempts: outcomes.length, outcomes };
}

const fakes = spawn('node', [join(HERE, 'fake-providers.mjs')], { stdio: 'ignore' });
await delay(500);
const isBeatsAgent = args.sdk === 'beats';
const NODE_ONLY = ['question_uhhuh', 'question_hmm', 'question_answer_over_last_word', 'gap_talkover', 'gap_talkover_late_final', 'words_never_final', 'pause_detector_cap_1s', 'pause_filler_rule', 'one_word_transcript_0', 'one_word_transcript_300', 'one_word_transcript_600', 'one_word_transcript_900', 'noise_resume', 'patience_filler_8s', 'patience_filler_then_answer', 'patience_filler_3s', 'patience_words_silence_1s', 'patience_words_silence_2s', 'patience_words_pause_1s', 'patience_words_pause_2s', 'patience_phrases_2s', 'held_reaction_uncleared', 'held_reaction_cleared', 'warmup_first_speech_sdk_default', 'warmup_first_speech_off', 'warmup_rejoin_sdk_default', 'warmup_rejoin_off', 'budget_voice_0', 'budget_voice_200', 'budget_voice_200_preemptive_tts', 'vendor_settings'];
const names = args.only ? args.only.split(',') : Object.keys(SCENARIOS).filter((name) => name.startsWith('beats_') === isBeatsAgent && !(args.sdk === 'python' && NODE_ONLY.includes(name)));
const summaries = {};
try {
  for (const name of names) summaries[name] = await SCENARIOS[name]();
} finally {
  fakes.kill('SIGTERM');
  save('summary', { sdk: args.sdk, repeat: REPEAT, ranAt: new Date().toISOString(), summaries });
  await disposeNative();
}
process.exit(0);
