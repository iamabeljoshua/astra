import type { tts } from '@livekit/agents';
import { type AgentMessage, type Beat, type BeatId, type BrowserMessage, type PlayReport, type SessionEvent, type TurnId } from '@astra/contracts';
import { createEchoFilter } from './echo-filter.ts';
import { createLinkWatch, type LinkWatch } from './link-watch.ts';
import { getTakeBeat, makeTakeVoice, type StoredTake, type TakePicker, type TakeUse } from './reactions.ts';
import { getResumeBeats } from './resume-plan.ts';
import { createMessageGate } from './message-gate.ts';
import { createSessionLog } from './session-log.ts';
import { createTypedGate } from './typed-gate.ts';
import { type SpokenTurn, speakTurn, type TurnMessenger } from './speak-turn.ts';
import type { TutorBrain } from '../tutor/brain.ts';
import { createBoardWork } from '../tutor/watcher/board-work.ts';
import type { WordMeaning } from '../tutor/watcher/watch-rule.ts';
import { getNextTurnState, INITIAL_TURN_STATE, type TimerName, type TurnAction, type TurnEvent, type TurnState } from './turn-rule.ts';
import { getSteadyNowMs, type VoiceLine } from './voice-line.ts';

const REPORT_WAIT_MS = 1000;
const REPORT_POLL_MS = 10;
const LINK_CHECK_MS = 250;
export const VOICE_STALL_MS = 3000;

export type EarsEvent = { type: 'voiceStarted' } | { type: 'voiceEnded' } | { type: 'words'; text: string; isFinal: boolean } | { type: 'turnDecided'; text: string };

export type TraceNote = (name: string, fields?: Record<string, unknown>) => void;

export interface LiveSessionOptions {
  messenger: TurnMessenger;
  line: VoiceLine;
  voice: tts.TTS;
  tutor: TutorBrain;
  takes: TakePicker;
  allTakes: readonly StoredTake[];
  setTurnCap(ms: number): void;
  getNowMs?(): number;
  trace?: TraceNote;
  /** What a student's unsent words mean, read by a cheap model. */
  readMeaning?(words: string): Promise<WordMeaning | null>;
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
  isDry: boolean;
  isOver: boolean;
}

interface Thought {
  controller: AbortController;
  iterator: AsyncIterator<Beat>;
  /** Beats a stopped turn had taken and never spoke, kept for a resume. */
  unspoken: Beat[];
  /** The one read of the brain in progress. A resume takes it over, because a second read would queue behind it and let its beat go to a stopped turn. */
  reading: Promise<IteratorResult<Beat>> | null;
  latestReader: number;
}

async function* readThought(thought: Thought | null): AsyncGenerator<Beat> {
  if (!thought) return;
  const reader = (thought.latestReader += 1);
  for (;;) {
    const unspoken = thought.unspoken.shift();
    if (unspoken) {
      yield unspoken;
      continue;
    }
    thought.reading ??= thought.iterator.next();
    const { done, value } = await thought.reading;
    if (reader !== thought.latestReader) return;
    thought.reading = null;
    if (done) return;
    yield value;
  }
}

