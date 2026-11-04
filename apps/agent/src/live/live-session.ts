import type { tts } from '@livekit/agents';
import { randomUUID } from 'node:crypto';
import { type AgentMessage, type Beat, type BeatId, type BrowserMessage, type PlayReport, type SessionEvent, type TurnId } from '@astra/contracts';
import { createEchoFilter } from './echo-filter.ts';
import { createHoldGate } from './hold-gate.ts';
import { createLinkWatch, type LinkWatch } from './link-watch.ts';
import { createNoiseWatch } from './noise-watch.ts';
import { getTakeBeat, makeTakeVoice, type StoredTake, type TakePicker, type TakeUse } from './reactions.ts';
import { getResumeBeats } from './resume-plan.ts';
import { createSessionLog, isFurtherReport } from './session-log.ts';
import { type SpokenTurn, speakTurn, type TurnMessenger } from './speak-turn.ts';
import type { TutorBrain } from './stand-in-tutor.ts';
import { getNextTurnState, INITIAL_TURN_STATE, type TimerName, type TurnAction, type TurnEvent, type TurnState } from './turn-rule.ts';
import { hasWords } from './turn-words.ts';
import { getSteadyNowMs, type VoiceLine } from './voice-line.ts';

const REPORT_WAIT_MS = 1000;
const REPORT_POLL_MS = 10;
const LINK_CHECK_MS = 250;
export const VOICE_STALL_MS = 3000;
/** A room closes after this long with no student speech or typing and no tutor speech, because a forgotten tab keeps paying for its job and room. */
export const QUIET_ROOM_LIMIT_MS = 10 * 60_000;
/** A student reading the board quietly gets this long to say so before the room closes. */
const QUIET_WARNING_LEAD_MS = 60_000;
/** The page's hold limit, and a margin for a page that vanished with a key down. */
const HOLD_GIVE_UP_MS = 75_000;
/** Muse answers an ended line in about 350 ms, so past this it is not going to. */
const LINE_FLUSH_GIVE_UP_MS = 3000;
/** Muse closes about 20 ms after its last final, and a slow close must not hold up the answer. */
const FLUSH_AFTER_FINAL_MS = 200;
/** Long enough to read as a new thought, not as more of the answer. */
const INVITE_AFTER_ANSWER_MS = 1500;

export type EarsEvent = { type: 'voiceStarted' } | { type: 'voiceEnded' } | { type: 'words'; text: string; isFinal: boolean } | { type: 'turnDecided'; text: string } | { type: 'lineFlushed' };

export type TraceNote = (name: string, fields?: Record<string, unknown>) => void;

export interface LiveSessionOptions {
  messenger: TurnMessenger;
  line: VoiceLine;
  voice: tts.TTS;
  tutor: TutorBrain;
  takes: TakePicker;
  allTakes: readonly StoredTake[];
  setTurnCap(ms: number): void;
  endLine?(): void;
  /** The room stayed quiet to its limit, and the session has told the browser. */
  onQuietLimit?(): void;
  quietLimitMs?: number;
  getNowMs?(): number;
  trace?: TraceNote;
}

export interface LiveSession {
  onEars(event: EarsEvent): void;
  onBrowser(message: BrowserMessage): void;
  getLog(): readonly SessionEvent[];
  doesStudentHearAudio(): boolean;
  close(): Promise<void>;
}

interface Speaking {
  turnId: TurnId;
  isReply: boolean;
  canResume: boolean;
  spoken: SpokenTurn;
  beats: Beat[];
  reports: Map<BeatId, PlayReport>;
  hasSound: boolean;
  /** Part of this reply reached the student already, in the turn this one resumes. */
  continuesHeardReply: boolean;
  isOver: boolean;
}

interface Thought {
  controller: AbortController;
  iterator: AsyncIterator<Beat>;
}

async function* readThought(thought: Thought | null): AsyncGenerator<Beat> {
  if (!thought) return;
  for (;;) {
    const { done, value } = await thought.iterator.next();
    if (done) return;
    yield value;
  }
}

