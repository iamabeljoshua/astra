import { dropWordsAlreadyAnswered, hasWords, isFiller, isSmallReaction } from './turn-words.ts';

/** Starting values from the design and the plan. `docs/tests/voice.md` holds what each was measured against. */
export const TURN_TIMINGS = {
  /** Sound with no words cuts the tutor after this, so first sound to silence stays within 1.2 s. */
  wordlessStopMs: 800,
  /** After a cut with no words, how long the voice stays quiet before the tutor carries on. Muse's p95 final is about 900 ms, so 700 ms would race it. */
  transcriptGraceMs: 1000,
  /** A student's silence must last this long before code reacts, on top of the voice detector's own silence. */
  reactionFloorMs: 300,
  /** Muse can hold a final for seconds in noise, so after this much silence the tutor answers the partial. */
  heldFinalMs: 1100,
  /** T5: the tutor waits this long after a question or a filler. */
  patienceMs: 8000,
  /** Decision 4: the longest wait after real words. */
  turnCapMs: 1000,
  /** Decision 4: the longest wait when the tutor just asked a question or was just interrupted. */
  patientTurnCapMs: 2000,
} as const;

export type TimerName = 'wordlessStop' | 'transcriptGrace' | 'reactionFloor' | 'heldFinal' | 'patience';

const TIMER_MS: Record<TimerName, number> = {
  wordlessStop: TURN_TIMINGS.wordlessStopMs,
  transcriptGrace: TURN_TIMINGS.transcriptGraceMs,
  reactionFloor: TURN_TIMINGS.reactionFloorMs,
  heldFinal: TURN_TIMINGS.heldFinalMs,
  patience: TURN_TIMINGS.patienceMs,
};

export type FloorPhase = 'clear' | 'yielding' | 'held' | 'stopped' | 'away';
export type TutorPhase = 'silent' | 'thinking' | 'speaking';
export type StopReason = 'real word' | 'no words' | 'typed' | 'link lost';
export type ReplyVia = 'final' | 'partial' | 'typed' | 'link back';

export interface TurnState {
  phase: FloorPhase;
  tutor: TutorPhase;
  isVoiceOn: boolean;
  heardReaction: boolean;
  isReactionFinal: boolean;
  hasFinalWords: boolean;
  isQuestionHeard: boolean;
  /** The words of the utterance still going, which can change. */
  partial: string;
  /** Words the tutor has been asked to answer and has not begun to, which a new reply must carry. */
  unanswered: string;
  hasReacted: boolean;
  isReactionDue: boolean;
  startedOverTutor: boolean;
  isWaitingOnStudent: boolean;
  /** The partial a held final was answered from, kept until that final or the next utterance arrives. */
  answeredPartial: string | null;
  hasSpokenSinceAnswer: boolean;
  wasCutByLink: boolean;
}

export const INITIAL_TURN_STATE: TurnState = {
  phase: 'clear',
  tutor: 'silent',
  isVoiceOn: false,
  heardReaction: false,
  isReactionFinal: false,
  hasFinalWords: false,
  isQuestionHeard: false,
  partial: '',
  unanswered: '',
  hasReacted: false,
  isReactionDue: false,
  startedOverTutor: false,
  isWaitingOnStudent: false,
  answeredPartial: null,
  hasSpokenSinceAnswer: false,
  wasCutByLink: false,
};

export type TurnEvent =
  | { type: 'voiceStarted' }
  | { type: 'voiceEnded' }
  | { type: 'words'; text: string; isFinal: boolean }
  /** The transcript matches what the tutor is saying, so the sound counts as heard and no one is interrupting. */
  | { type: 'echoHeard' }
  | { type: 'turnDecided'; text: string }
  | { type: 'typed'; text: string }
  | { type: 'timer'; name: TimerName }
  | { type: 'tutorThinking' }
  | { type: 'tutorStarted'; isReply: boolean }
  | { type: 'tutorFinished' }
  | { type: 'questionHeard' }
  | { type: 'linkLost' }
  | { type: 'linkBack' };

export type TurnAction =
  | { do: 'yield' }
  | { do: 'unyield' }
  /** `keepsThought` leaves the brain's reply running, because the tutor will carry on with it. */
  | { do: 'stop'; reason: StopReason; keepsThought: boolean }
  | { do: 'resume' }
  | { do: 'react' }
  | { do: 'reply'; text: string; via: ReplyVia }
  | { do: 'startTimer'; name: TimerName; ms: number }
  | { do: 'cancelTimer'; name: TimerName }
  | { do: 'setTurnCap'; ms: number }
  | { do: 'promptAfterSilence' };

export interface TurnStep {
  state: TurnState;
  actions: TurnAction[];
}