async function* getResumedThen(resumed: readonly Beat[], thought: Thought | null): AsyncGenerator<Beat> {
  yield* resumed;
  yield* readThought(thought);
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A real frozen tab comes back once, and a forged report would otherwise cut and resume the voice on every message. */
const FEWEST_MS_BETWEEN_FREEZES = 5000;

// Wires what the student does to what the tutor says. The rule decides, this runs its actions, and the voice line keeps every turn apart.
export function createLiveSession({ messenger, line, voice, tutor, takes, allTakes, setTurnCap, getNowMs = getSteadyNowMs, trace = () => {}, readMeaning = async () => null }: LiveSessionOptions): LiveSession {
  const startedAtMs = getNowMs();
  const echo = createEchoFilter();
  const takeVoices = new Map(allTakes.map((take) => [take.id, makeTakeVoice(take).makeTts()]));
  takeVoices.forEach((take) => take.on('error', (error) => trace('voiceError', { problem: String(error.error) })));
  const timers = new Map<TimerName, ReturnType<typeof setTimeout>>();
  const beatsByTurn = new Map<TurnId, readonly Beat[]>();
  const speakingByTurn = new Map<TurnId, Speaking>();
  const queuedEvents: TurnEvent[] = [];
  const typedGate = createTypedGate({ getNowMs, onRelease: (text) => dispatch({ type: 'typed', text }), onHeld: () => trace('typedHeld') });
  const messageGate = createMessageGate({ getNowMs });
  let isDroppingMessages = false;
  let lastFreezeAtMs = Number.NEGATIVE_INFINITY;
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
  let questionHeardAtMs: number | null = null;

  let isThinking = false;
  const setThinking = (next: boolean) => {
    if (next !== isThinking) messenger.send({ type: 'thinking', isThinking: next });
    isThinking = next;
  };

  const log = createSessionLog({
    getNowMs: () => getNowMs() - startedAtMs,
    getBeat: (turnId, beatId) => beatsByTurn.get(turnId)?.find((beat) => beat.id === beatId),
    onRefused: (problem) => trace('reportRefused', { problem }),
  });

  const boardWork = createBoardWork({
    tutor,
    writeLog: (message, checked) => void log.writeWorked(message, checked),
    speakUp: (words) => typedGate.offer(words),
    isTutorTalking: () => reply !== null || reaction !== null,
    getSecondsSinceQuestion: () => (questionHeardAtMs === null ? null : (getNowMs() - questionHeardAtMs) / 1000),
    readMeaning,
    getNowMs,
    trace,
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

  const onSpeechStarted = (speaking: Speaking) => {
    speaking.hasSound = true;
    dispatch({ type: 'tutorStarted', isReply: speaking.isReply });
    if (state.phase === 'yielding') messenger.sendOnBothChannels({ type: 'yield', turnId: speaking.turnId, isYielding: true });
  };

  const onSpeechFinished = (speaking: Speaking) => {
    speaking.isOver = true;
    if (speaking === reaction) reaction = null;
    if (speaking === reply) {
      setThinking(false);
      reply = null;
      dropThought();
      sendClosedNote();
    }
    if (reaction || reply) {
      if (reply && !reply.hasSound && !reaction) dispatch({ type: 'tutorThinking' });
      return;
    }
    dispatch({ type: 'tutorFinished' });
  };

  function speak({ voiceToUse, beats, isReply, canResume, kind }: { voiceToUse: tts.TTS; beats: Iterable<Beat> | AsyncIterable<Beat>; isReply: boolean; canResume: boolean; kind: string }): Speaking {
    turnCount += 1;
    const turnId = `turn-${turnCount}` as TurnId;
    const ownThought = canResume ? thought : null;
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
      isDry: false,
      isOver: false,
      spoken: speakTurn({
        voice: voiceToUse,
        line,
        messenger,
        turnId,
        beats,
        getNowMs,
        // The voice cannot be late before it has words, so a slow model is never read as a failed voice.
        onBeatUnspoken: (beat) => void ownThought?.unspoken.push(beat),
        onBeatStarted(beat) {
          speakingBeats.push(beat);
          if (isReply && speakingBeats.length === 1) setThinking(false);
          if (canResume && (speakingBeats.length === 1 || speaking.isDry)) watchVoice(speaking);
        },
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
          speaking.isDry = gap.ms === undefined;
          // Audio running out while the model is still writing is the model's stall, which the brain covers.
          if (speaking.isDry && speaking.spoken.isVoiceOwing()) watchVoice(speaking);
        },
      }),
    };
    speakingByTurn.set(turnId, speaking);
    void speaking.spoken.finished.then(() => {
      trace('turnFinished', { turnId, kind });
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

  const sendClosedNote = () => {
    const reason = tutor.getClosedReason?.() ?? null;
    if (reason) messenger.send({ type: 'tutorClosed', reason });
    return reason !== null;
  };

  const react = () => {
    trace('reactDecided');
    if (sendClosedNote()) return;
    messenger.send({ type: 'heard' });
    // A session opened by a typed question has not yet said it is an AI, so its first reaction is the greeting (PRD S2).
    if (!reaction) reaction = speakTake(hasGreeted ? 'reaction' : 'greeting', { isReply: false });
    hasGreeted = true;
  };

  // Aborting alone leaves a brain parked at its yield, and its turn would never finish, reach history, or be charged.
  function dropThought(): void {
    if (!thought) return;
    thought.controller.abort();
    void thought.iterator.return?.(undefined).catch((error: unknown) => trace('thoughtFailed', { problem: String(error) }));
    thought = null;
  }

  const noteCutForBrain = (speaking: Speaking | null) => {
    if (speaking) tutor.noteCut?.(speaking.spoken.getWordsSent());
  };

  const startReply = (text: string) => {
    boardWork.noteAnswered();
    resumeTicket += 1;
    noteCutForBrain(reply && !reply.isOver ? reply : cut);
    reply?.spoken.stop();
    cut = null;
    dropThought();
    const controller = new AbortController();
    const started: Thought = { controller, iterator: tutor.reply({ text }, controller.signal)[Symbol.asyncIterator](), unspoken: [], reading: null, latestReader: 0 };
    thought = started;
    setThinking(true);
    reply = speak({ voiceToUse: voice, beats: readThought(started), isReply: true, canResume: true, kind: 'reply' });
  };

  const stopSpeech = (action: TurnAction & { do: 'stop' }) => {
    trace('stopDecided', { reason: action.reason, turnId: getAudibleTurn() });
    clearTimeout(voiceStall);
    resumeTicket += 1;
    reaction?.spoken.stop();
    reaction = null;
    if (reply) {
      if (!action.keepsThought) noteCutForBrain(reply);
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
    reply = speak({ voiceToUse: voice, beats: getResumedThen(beats, thought), isReply: true, canResume: true, kind: 'resume' });
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
    },
  });
  const linkChecker = setInterval(() => link.check(getNowMs()), LINK_CHECK_MS);

  const onReport = (message: BrowserMessage & { type: 'played' }) => {
    const speaking = speakingByTurn.get(message.turnId);
    if (!speaking) return;
    speaking.reports.set(message.beatId, message);
    tutor.notePlayed?.({ beatId: message.beatId, playedWords: message.playedWords, firedCues: message.firedCueMs.length });
    trace('played', { turnId: message.turnId, beatId: message.beatId, ending: message.ending, playedWords: message.playedWords, firedCues: message.firedCueMs.length });
    const isLiveTurn = speaking === reply || speaking === reaction;
    if (message.ending === 'interrupted' && isLiveTurn && state.phase !== 'away' && getNowMs() - lastFreezeAtMs >= FEWEST_MS_BETWEEN_FREEZES) {
      lastFreezeAtMs = getNowMs();
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

  const onAudioState = (isRunning: boolean) => {
    const wasRunning = audioRunning;
    audioRunning = isRunning;
    trace('audioState', { isRunning });
    if (wasRunning && !isRunning) dispatch({ type: 'linkLost' });
    if (!wasRunning && isRunning && state.phase === 'away') dispatch({ type: 'linkBack' });
  };

  return {
    onEars(event) {
      trace(event.type, event.type === 'words' ? { isFinal: event.isFinal, words: event.text.split(/\s+/).length, text: event.text } : {});
      if (event.type === 'words' && state.tutor === 'speaking' && echo.isEcho(event.text, getNowMs())) {
        trace('echoHeard');
        return dispatch({ type: 'echoHeard' });
      }
      if (event.type === 'words') messenger.send({ type: 'studentWords', text: event.text, isFinal: event.isFinal } satisfies AgentMessage);
      dispatch(event);
    },
    onBrowser(message) {
      if (message.type === 'typed') return typedGate.offer(message.text);
      if (message.type === 'pulse') return link.notePulse(message.hearsAgent, getNowMs());
      if (!messageGate.take()) {
        if (!isDroppingMessages) trace('messagesDropped');
        isDroppingMessages = true;
        return;
      }
      isDroppingMessages = false;
      log.write(message);
      if (message.type === 'markNotDrawn') tutor.noteMarkNotDrawn?.(message.markId);
      if (message.type === 'played') onReport(message);
      if (message.type === 'questionHeard') {
        questionHeardAtMs = getNowMs();
        dispatch({ type: 'questionHeard' });
      }
      if (message.type === 'worked') boardWork.onWorked(message);
      if (message.type === 'paused') void boardWork.onPaused(message);
      if (message.type === 'hello' && message.wantsGreeting) greet();
      if (message.type === 'audioState') onAudioState(message.isRunning);
    },
    getLog: () => log.getEvents(),
    doesStudentHearAudio: () => audioRunning,
    async close() {
      clearInterval(linkChecker);
      clearTimeout(voiceStall);
      typedGate.close();
      timers.forEach((timer) => clearTimeout(timer));
      reaction?.spoken.stop();
      reply?.spoken.stop();
      dropThought();
      await Promise.allSettled([reaction?.spoken.finished, reply?.spoken.finished]);
      await Promise.all([...takeVoices.values()].map((take) => take.close()));
    },
  };
}
