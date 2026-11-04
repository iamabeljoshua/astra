import type { tts } from '@livekit/agents';
import { randomUUID } from 'node:crypto';
import { type AgentMessage, type Beat, type BeatId, type BrowserMessage, type InkPoint, type PlayReport, type SessionEvent, type TurnId } from '@astra/contracts';
import { createEchoFilter } from './echo-filter.ts';
import { createLinkWatch, type LinkWatch } from './link-watch.ts';
import { getTakeBeat, makeTakeVoice, type StoredTake, type TakePicker, type TakeUse } from './reactions.ts';
import { getResumeBeats } from './resume-plan.ts';
import { createMessageGate } from './message-gate.ts';
import { createSessionLog, isFurtherReport } from './session-log.ts';
import { createTypedGate } from './typed-gate.ts';
import { type SpokenTurn, speakTurn, type TurnMessenger } from './speak-turn.ts';
import type { TutorBeat, TutorBrain, TutorRequest } from '../tutor/brain.ts';
import { createBoardWork } from '../tutor/watcher/board-work.ts';
import type { HeardTurn, RecordTurn } from './heard-recorder.ts';
import type { SpokenReading } from '../tutor/watcher/read-spoken.ts';
import type { SpokenExpected } from '../tutor/watcher/spoken-answer.ts';
import type { WordMeaning } from '../tutor/watcher/watch-rule.ts';
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
  /** The room stayed quiet to its limit, and the session has told the browser. */
  onQuietLimit?(): void;
  quietLimitMs?: number;
  getNowMs?(): number;
  trace?: TraceNote;
  readMeaning?(words: string): Promise<WordMeaning | null>;
  readStrokes?(strokes: readonly (readonly InkPoint[])[]): Promise<{ text: string; ink: { tex?: string; isUnsure: boolean } } | null>;
  readSpokenWords?(words: string, expects: SpokenExpected): Promise<SpokenReading>;
  getCostSoFar?(): number;
  recordTurn?: RecordTurn;
  /** The tutor has stopped talking and has nothing more to say, so a scene may land. */
  onPause?(): void;
  /** The student has said or typed something the tutor will answer, so a scene waiting for its moment has lost it. */
  onStudentTurn?(): void;
  /** Asked once, by the first reply. Beats mean this session opens on a scene, and the tutor's first line follows them. */
  getOpeningScene?(): Promise<readonly TutorBeat[] | null>;
  onLinkChange?(isUp: boolean): void;
  /** Words never play without their picture, so after a drop the page is asked again. False means it is not coming. */
  waitForPicture?(): Promise<boolean>;
}

export interface LiveSession {
  onEars(event: EarsEvent): void;
  onBrowser(message: BrowserMessage): void;
  getLog(): readonly SessionEvent[];
  doesStudentHearAudio(): boolean;
  /** Nobody is speaking or working, so a scene would interrupt no one. */
  isAtPause(): boolean;
  /** Says a scene's words as a turn of its own, stopped and resumed as any reply is. False, and nothing said, unless this is a pause. */
  speakScene(beats: readonly TutorBeat[]): boolean;
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
  /** Part of this reply reached the student already, in the turn this one resumes. */
  continuesHeardReply: boolean;
  isOver: boolean;
}

interface Thought {
  controller: AbortController;
  iterator: AsyncIterator<TutorBeat>;
  /** Beats a stopped turn had taken and never spoke, kept for a resume, and the next stretch's first beat while the last one plays out. */
  unspoken: TutorBeat[];
  /** The one read of the brain in progress. A resume takes it over, because a second read would queue behind it and let its beat go to a stopped turn. */
  reading: Promise<IteratorResult<Beat>> | null;
  latestReader: number;
  /** These words belong to a picture, and never play without it. */
  isScene: boolean;
}