const startTimer = (name: TimerName): TurnAction => ({ do: 'startTimer', name, ms: TIMER_MS[name] });
const cancelTimer = (name: TimerName): TurnAction => ({ do: 'cancelTimer', name });
const CANCEL_FLOOR_TIMERS: TurnAction[] = (['wordlessStop', 'transcriptGrace', 'heldFinal'] as const).map(cancelTimer);
const CANCEL_ALL: TurnAction[] = [...CANCEL_FLOOR_TIMERS, cancelTimer('reactionFloor'), cancelTimer('patience')];
const UNYIELD: TurnAction = { do: 'unyield' };
const RESUME: TurnAction = { do: 'resume' };
const REACT: TurnAction = { do: 'react' };

const joinWords = (...parts: string[]) => parts.filter(Boolean).join(' ');

// A final reaction ends the yield, and the tutor carries on as if nothing had been said.
function releaseReaction(state: TurnState): TurnStep {
  return { state: { ...state, phase: 'clear', heardReaction: false, isReactionFinal: false, partial: '' }, actions: [...CANCEL_FLOOR_TIMERS, UNYIELD] };
}

function onVoiceStarted(state: TurnState): TurnStep {
  const next: TurnState = { ...state, isVoiceOn: true, hasSpokenSinceAnswer: state.answeredPartial !== null };
  const restartPatience = state.isWaitingOnStudent ? [startTimer('patience')] : [];
  if (state.phase === 'clear' && state.tutor === 'speaking') {
    return { state: { ...next, phase: 'yielding', heardReaction: false, isReactionFinal: false, startedOverTutor: true }, actions: [{ do: 'yield' }, startTimer('wordlessStop'), cancelTimer('heldFinal'), ...restartPatience] };
  }
  if (state.phase === 'yielding') return { state: next, actions: [cancelTimer('transcriptGrace'), ...(state.heardReaction ? [] : [startTimer('wordlessStop')])] };
  if (state.phase === 'held' || state.phase === 'stopped') return { state: next, actions: [cancelTimer('transcriptGrace'), cancelTimer('heldFinal')] };
  if (state.phase === 'away') return { state: next, actions: [] };
  return { state: { ...next, startedOverTutor: false, isReactionDue: false }, actions: [cancelTimer('heldFinal'), cancelTimer('reactionFloor'), ...restartPatience] };
}

function onVoiceEnded(state: TurnState): TurnStep {
  const next: TurnState = { ...state, isVoiceOn: false };
  const restartPatience = state.isWaitingOnStudent ? [startTimer('patience')] : [];
  if (state.phase === 'yielding' && state.isReactionFinal) return releaseReaction(next);
  if (state.phase === 'yielding') return { state: next, actions: [cancelTimer('wordlessStop'), startTimer('transcriptGrace')] };
  if (state.phase === 'held') return { state: next, actions: [startTimer('transcriptGrace')] };
  if (state.phase === 'away') return { state: next, actions: [] };
  if (state.phase === 'stopped') return { state: next, actions: [...(state.hasFinalWords ? [] : [startTimer('heldFinal')]), ...(state.hasReacted ? [] : [startTimer('reactionFloor')])] };
  if (state.tutor !== 'silent') return { state: next, actions: [] };
  return { state: next, actions: [...(state.hasReacted ? [] : [startTimer('reactionFloor')]), ...(state.partial && !state.hasFinalWords ? [startTimer('heldFinal')] : []), ...restartPatience] };
}

function onRealWords(state: TurnState, text: string, isFinal: boolean): TurnStep {
  const hasFinalWords = state.hasFinalWords || isFinal;
  const next: TurnState = { ...state, phase: 'stopped', hasFinalWords, partial: isFinal ? '' : text, isWaitingOnStudent: false };
  const waitForFinal = hasFinalWords || state.isVoiceOn ? [] : [startTimer('heldFinal')];
  const reactIfDue = next.isReactionDue && !next.hasReacted && !state.isVoiceOn ? [REACT] : [];
  const reacted = reactIfDue.length > 0 ? { hasReacted: true } : {};
  if (state.phase === 'stopped') return { state: { ...next, ...reacted }, actions: [cancelTimer('heldFinal'), ...waitForFinal, ...reactIfDue] };
  if (state.phase === 'held') return { state: { ...next, ...reacted }, actions: [...CANCEL_FLOOR_TIMERS, ...waitForFinal, ...reactIfDue] };
  return { state: { ...next, ...reacted }, actions: [...CANCEL_ALL, { do: 'stop', reason: 'real word', keepsThought: false }, { do: 'setTurnCap', ms: TURN_TIMINGS.patientTurnCapMs }, ...waitForFinal, ...reactIfDue] };
}