async function* getResumedThen(resumed: readonly Beat[], thought: Thought | null): AsyncGenerator<Beat> {
  yield* resumed;
  yield* readThought(thought);
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Wires what the student does to what the tutor says. The rule decides, this runs its actions, and the voice line keeps every turn apart.
export function createLiveSession({ messenger, line, voice, tutor, takes, allTakes, setTurnCap, endLine = () => {}, onQuietLimit = () => {}, quietLimitMs = QUIET_ROOM_LIMIT_MS, getNowMs = getSteadyNowMs, trace = () => {} }: LiveSessionOptions): LiveSession {
  const startedAtMs = getNowMs();
  // A new job in the same room restarts this count, and a page ignores a turn it has seen, so each job's turns carry their own name.
  const jobTag = randomUUID().slice(0, 8);
  const echo = createEchoFilter();
  const takeVoices = new Map(allTakes.map((take) => [take.id, makeTakeVoice(take).makeTts()]));
  takeVoices.forEach((take) => take.on('error', (error) => trace('voiceError', { problem: String(error.error) })));
  const timers = new Map<TimerName, ReturnType<typeof setTimeout>>();
  const beatsByTurn = new Map<TurnId, readonly Beat[]>();
  const speakingByTurn = new Map<TurnId, Speaking>();
  const queuedEvents: TurnEvent[] = [];
  let state: TurnState = INITIAL_TURN_STATE;
  let isDispatching = false;
  let turnCount = 0;
  let audioRunning = false;
  let reaction: Speaking | null = null;
  let reply: Speaking | null = null;
  let cut: Speaking | null = null;
  let thought: Thought | null = null;
  let resumeTicket = 0;
  let hasGreeted = false;
  let voiceStall: ReturnType<typeof setTimeout> | undefined;
  let quietWarning: ReturnType<typeof setTimeout> | undefined;
  let quietLimit: ReturnType<typeof setTimeout> | undefined;
  let hasWarnedOfQuiet = false;
  const holdGate = createHoldGate();
  const noiseWatch = createNoiseWatch();
  const lineWhileAway: TurnEvent[] = [];
  let hasEverHeld = false;
  let holdClockId: string | null = null;
  let wasLastCutWordless = false;
  let holdGiveUp: ReturnType<typeof setTimeout> | undefined;
  let flushGiveUp: ReturnType<typeof setTimeout> | undefined;
  let inviteTimer: ReturnType<typeof setTimeout> | undefined;
  let talkInvitation: 'notAsked' | 'wanted' | 'settled' = 'notAsked';

  const noteSomethingHappened = () => {
    clearTimeout(quietWarning);
    clearTimeout(quietLimit);
    if (hasWarnedOfQuiet) messenger.send({ type: 'quietWarning', isOn: false });
    hasWarnedOfQuiet = false;
    quietWarning = setTimeout(() => {
      trace('quietWarned');
      hasWarnedOfQuiet = true;
      messenger.send({ type: 'quietWarning', isOn: true });
    }, quietLimitMs - Math.min(QUIET_WARNING_LEAD_MS, quietLimitMs / 2));
    quietLimit = setTimeout(() => {
      trace('quietLimit');
      messenger.send({ type: 'closingForQuiet' });
      onQuietLimit();
    }, quietLimitMs);
  };
  noteSomethingHappened();

  const log = createSessionLog({
    getNowMs: () => getNowMs() - startedAtMs,
    getBeat: (turnId, beatId) => beatsByTurn.get(turnId)?.find((beat) => beat.id === beatId),
    onRefused: (problem) => trace('reportRefused', { problem }),
  });

  const dispatch = (event: TurnEvent) => {
    queuedEvents.push(event);
    if (isDispatching) return;
    isDispatching = true;
    for (let next = queuedEvents.shift(); next !== undefined; next = queuedEvents.shift()) {
      const step = getNextTurnState(state, next);
      state = step.state;
      step.actions.forEach(runAction);
    }
    isDispatching = false;
  };

  const getAudibleTurn = () => reaction?.turnId ?? reply?.turnId ?? null;

  const sendYield = (isYielding: boolean) => {
    const turnId = getAudibleTurn();
    trace(isYielding ? 'yieldDecided' : 'unyieldDecided', { turnId });
    if (turnId) messenger.sendOnBothChannels({ type: 'yield', turnId, isYielding });
  };

  // The rule's own timer for sound over the tutor, with its wait already up, because the student has the floor.
  const cutForHold = () => dispatch({ type: 'timer', name: 'wordlessStop' });

  const onSpeechStarted = (speaking: Speaking) => {
    speaking.hasSound = true;
    dispatch({ type: 'tutorStarted', isReply: speaking.isReply });
    if (holdGate.isHolding()) cutForHold();
    if (state.phase === 'yielding') messenger.sendOnBothChannels({ type: 'yield', turnId: speaking.turnId, isYielding: true });
  };

  const onSpeechFinished = (speaking: Speaking) => {
    speaking.isOver = true;
    if (speaking === reaction) reaction = null;
    if (speaking === reply) {
      reply = null;
      thought = null;
      // Only a reply that played out has answered the student's words. A stored line, like the prompt after a filler, has not, and a resume with nothing left to say has, because its reply was already heard.
      if (speaking.canResume && (speaking.hasSound || speaking.continuesHeardReply)) {
        dispatch({ type: 'replyHeardOut' });
        if (talkInvitation === 'wanted') inviteTimer = setTimeout(inviteToTalk, INVITE_AFTER_ANSWER_MS);
      }
    }
    if (reaction || reply) {
      if (reply && !reply.hasSound && !reaction) dispatch({ type: 'tutorThinking' });
      return;
    }
    dispatch({ type: 'tutorFinished' });
  };

  function speak({ voiceToUse, beats, isReply, canResume, kind, continuesHeardReply = false }: { voiceToUse: tts.TTS; beats: Iterable<Beat> | AsyncIterable<Beat>; isReply: boolean; canResume: boolean; kind: string; continuesHeardReply?: boolean }): Speaking {
    turnCount += 1;
    noteSomethingHappened();
    const turnId = `turn-${jobTag}-${turnCount}` as TurnId;
    const speakingBeats: Beat[] = [];
    beatsByTurn.set(turnId, speakingBeats);
    trace('turnStarted', { turnId, kind });
    const speaking: Speaking = {
      turnId,
      isReply,
      canResume,
      beats: speakingBeats,
      reports: new Map(),
      hasSound: false,
      continuesHeardReply,
      isOver: false,
      spoken: speakTurn({
        voice: voiceToUse,
        line,
        messenger,
        turnId,
        beats,
        getNowMs,
        onBeatStarted: (beat) => speakingBeats.push(beat),
        onFirstAudioRead: (atMs) => {
          if (canResume) clearTimeout(voiceStall);
          trace('firstAudioRead', { turnId, kind, atMs });
        },
        onFrameCaptured: ({ capturedAtMs }) => {
          if (speaking.hasSound) return;
          trace('firstFrameCaptured', { turnId, kind, atMs: capturedAtMs });
          onSpeechStarted(speaking);
        },
        onWords: ({ atMs, words }) => echo.noteTutorWords(words.map((word) => word.text), atMs),
        onFailure: (failure) => onVoiceFailed(speaking, String(failure)),
        onGap: (gap) => {
          trace('audioGap', { turnId, ...gap });
          if (!canResume) return;
          clearTimeout(voiceStall);
          if (gap.ms === undefined) watchVoice(speaking);
        },
      }),
    };
    speakingByTurn.set(turnId, speaking);
    if (canResume) watchVoice(speaking);
    void speaking.spoken.finished.then(() => {
      trace('turnFinished', { turnId, kind });
      noteSomethingHappened();
      onSpeechFinished(speaking);
    });
    return speaking;
  };

  // A failing voice must not end the session or leave the student waiting, so the turn is cut and the tutor says what happened in a stored line.
  function onVoiceFailed(speaking: Speaking, why: string): void {
    trace('voiceFailed', { why, turnId: speaking.turnId });
    clearTimeout(voiceStall);
    speaking.spoken.stop();
    if (speaking !== reply) return;
    dropThought();
    reply = speakTake('voiceLost', { isReply: true });
  }

  function watchVoice(speaking: Speaking): void {
    clearTimeout(voiceStall);
    voiceStall = setTimeout(() => onVoiceFailed(speaking, 'the voice sent nothing'), VOICE_STALL_MS);
  }

  function speakTake(use: TakeUse, { isReply }: { isReply: boolean }): Speaking | null {
    const take = takes.next(use);
    const voiceToUse = take && takeVoices.get(take.id);
    if (!take || !voiceToUse) return null;
    return speak({ voiceToUse, beats: [getTakeBeat(take, `${take.id}-${turnCount + 1}`)], isReply, canResume: false, kind: take.use });
  }

  const react = () => {
    trace('reactDecided');
    messenger.send({ type: 'heard' });
    if (!reaction) reaction = speakTake('reaction', { isReply: false });
  };

  // One line, once, to a student who has only typed.
  function inviteToTalk(): void {
    if (talkInvitation !== 'wanted' || reply || reaction || thought || !audioRunning || state.isVoiceOn || holdGate.isHolding()) return;
    talkInvitation = 'settled';
    reaction = speakTake('talkInvitation', { isReply: false });
    void reaction?.spoken.finished.then(() => messenger.send({ type: 'talkInvited' }));
  }

  function dropThought(): void {
    thought?.controller.abort();
    thought = null;
  }

  const startReply = (text: string) => {
    resumeTicket += 1;
    reply?.spoken.stop();
    cut = null;
    dropThought();
    const controller = new AbortController();
    const started: Thought = { controller, iterator: tutor.reply({ text }, controller.signal)[Symbol.asyncIterator]() };
    thought = started;
    reply = speak({ voiceToUse: voice, beats: readThought(started), isReply: true, canResume: true, kind: 'reply' });
  };

  const stopSpeech = (action: TurnAction & { do: 'stop' }) => {
    trace('stopDecided', { reason: action.reason, turnId: getAudibleTurn() });
    wasLastCutWordless = action.reason === 'no words';
    clearTimeout(voiceStall);
    resumeTicket += 1;
    reaction?.spoken.stop();
    reaction = null;
    if (reply) {
      reply.spoken.stop();
      cut = action.keepsThought ? reply : null;
      reply = null;
    }
    if (!action.keepsThought) dropThought();
    dispatch({ type: 'tutorFinished' });
  };

  const hasEveryReport = (speaking: Speaking) => [...speaking.spoken.getWordsSent().keys()].every((beatId) => speaking.reports.has(beatId));

  const resume = async () => {
    const cutTurn = cut;
    cut = null;
    if (!cutTurn) return;
    const ticket = (resumeTicket += 1);
    dispatch({ type: 'tutorThinking' });
    const deadline = getNowMs() + REPORT_WAIT_MS;
    while (!hasEveryReport(cutTurn) && getNowMs() < deadline) await delay(REPORT_POLL_MS);
    if (ticket !== resumeTicket) return;
    const beats = getResumeBeats({ beats: cutTurn.beats, reports: cutTurn.reports, wordsSent: cutTurn.spoken.getWordsSent(), resumeTag: `r${turnCount}` });
    trace('resumeStarted', { fromTurn: cutTurn.turnId, beats: beats.length, reported: hasEveryReport(cutTurn) });
    if (beats.length === 0 && !thought) return dispatch({ type: 'tutorFinished' });
    reply = speak({ voiceToUse: voice, beats: getResumedThen(beats, thought), isReply: true, canResume: true, kind: 'resume', continuesHeardReply: cutTurn.hasSound || cutTurn.continuesHeardReply });
  };

  const startNamedTimer = (name: TimerName, ms: number) => {
    clearTimeout(timers.get(name));
    timers.set(name, setTimeout(() => dispatch({ type: 'timer', name }), ms));
  };

  function runAction(action: TurnAction): void {
    switch (action.do) {
      case 'yield':
        return sendYield(true);
      case 'unyield':
        return sendYield(false);
      case 'stop':
        return stopSpeech(action);
      case 'resume':
        if (wasLastCutWordless && !hasEverHeld && noiseWatch.noteWordlessCut(getNowMs())) messenger.send({ type: 'keptBeingCut' });
        wasLastCutWordless = false;
        return void resume();
      case 'react':
        return react();
      case 'reply':
        trace('replyDecided', { via: action.via, words: action.text.split(/\s+/).length, text: action.text });
        return startReply(action.text);
      case 'startTimer':
        return startNamedTimer(action.name, action.ms);
      case 'cancelTimer':
        return clearTimeout(timers.get(action.name));
      case 'setTurnCap':
        return setTurnCap(action.ms);
      case 'promptAfterSilence':
        reply = speakTake('prompt', { isReply: true });
    }
  }

  const link: LinkWatch = createLinkWatch({
    onLost() {
      trace('linkLost');
      dispatch({ type: 'linkLost' });
    },
    onBack() {
      trace('linkBack');
      dispatch({ type: 'linkBack' });
      lineWhileAway.splice(0).forEach(dispatch);
    },
  });
  const linkChecker = setInterval(() => link.check(getNowMs()), LINK_CHECK_MS);

  const onReport = (message: BrowserMessage & { type: 'played' }) => {
    const speaking = speakingByTurn.get(message.turnId);
    if (!speaking) return;
    const known = speaking.reports.get(message.beatId);
    if (known && !isFurtherReport(message, known)) return trace('reportIgnored', { turnId: message.turnId, beatId: message.beatId, playedWords: message.playedWords });
    log.write(message);
    speaking.reports.set(message.beatId, message);
    trace('played', { turnId: message.turnId, beatId: message.beatId, ending: message.ending, playedWords: message.playedWords, firedCues: message.firedCueMs.length });
    const isLiveTurn = speaking === reply || speaking === reaction;
    if (message.ending === 'interrupted' && isLiveTurn && state.phase !== 'away') {
      trace('browserFroze', { turnId: message.turnId });
      dispatch({ type: 'linkLost' });
      dispatch({ type: 'linkBack' });
    }
  };

  // The page says it hears the tutor's track, so the first line loses no sound.
  const greet = () => {
    if (hasGreeted || reply || reaction) return;
    hasGreeted = true;
    reply = speakTake('greeting', { isReply: true });
  };

  const dispatchAll = (events: TurnEvent[]) => events.forEach(dispatch);

  const onHoldStarted = (clockId: string) => {
    hasEverHeld = true;
    holdClockId = clockId;
    noteSomethingHappened();
    clearTimeout(flushGiveUp);
    clearTimeout(holdGiveUp);
    holdGiveUp = setTimeout(onLineEnded, HOLD_GIVE_UP_MS);
    trace('holdStarted');
    dispatchAll(holdGate.onHoldStarted());
  };

  // The turn rule ignores words decided while the link is down, and this student will not say them again.
  const onLineFlushed = () => {
    clearTimeout(flushGiveUp);
    const decided = holdGate.onLineFlushed();
    if (state.phase === 'away') lineWhileAway.push(...decided);
    else dispatchAll(decided);
  };

  function onLineEnded(): void {
    clearTimeout(holdGiveUp);
    noteSomethingHappened();
    trace('lineEnded');
    dispatchAll(holdGate.onLineEnded());
    endLine();
    flushGiveUp = setTimeout(onLineFlushed, LINE_FLUSH_GIVE_UP_MS);
  }

  const onHello = (message: BrowserMessage & { type: 'hello' }) => {
    const isHeldPageGone = holdGate.isHolding() && message.clockId !== holdClockId;
    if (isHeldPageGone) onLineEnded();
    if (message.wantsGreeting && !holdGate.isHolding()) greet();
    if (message.invitesTalk && talkInvitation === 'notAsked') talkInvitation = 'wanted';
  };

  const onAudioState = (isRunning: boolean) => {
    const wasRunning = audioRunning;
    audioRunning = isRunning;
    trace('audioState', { isRunning });
    if (wasRunning && !isRunning) dispatch({ type: 'linkLost' });
    if (!wasRunning && isRunning && state.phase === 'away') dispatch({ type: 'linkBack' });
  };

  return {
    onEars(event) {
      if (event.type === 'lineFlushed') return onLineFlushed();
      trace(event.type, event.type === 'words' ? { isFinal: event.isFinal, words: event.text.split(/\s+/).length, text: event.text } : {});
      if (event.type === 'words' && state.tutor === 'speaking' && echo.isEcho(event.text, getNowMs())) {
        trace('echoHeard');
        return dispatch({ type: 'echoHeard' });
      }
      if (event.type === 'words') messenger.send({ type: 'studentWords', text: event.text, isFinal: event.isFinal } satisfies AgentMessage);
      if (event.type === 'words' && hasWords(event.text)) noteSomethingHappened();
      const wasWaitingForLine = holdGate.isWaitingForLine();
      dispatchAll(holdGate.onEars(event));
      if (wasWaitingForLine && event.type === 'words' && event.isFinal) {
        clearTimeout(flushGiveUp);
        flushGiveUp = setTimeout(onLineFlushed, FLUSH_AFTER_FINAL_MS);
      }
    },
    onBrowser(message) {
      if (message.type === 'played') return onReport(message);
      if (message.type !== 'pulse') log.write(message);
      if (message.type === 'typed' || message.type === 'acted' || message.type === 'stillHere') noteSomethingHappened();
      if (message.type === 'questionHeard') dispatch({ type: 'questionHeard' });
      if (message.type === 'typed') dispatch({ type: 'typed', text: message.text });
      if (message.type === 'hello') onHello(message);
      if (message.type === 'holdStarted') onHoldStarted(message.clockId);
      if (message.type === 'lineEnded') onLineEnded();
      if (message.type === 'talkPressed') talkInvitation = 'settled';
      if (message.type === 'pulse') link.notePulse(message.hearsAgent, getNowMs());
      if (message.type === 'audioState') onAudioState(message.isRunning);
    },
    getLog: () => log.getEvents(),
    doesStudentHearAudio: () => audioRunning,
    async close() {
      clearInterval(linkChecker);
      clearTimeout(voiceStall);
      clearTimeout(quietWarning);
      clearTimeout(quietLimit);
      clearTimeout(holdGiveUp);
      clearTimeout(flushGiveUp);
      clearTimeout(inviteTimer);
      timers.forEach((timer) => clearTimeout(timer));
      reaction?.spoken.stop();
      reply?.spoken.stop();
      dropThought();
      await Promise.allSettled([reaction?.spoken.finished, reply?.spoken.finished]);
      await Promise.all([...takeVoices.values()].map((take) => take.close()));
    },
  };
}