// Stops at a beat that starts a new stretch, so each stretch is its own turn on the line, with a breath the student can speak into.
async function* readThought(thought: Thought | null, hasStartedStretch = false): AsyncGenerator<TutorBeat> {
  if (!thought) return;
  const reader = (thought.latestReader += 1);
  let isInStretch = hasStartedStretch;
  for (;;) {
    let beat = thought.unspoken.shift();
    if (!beat) {
      thought.reading ??= thought.iterator.next();
      const { done, value } = await thought.reading;
      if (reader !== thought.latestReader) return;
      thought.reading = null;
      if (done) return;
      beat = value;
    }
    if (isInStretch && beat.pauseBeforeMs !== undefined) {
      thought.unspoken.unshift(beat);
      return;
    }
    isInStretch = true;
    yield beat;
  }
}

async function* getResumedThen(resumed: readonly Beat[], thought: Thought | null): AsyncGenerator<Beat> {
  yield* resumed;
  yield* readThought(thought, resumed.length > 0);
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A student asked something needs a moment to start answering, and a scene talking straight over the question would take it from them. */
const ROOM_TO_ANSWER_MS = 5000;

async function* toBeatStream(beats: readonly TutorBeat[]): AsyncGenerator<TutorBeat> {
  yield* beats;
}

/** A real frozen tab comes back once, and a forged report would otherwise cut and resume the voice on every message. */
const FEWEST_MS_BETWEEN_FREEZES = 5000;
/** The page plays a turn behind the agent by the trip and its buffer, so for about this long after the agent finishes, a drop can still take the last words. */
const STILL_PLAYING_AT_PAGE_MS = 3000;
/** How often a breath checks whether a student who started talking has stopped. */
const BREATH_RECHECK_MS = 150;

/** A breath is the agent's own timing, and the log holds only what played. */
function toLoggedBeat(beat: TutorBeat): Beat {
  const logged = { ...beat };
  delete logged.pauseBeforeMs;
  return logged;
}

// Wires what the student does to what the tutor says. The rule decides, this runs its actions, and the voice line keeps every turn apart.
async function* afterTypingStops(beats: AsyncGenerator<TutorBeat>, waitWhileTyping: () => Promise<void>): AsyncGenerator<TutorBeat> {
  const first = await beats.next();
  if (first.done) return;
  await waitWhileTyping();
  yield first.value;
  yield* beats;
}

function recordingTo(heard: HeardTurn, messenger: TurnMessenger): TurnMessenger {
  return {
    send(message) {
      heard.addMessage(message);
      messenger.send(message);
    },
    sendOnBothChannels(message) {
      heard.addMessage(message);
      messenger.sendOnBothChannels(message);
    },
  };
}

export function createLiveSession({ messenger, line, voice, tutor, takes, allTakes, setTurnCap, onQuietLimit = () => {}, quietLimitMs = QUIET_ROOM_LIMIT_MS, getNowMs = getSteadyNowMs, trace = () => {} , readMeaning = async () => null, readStrokes = async () => null, readSpokenWords = async () => ({ kind: 'talk', costUsd: 0 }), getCostSoFar, recordTurn, onPause, onStudentTurn, getOpeningScene, onLinkChange, waitForPicture = async () => true }: LiveSessionOptions): LiveSession {
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
  let spokenTicket = 0;
  let breathTimer: ReturnType<typeof setTimeout> | undefined;
  let stretchBeforeBreath: Speaking | null = null;
  let lastStretch: Speaking | null = null;
  let lastStretchEndedAtMs = 0;
  let askedAtMs = Number.NEGATIVE_INFINITY;
  let canOpenOnScene = getOpeningScene !== undefined;
  /** The request a scene opened on, which the tutor answers once the scene has had its say. */
  let heldReply: TutorRequest | null = null;
  let isPictureInDoubt = false;

  let isThinking = false;
  const setThinking = (next: boolean) => {
    if (next !== isThinking) messenger.send({ type: 'thinking', isThinking: next });
    isThinking = next;
  };

  let quietWarning: ReturnType<typeof setTimeout> | undefined;
  let quietLimit: ReturnType<typeof setTimeout> | undefined;
  let hasWarnedOfQuiet = false;

  const isTutorTalking = () => reply !== null || reaction !== null || stretchBeforeBreath !== null;

  // A breath between stretches and a reply longer than the limit are the tutor talking, so a timer that lands on one starts its wait again.
  const noteSomethingHappened = () => {
    clearTimeout(quietWarning);
    clearTimeout(quietLimit);
    if (hasWarnedOfQuiet) messenger.send({ type: 'quietWarning', isOn: false });
    hasWarnedOfQuiet = false;
    quietWarning = setTimeout(() => {
      if (isTutorTalking()) return noteSomethingHappened();
      trace('quietWarned');
      hasWarnedOfQuiet = true;
      messenger.send({ type: 'quietWarning', isOn: true });
    }, quietLimitMs - Math.min(QUIET_WARNING_LEAD_MS, quietLimitMs / 2));
    quietLimit = setTimeout(() => {
      if (isTutorTalking()) return noteSomethingHappened();
      trace('quietLimit');
      messenger.send({ type: 'closingForQuiet' });
      onQuietLimit();
    }, quietLimitMs);
  };
  noteSomethingHappened();

  const log = createSessionLog({
    getNowMs: () => getNowMs() - startedAtMs,
    getBeat(turnId, beatId) {
      const found = beatsByTurn.get(turnId)?.find((beat) => beat.id === beatId);
      return found && toLoggedBeat(found);
    },
    onRefused: (problem) => trace('reportRefused', { problem }),
  });

  const boardWork = createBoardWork({
    tutor,
    writeLog: (message, checked) => void log.writeWorked(message, checked),
    speakUp: (words) => typedGate.offer(words),
    isTutorTalking: () => reply !== null || reaction !== null,
    getSecondsSinceQuestion: () => (questionHeardAtMs === null ? null : (getNowMs() - questionHeardAtMs) / 1000),
    readMeaning,
    readStrokes,
    readSpokenWords,
    writeHeardLog: (work, checked) => void log.writeHeard(work, checked),
    send: (message) => messenger.send(message),
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
      if (speaking.beats.at(-1)?.expectsReply) askedAtMs = getNowMs();
      if (speaking.canResume) {
        lastStretch = speaking;
        lastStretchEndedAtMs = getNowMs();
      }
      if (thought && thought.unspoken.length > 0) {
        takeBreath(speaking, thought);
      } else if (heldReply) {
        dropThought();
        answerHeldReply();
      } else {
        dropThought();
        sendClosedNote();
        // Only a reply that played out has answered the student's words. A stored line, like the prompt after a filler, has not, and a resume with nothing left to say has, because its reply was already heard.
        if (speaking.canResume && (speaking.hasSound || speaking.continuesHeardReply)) dispatch({ type: 'replyHeardOut' });
      }
    }
    if (reaction || reply) {
      if (reply && !reply.hasSound && !reaction) dispatch({ type: 'tutorThinking' });
      return;
    }
    dispatch({ type: 'tutorFinished' });
    if (!reply && !reaction && !thought && !stretchBeforeBreath) onPause?.();
  };

  function speak({ voiceToUse, beats, isReply, canResume, kind, continuesHeardReply = false }: { voiceToUse: tts.TTS; beats: Iterable<Beat> | AsyncIterable<Beat>; isReply: boolean; canResume: boolean; kind: string; continuesHeardReply?: boolean }): Speaking {
    turnCount += 1;
    noteSomethingHappened();
    const turnId = `turn-${jobTag}-${turnCount}` as TurnId;
    const ownThought = canResume ? thought : null;
    const speakingBeats: Beat[] = [];
    const heard = recordTurn?.({ turnId, kind });
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
      continuesHeardReply,
      isOver: false,
      spoken: speakTurn({
        voice: voiceToUse,
        line,
        messenger: heard ? recordingTo(heard, messenger) : messenger,
        turnId,
        beats,
        getNowMs,
        // The voice cannot be late before it has words, so a slow model is never read as a failed voice.
        onBeatUnspoken: (beat) => void ownThought?.unspoken.unshift(beat),
        onBeatStarted(beat) {
          heard?.addBeat(beat);
          speakingBeats.push(beat);
          if (isReply && speakingBeats.length === 1) setThinking(false);
          if (canResume && (speakingBeats.length === 1 || speaking.isDry)) watchVoice(speaking);
        },
        onFirstAudioRead: (atMs) => {
          if (canResume) clearTimeout(voiceStall);
          trace('firstAudioRead', { turnId, kind, atMs });
        },
        onFrameCaptured: ({ frame, capturedAtMs }) => {
          heard?.addFrame(frame);
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
      heard?.finish(speaking.spoken.getWordMismatches());
      if (getCostSoFar && isReply) messenger.send({ type: 'costSoFar', usd: getCostSoFar() });
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
    reply = speakTake(['voiceLost'], { isReply: true });
  }

  function watchVoice(speaking: Speaking): void {
    clearTimeout(voiceStall);
    voiceStall = setTimeout(() => onVoiceFailed(speaking, 'the voice sent nothing'), VOICE_STALL_MS);
  }

  function speakTake(uses: readonly TakeUse[], { isReply }: { isReply: boolean }): Speaking | null {
    const take = takes.next(...uses);
    const voiceToUse = take && takeVoices.get(take.id);
    if (!take || !voiceToUse) return null;
    return speak({ voiceToUse, beats: [getTakeBeat(take, `${take.id}-${turnCount + 1}`)], isReply, canResume: false, kind: take.use });
  }

  function speakPhrase(phrase: string): Speaking | null {
    const take = allTakes.find((stored) => stored.phrase === phrase);
    const voiceToUse = take && takeVoices.get(take.id);
    if (!take || !voiceToUse) return null;
    return speak({ voiceToUse, beats: [getTakeBeat(take, `${take.id}-${turnCount + 1}`)], isReply: false, canResume: false, kind: take.use });
  }

  const sendClosedNote = () => {
    const reason = tutor.getClosedReason?.() ?? null;
    if (reason) messenger.send({ type: 'tutorClosed', reason });
    return reason !== null;
  };

  const react = ({ canPraise }: { canPraise: boolean }) => {
    trace('reactDecided');
    if (sendClosedNote()) return;
    messenger.send({ type: 'heard' });
    // A session opened by a typed question has not yet said it is an AI, so its first reaction is the greeting (PRD S2).
    const nod = boardWork.takeNod();
    const uses: TakeUse[] = !hasGreeted ? ['greeting'] : canPraise ? ['reaction', 'goodQuestion'] : ['reaction'];
    if (!reaction && nod) reaction = speakPhrase(nod);
    else if (!reaction && boardWork.canSayStockWord()) reaction = speakTake(uses, { isReply: false });
    hasGreeted = true;
  };

  function takeBreath(after: Speaking, waiting: Thought): void {
    stretchBeforeBreath = after;
    breathTimer = setTimeout(() => speakNextStretch(waiting), waiting.unspoken[0]?.pauseBeforeMs ?? 0);
  }

  // A student who has started talking holds the next idea, and if they say real words, their reply replaces it. A cough or an "mm" lets it carry on.
  function speakNextStretch(waiting: Thought): void {
    if (waiting !== thought) return;
    if (state.phase !== 'clear' || state.isVoiceOn || state.partial !== '' || reply || reaction) {
      breathTimer = setTimeout(() => speakNextStretch(waiting), BREATH_RECHECK_MS);
      return;
    }
    if (waiting.isScene && isPictureInDoubt) {
      void waitForPicture().then((isBack) => {
        if (waiting !== thought) return;
        isPictureInDoubt = false;
        if (isBack) speakNextStretch(waiting);
        else giveUpOnScene();
      });
      return;
    }
    const continuesHeardReply = stretchBeforeBreath ? stretchBeforeBreath.hasSound || stretchBeforeBreath.continuesHeardReply : false;
    stretchBeforeBreath = null;
    reply = speak({ voiceToUse: voice, beats: afterTypingStops(readThought(waiting), boardWork.waitWhileTyping), isReply: true, canResume: true, kind: 'reply', continuesHeardReply });
  }

  // Aborting alone leaves a brain parked at its yield, and its turn would never finish, reach history, or be charged.
  function dropThought(): void {
    clearTimeout(breathTimer);
    // Dropped during a breath, so the brain must not count the stretches still to come as heard.
    if (stretchBeforeBreath) tutor.noteCut?.(stretchBeforeBreath.spoken.getWordsSent());
    stretchBeforeBreath = null;
    if (!thought) return;
    thought.controller.abort();
    void thought.iterator.return?.(undefined).catch((error: unknown) => trace('thoughtFailed', { problem: String(error) }));
    thought = null;
  }

  // The tutor's first line starts once the scene has finished, so it is written knowing what the scene said.
  function answerHeldReply(): void {
    const request = heldReply;
    heldReply = null;
    if (request) startReply(request);
  }

  // The picture is not coming back, so its words stop here, and the tutor carries on without them.
  function giveUpOnScene(): void {
    trace('sceneWordsDropped');
    dropThought();
    if (heldReply) return answerHeldReply();
    dispatch({ type: 'tutorFinished' });
    if (!reply && !reaction && !thought) onPause?.();
  }

  const noteCutForBrain = (speaking: Speaking | null) => {
    if (speaking) tutor.noteCut?.(speaking.spoken.getWordsSent());
  };

  const answerSpokenWords = async (request: TutorRequest) => {
    const ticket = (spokenTicket += 1);
    setThinking(true);
    const wantsReply = await boardWork.onSpoken(request.text.slice(request.carried?.length ?? 0).trim());
    if (ticket !== spokenTicket) return;
    const nod = boardWork.takeNod();
    if (nod && !reaction) reaction = speakPhrase(nod);
    if (wantsReply) return startReply(request);
    setThinking(false);
    dispatch({ type: 'workLanded' });
  };

  const isAtPause = () => !isTutorTalking() && !thought && !cut && !isThinking && state.phase === 'clear' && !state.isVoiceOn && state.partial === '' && !boardWork.hasOpenTask() && getNowMs() - askedAtMs >= ROOM_TO_ANSWER_MS;

  // The scene's beats are this thought's first beats, so a stop, a resume, and a breath treat them as any reply's.
  async function* openOnScene(request: TutorRequest, signal: AbortSignal, thoughtOf: () => Thought, getScene: () => Promise<readonly TutorBeat[] | null>): AsyncGenerator<TutorBeat> {
    const beats = await getScene();
    if (signal.aborted) return;
    if (!beats) {
      yield* tutor.reply(request, signal);
      return;
    }
    thoughtOf().isScene = true;
    heldReply = request;
    yield* beats;
  }

  const startReply = (request: TutorRequest) => {
    heldReply = null;
    spokenTicket += 1;
    boardWork.noteAnswered();
    resumeTicket += 1;
    noteCutForBrain(reply && !reply.isOver ? reply : cut);
    reply?.spoken.stop();
    cut = null;
    lastStretch = null;
    dropThought();
    const controller = new AbortController();
    const opening = canOpenOnScene ? getOpeningScene : undefined;
    canOpenOnScene = false;
    const started: Thought = { controller, iterator: (opening ? openOnScene(request, controller.signal, () => started, opening) : tutor.reply(request, controller.signal))[Symbol.asyncIterator](), unspoken: [], reading: null, latestReader: 0, isScene: false };
    thought = started;
    setThinking(true);
    reply = speak({ voiceToUse: voice, beats: afterTypingStops(readThought(started), boardWork.waitWhileTyping), isReply: true, canResume: true, kind: 'reply' });
  };

  const stopSpeech = (action: TurnAction & { do: 'stop' }) => {
    spokenTicket += 1;
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
    if (!action.keepsThought) {
      heldReply = null;
      dropThought();
      lastStretch = null;
    }
    dispatch({ type: 'tutorFinished' });
  };

  const hasEveryReport = (speaking: Speaking) => [...speaking.spoken.getWordsSent().keys()].every((beatId) => speaking.reports.has(beatId));

  const isStillPlayingAtPage = (speaking: Speaking) => getNowMs() - lastStretchEndedAtMs < STILL_PLAYING_AT_PAGE_MS && [...speaking.spoken.getWordsSent().keys()].some((beatId) => speaking.reports.get(beatId)?.ending !== 'finished');

  const noteLinkLost = () => {
    const unfinished = !reply && lastStretch && isStillPlayingAtPage(lastStretch) ? lastStretch : null;
    if (unfinished) cut = unfinished;
    isPictureInDoubt = true;
    onLinkChange?.(false);
    dispatch({ type: 'linkLost', wasPlayingAtPage: unfinished !== null });
  };

  // The page keeps its reports through a drop and sends them as it comes back, so after the wait a beat with no report never played there. What left the agent says nothing about what was heard.
  const getUnheardBeats = (speaking: Speaking, resumeTag: string, beats: readonly Beat[] = speaking.beats) => getResumeBeats({ beats, reports: speaking.reports, wordsSent: new Map(), resumeTag });

  // An earlier stretch has played to its end unless the page says it was cut, because a stretch with no report may simply be late.
  const getEndOfLastStretch = (stretch: Speaking | null, resumeTag: string): Beat[] => {
    if (!stretch) return [];
    const firstCut = stretch.beats.findIndex((beat) => stretch.reports.has(beat.id) && stretch.reports.get(beat.id)?.ending !== 'finished');
    return firstCut < 0 ? [] : getUnheardBeats(stretch, resumeTag, stretch.beats.slice(firstCut));
  };

  const resume = async () => {
    const cutTurn = cut;
    cut = null;
    if (!cutTurn) return;
    // This turn carries on with the thought, so the breath that was waiting to do that stands down.
    clearTimeout(breathTimer);
    stretchBeforeBreath = null;
    const earlierStretch = lastStretch === cutTurn ? null : lastStretch;
    const ticket = (resumeTicket += 1);
    dispatch({ type: 'tutorThinking' });
    const deadline = getNowMs() + REPORT_WAIT_MS;
    while ((!hasEveryReport(cutTurn) || (earlierStretch && !hasEveryReport(earlierStretch))) && getNowMs() < deadline) await delay(REPORT_POLL_MS);
    if (ticket !== resumeTicket) return;
    if (thought?.isScene && isPictureInDoubt) {
      const isBack = await waitForPicture();
      if (ticket !== resumeTicket) return;
      isPictureInDoubt = false;
      if (!isBack) return giveUpOnScene();
    }
    const resumeTag = `r${turnCount}`;
    const beats = [...getEndOfLastStretch(earlierStretch, resumeTag), ...getUnheardBeats(cutTurn, resumeTag)];
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
        return void resume();
      case 'react':
        return react(action);
      case 'reply':
        trace('replyDecided', { via: action.via, words: action.text.split(/\s+/).length, text: action.text });
        onStudentTurn?.();
        if ((action.via === 'final' || action.via === 'partial') && boardWork.hasOpenTask()) return void answerSpokenWords({ text: action.text, carried: action.carried });
        return startReply({ text: action.text, carried: action.carried });
      case 'startTimer':
        return startNamedTimer(action.name, action.ms);
      case 'cancelTimer':
        return clearTimeout(timers.get(action.name));
      case 'setTurnCap':
        return setTurnCap(action.ms);
      case 'promptAfterSilence':
        reply = speakTake(['prompt'], { isReply: true });
    }
  }

  const link: LinkWatch = createLinkWatch({
    onLost() {
      trace('linkLost');
      noteLinkLost();
    },
    onBack() {
      trace('linkBack');
      onLinkChange?.(true);
      dispatch({ type: 'linkBack' });
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
    reply = speakTake(['greeting'], { isReply: true });
  };

  const onAudioState = (isRunning: boolean) => {
    const wasRunning = audioRunning;
    audioRunning = isRunning;
    trace('audioState', { isRunning });
    if (wasRunning && !isRunning) noteLinkLost();
    if (!wasRunning && isRunning && state.phase === 'away') {
      onLinkChange?.(true);
      dispatch({ type: 'linkBack' });
    }
  };

  return {
    onEars(event) {
      trace(event.type, event.type === 'words' ? { isFinal: event.isFinal, words: event.text.split(/\s+/).length, text: event.text } : {});
      if (event.type === 'words' && state.tutor === 'speaking' && echo.isEcho(event.text, getNowMs())) {
        trace('echoHeard');
        return dispatch({ type: 'echoHeard' });
      }
      if (event.type === 'words') messenger.send({ type: 'studentWords', text: event.text, isFinal: event.isFinal } satisfies AgentMessage);
      if (event.type === 'words' && hasWords(event.text)) noteSomethingHappened();
      dispatch(event);
    },
    onBrowser(message) {
      if (message.type === 'typed') {
        noteSomethingHappened();
        return typedGate.offer(message.text);
      }
      if (message.type === 'pulse') return link.notePulse(message.hearsAgent, getNowMs());
      // Past the limit too, because a student keeping their room open must always be heard.
      if (message.type === 'stillHere') return noteSomethingHappened();
      if (!messageGate.take()) {
        if (!isDroppingMessages) trace('messagesDropped');
        isDroppingMessages = true;
        return;
      }
      isDroppingMessages = false;
      if (message.type === 'played') return onReport(message);
      log.write(message);
      if (message.type === 'acted') noteSomethingHappened();
      if (message.type === 'markNotDrawn') tutor.noteMarkNotDrawn?.(message.markId);
      if (message.type === 'questionHeard') {
        questionHeardAtMs = getNowMs();
        dispatch({ type: 'questionHeard' });
      }
      if (message.type === 'stopTutor') stopSpeech({ do: 'stop', reason: 'typed', keepsThought: false });
      if (message.type === 'acted' && message.action.action === 'inkStroke') boardWork.onInkStroke(message.action);
      if (message.type === 'inkPeek') boardWork.onInkPeek(message);
      if (message.type === 'typing') boardWork.noteTyping();
      if (message.type === 'inkDone') void boardWork.onInkDone(message);
      if (message.type === 'worked') boardWork.onWorked(message);
      const isStudentQuiet = !state.isVoiceOn;
      if (message.type === 'paused' && isStudentQuiet) void boardWork.onPaused(message);
      if (message.type === 'hello' && message.wantsGreeting) greet();
      if (message.type === 'audioState') onAudioState(message.isRunning);
    },
    getLog: () => log.getEvents(),
    doesStudentHearAudio: () => audioRunning,
    isAtPause,
    speakScene(beats) {
      if (!isAtPause()) return false;
      const started: Thought = { controller: new AbortController(), iterator: toBeatStream(beats), unspoken: [], reading: null, latestReader: 0, isScene: true };
      isPictureInDoubt = false;
      thought = started;
      reply = speak({ voiceToUse: voice, beats: afterTypingStops(readThought(started), boardWork.waitWhileTyping), isReply: true, canResume: true, kind: 'scene' });
      return true;
    },
    async close() {
      clearInterval(linkChecker);
      clearTimeout(voiceStall);
      typedGate.close();
      timers.forEach((timer) => clearTimeout(timer));
      reaction?.spoken.stop();
      reply?.spoken.stop();
      dropThought();
      await Promise.allSettled([reaction?.spoken.finished, reply?.spoken.finished]);
      // After the wait, because a turn ending starts the quiet count again.
      clearTimeout(quietWarning);
      clearTimeout(quietLimit);
      await Promise.all([...takeVoices.values()].map((take) => take.close()));
    },
  };
}