function onReaction(state: TurnState, isFinal: boolean): TurnStep {
  const isDone = isFinal && !state.isVoiceOn;
  if (state.phase === 'yielding') {
    const heard = { ...state, heardReaction: true, isReactionFinal: isFinal };
    return isDone ? releaseReaction(heard) : { state: heard, actions: [cancelTimer('wordlessStop')] };
  }
  if (state.phase === 'held') {
    return isDone ? { state: { ...state, phase: 'clear', heardReaction: false }, actions: [...CANCEL_FLOOR_TIMERS, RESUME] } : { state: { ...state, heardReaction: true }, actions: [] };
  }
  return { state, actions: [] };
}

// The student is talking to a silent tutor, so words only wait for the turn to end.
function onWordsToSilentTutor(state: TurnState, text: string, isFinal: boolean): TurnStep {
  const hasFinalWords = state.hasFinalWords || isFinal;
  const shouldReact = state.isReactionDue && !state.hasReacted && !state.isVoiceOn;
  const next: TurnState = { ...state, hasFinalWords, partial: isFinal ? '' : text, hasReacted: state.hasReacted || shouldReact, isReactionDue: state.isReactionDue && !shouldReact };
  const heldFinalTimer = isFinal ? [cancelTimer('heldFinal')] : !state.isVoiceOn && !hasFinalWords ? [startTimer('heldFinal')] : [];
  return { state: next, actions: [...heldFinalTimer, ...(shouldReact ? [REACT] : [])] };
}

function onWords(state: TurnState, { text, isFinal }: { text: string; isFinal: boolean }): TurnStep {
  if (!hasWords(text) || state.phase === 'away') return { state, actions: [] };
  if (state.phase === 'clear' && state.tutor === 'silent') return onWordsToSilentTutor(state, text, isFinal);
  if (isSmallReaction(text) && !state.isQuestionHeard) return onReaction(state, isFinal);
  return onRealWords(state, text, isFinal);
}

function onEchoHeard(state: TurnState): TurnStep {
  if (state.phase === 'yielding') return { state: { ...state, heardReaction: true }, actions: [cancelTimer('wordlessStop')] };
  return { state, actions: [] };
}

function startReply(state: TurnState, { text, via, answeredPartial = null }: { text: string; via: ReplyVia; answeredPartial?: string | null }): TurnStep {
  const reactFirst = state.hasReacted ? [] : [REACT];
  const unyieldFirst = state.phase === 'yielding' ? [UNYIELD] : [];
  const next: TurnState = { ...INITIAL_TURN_STATE, tutor: 'thinking', isVoiceOn: state.isVoiceOn, unanswered: text, hasReacted: true, answeredPartial };
  return { state: next, actions: [...CANCEL_ALL, ...unyieldFirst, ...reactFirst, { do: 'setTurnCap', ms: TURN_TIMINGS.turnCapMs }, { do: 'reply', text, via }] };
}

function onTurnDecided(state: TurnState, { text }: { text: string }): TurnStep {
  if (state.phase === 'away' || !hasWords(text)) return { state, actions: [] };
  const fresh = state.answeredPartial === null ? text : state.hasSpokenSinceAnswer ? dropWordsAlreadyAnswered(text, state.answeredPartial) : '';
  const cleared = { ...state, answeredPartial: null, hasSpokenSinceAnswer: false };
  if (!hasWords(fresh)) return { state: cleared, actions: [] };
  if (isSmallReaction(fresh) && state.startedOverTutor && !state.isQuestionHeard) return { state: cleared, actions: [] };
  if (isFiller(fresh)) return { state: { ...cleared, isWaitingOnStudent: true, partial: '', hasFinalWords: false }, actions: [startTimer('patience')] };
  return startReply(cleared, { text: joinWords(state.unanswered, fresh), via: 'final' });
}

function onTyped(state: TurnState, { text }: { text: string }): TurnStep {
  const stopFirst: TurnAction[] = state.tutor === 'silent' ? [] : [{ do: 'stop', reason: 'typed', keepsThought: false }];
  const step = startReply({ ...state, hasReacted: false }, { text, via: 'typed' });
  return { state: step.state, actions: [...stopFirst, ...step.actions] };
}

function onTimer(state: TurnState, { name }: { name: TimerName }): TurnStep {
  if (name === 'wordlessStop' && state.phase === 'yielding' && !state.heardReaction) {
    return { state: { ...state, phase: 'held' }, actions: [{ do: 'stop', reason: 'no words', keepsThought: true }] };
  }
  if (name === 'transcriptGrace' && state.phase === 'yielding') return { state: { ...state, phase: 'clear', heardReaction: false, isReactionFinal: false, partial: '' }, actions: [UNYIELD] };
  if (name === 'transcriptGrace' && state.phase === 'held') return { state: { ...state, phase: 'clear', heardReaction: false }, actions: [RESUME] };
  if (name === 'reactionFloor') {
    const hasHeardWords = hasWords(state.partial) || state.hasFinalWords;
    if (hasHeardWords && !state.hasReacted && !state.isVoiceOn) return { state: { ...state, hasReacted: true }, actions: [REACT] };
    return { state: { ...state, isReactionDue: !state.hasReacted }, actions: [] };
  }
  if (name === 'heldFinal' && !state.isVoiceOn && !state.hasFinalWords && hasWords(state.partial) && (state.phase === 'stopped' || state.phase === 'clear')) {
    return startReply(state, { text: joinWords(state.unanswered, state.partial), via: 'partial', answeredPartial: state.partial });
  }
  if (name === 'patience' && state.isWaitingOnStudent && state.tutor === 'silent' && !state.isVoiceOn) return { state: { ...state, isWaitingOnStudent: false }, actions: [{ do: 'promptAfterSilence' }] };
  return { state, actions: [] };
}

function onTutorThinking(state: TurnState): TurnStep {
  return { state: { ...state, tutor: 'thinking' }, actions: [] };
}

function onTutorStarted(state: TurnState, { isReply }: { isReply: boolean }): TurnStep {
  const isAlreadyYielding = state.phase === 'yielding';
  const replyStarted = isReply ? { phase: isAlreadyYielding ? ('yielding' as const) : ('clear' as const), unanswered: '', isQuestionHeard: false, isWaitingOnStudent: false, hasFinalWords: false, partial: '', heardReaction: false, isReactionFinal: false } : {};
  const fresh: TurnState = { ...state, tutor: 'speaking', ...replyStarted };
  if (isAlreadyYielding) return { state: fresh, actions: [] };
  if (fresh.phase !== 'clear' || !state.isVoiceOn) return { state: fresh, actions: isReply ? CANCEL_FLOOR_TIMERS : [] };
  return { state: { ...fresh, phase: 'yielding', heardReaction: false, isReactionFinal: false, startedOverTutor: true }, actions: [...CANCEL_FLOOR_TIMERS, { do: 'yield' }, startTimer('wordlessStop')] };
}

function onTutorFinished(state: TurnState): TurnStep {
  if (state.phase === 'yielding') return { state: { ...state, phase: 'clear', tutor: 'silent', heardReaction: false, isReactionFinal: false }, actions: [...CANCEL_FLOOR_TIMERS, UNYIELD] };
  return { state: { ...state, tutor: 'silent' }, actions: [] };
}

function onQuestionHeard(state: TurnState): TurnStep {
  return { state: { ...state, isQuestionHeard: true, isWaitingOnStudent: true }, actions: [{ do: 'setTurnCap', ms: TURN_TIMINGS.patientTurnCapMs }, startTimer('patience')] };
}

function onLinkLost(state: TurnState): TurnStep {
  const wasTalking = state.tutor !== 'silent' || state.phase === 'held';
  const stopFirst: TurnAction[] = state.tutor === 'silent' ? [] : [{ do: 'stop', reason: 'link lost', keepsThought: true }];
  return { state: { ...INITIAL_TURN_STATE, phase: 'away', unanswered: state.unanswered, wasCutByLink: wasTalking, isQuestionHeard: state.isQuestionHeard, hasReacted: state.hasReacted }, actions: [...CANCEL_ALL, ...stopFirst] };
}

function onLinkBack(state: TurnState): TurnStep {
  if (state.phase !== 'away') return { state, actions: [] };
  const next: TurnState = { ...state, phase: 'clear', wasCutByLink: false };
  if (state.wasCutByLink && state.isVoiceOn) return { state: { ...next, phase: 'held' }, actions: [] };
  if (state.wasCutByLink) return { state: next, actions: [RESUME] };
  return { state: next, actions: [] };
}

// Pure, so every order of events can be searched. The session runs the actions.
export function getNextTurnState(state: TurnState, event: TurnEvent): TurnStep {
  switch (event.type) {
    case 'voiceStarted':
      return onVoiceStarted(state);
    case 'voiceEnded':
      return onVoiceEnded(state);
    case 'words':
      return onWords(state, event);
    case 'echoHeard':
      return onEchoHeard(state);
    case 'turnDecided':
      return onTurnDecided(state, event);
    case 'typed':
      return onTyped(state, event);
    case 'timer':
      return onTimer(state, event);
    case 'tutorThinking':
      return onTutorThinking(state);
    case 'tutorStarted':
      return onTutorStarted(state, event);
    case 'tutorFinished':
      return onTutorFinished(state);
    case 'questionHeard':
      return onQuestionHeard(state);
    case 'linkLost':
      return onLinkLost(state);
    case 'linkBack':
      return onLinkBack(state);
  }
}
