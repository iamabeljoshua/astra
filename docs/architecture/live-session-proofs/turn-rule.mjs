export const TURN_TIMINGS = { wordlessStopMs: 1000, transcriptGraceMs: 700 };

const SMALL_REACTIONS = new Set(['uh', 'huh', 'uh-huh', 'mm', 'mhm', 'mm-hm', 'hmm', 'yeah', 'yes', 'yep', 'ok', 'okay', 'right', 'sure']);

export const INITIAL_TURN_STATE = { phase: 'clear', tutor: 'silent', isVoiceOn: false, heardReaction: false, isReactionFinal: false, hasFinalWords: false, isQuestionHeard: false };

function getWords(text) {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/[^a-z-]/g, ''))
    .filter(Boolean);
}

export function isSmallReaction(text) {
  return getWords(text).every((word) => SMALL_REACTIONS.has(word));
}

const startTimer = (name) => ({ do: 'startTimer', name, ms: TURN_TIMINGS[`${name}Ms`] });
const cancelTimer = (name) => ({ do: 'cancelTimer', name });
const CANCEL_ALL = ['wordlessStop', 'transcriptGrace'].map(cancelTimer);
const CLEAR_HELD = { do: 'clearHeldWords' };
const RESUME = { do: 'resume' };
const RELEASE_REACTION = [...CANCEL_ALL, { do: 'unyield' }, CLEAR_HELD];

function onVoiceStarted(state) {
  const next = { ...state, isVoiceOn: true };
  if (state.phase === 'clear' && state.tutor === 'speaking') {
    return { state: { ...next, phase: 'yielding', heardReaction: false, isReactionFinal: false }, actions: [{ do: 'yield' }, startTimer('wordlessStop')] };
  }
  if (state.phase === 'yielding') return { state: next, actions: [cancelTimer('transcriptGrace'), ...(state.heardReaction ? [] : [startTimer('wordlessStop')])] };
  if (state.phase === 'held' || state.phase === 'stopped') return { state: next, actions: [cancelTimer('transcriptGrace')] };
  return { state: next, actions: [] };
}

function onVoiceEnded(state) {
  const next = { ...state, isVoiceOn: false };
  if (state.phase === 'yielding' && state.isReactionFinal) return { state: { ...next, phase: 'clear' }, actions: RELEASE_REACTION };
  if (state.phase === 'yielding') return { state: next, actions: [cancelTimer('wordlessStop'), startTimer('transcriptGrace')] };
  if (state.phase === 'held' || (state.phase === 'stopped' && !state.hasFinalWords)) return { state: next, actions: [startTimer('transcriptGrace')] };
  return { state: next, actions: [] };
}

function onRealWords(state, isFinal) {
  const hasFinalWords = state.hasFinalWords || isFinal;
  const waitForFinal = hasFinalWords || state.isVoiceOn ? [] : [startTimer('transcriptGrace')];
  const next = { ...state, phase: 'stopped', hasFinalWords };
  if (state.phase === 'stopped') return { state: next, actions: [cancelTimer('transcriptGrace'), ...waitForFinal] };
  if (state.phase === 'held') return { state: next, actions: [...CANCEL_ALL, ...waitForFinal] };
  return { state: next, actions: [...CANCEL_ALL, { do: 'stop', reason: 'real word' }, ...waitForFinal] };
}

// The SDK holds a reaction as the start of the student's next turn, and would answer it later, so it is cleared.
function onReaction(state, isFinal) {
  const isDone = isFinal && !state.isVoiceOn;
  if (state.phase === 'yielding') {
    const heard = { ...state, heardReaction: true, isReactionFinal: isFinal };
    return isDone ? { state: { ...heard, phase: 'clear' }, actions: RELEASE_REACTION } : { state: heard, actions: [cancelTimer('wordlessStop')] };
  }
  if (state.phase === 'held') {
    const heard = { ...state, heardReaction: true };
    return isDone ? { state: { ...heard, phase: 'clear' }, actions: [...CANCEL_ALL, CLEAR_HELD, RESUME] } : { state: heard, actions: [] };
  }
  if (state.phase === 'clear' && isFinal) return { state, actions: [CLEAR_HELD] };
  return { state, actions: [] };
}

function onWords(state, { text, isFinal }) {
  if (getWords(text).length === 0) return { state, actions: [] };
  if (state.phase === 'clear' && state.tutor === 'silent') return { state, actions: [] };
  if (isSmallReaction(text) && !state.isQuestionHeard) return onReaction(state, isFinal);
  return onRealWords(state, isFinal);
}

function onTutorThinking(state) {
  return { state: { ...INITIAL_TURN_STATE, tutor: 'thinking', isVoiceOn: state.isVoiceOn }, actions: CANCEL_ALL };
}

function onTutorStarted(state) {
  const fresh = { ...INITIAL_TURN_STATE, tutor: 'speaking', isVoiceOn: state.isVoiceOn };
  if (!state.isVoiceOn) return { state: fresh, actions: CANCEL_ALL };
  return { state: { ...fresh, phase: 'yielding' }, actions: [...CANCEL_ALL, { do: 'yield' }, startTimer('wordlessStop')] };
}

function onTutorFinished(state) {
  if (state.phase === 'yielding') return { state: { ...INITIAL_TURN_STATE, isVoiceOn: state.isVoiceOn }, actions: [...CANCEL_ALL, { do: 'unyield' }] };
  return { state: { ...state, tutor: 'silent' }, actions: [] };
}

function onTimer(state, { name }) {
  if (name === 'wordlessStop' && state.phase === 'yielding' && !state.heardReaction) {
    return { state: { ...state, phase: 'held' }, actions: [{ do: 'stop', reason: 'no words after 1 s' }] };
  }
  if (name !== 'transcriptGrace') return { state, actions: [] };
  const clearIfHeard = state.heardReaction ? [CLEAR_HELD] : [];
  if (state.phase === 'yielding') return { state: { ...state, phase: 'clear' }, actions: [{ do: 'unyield' }, ...clearIfHeard] };
  if (state.phase === 'held') return { state: { ...state, phase: 'clear' }, actions: [...clearIfHeard, RESUME] };
  if (state.phase === 'stopped' && !state.hasFinalWords) return { state: { ...state, phase: 'clear' }, actions: [RESUME] };
  return { state, actions: [] };
}

const HANDLERS = {
  voiceStarted: onVoiceStarted,
  voiceEnded: onVoiceEnded,
  words: onWords,
  timer: onTimer,
  tutorThinking: onTutorThinking,
  tutorStarted: onTutorStarted,
  tutorFinished: onTutorFinished,
  questionHeard: (state) => ({ state: { ...state, isQuestionHeard: true }, actions: [] }),
  linkLost: () => ({ state: INITIAL_TURN_STATE, actions: CANCEL_ALL }),
};

export function getNextTurnState(state, event) {
  return HANDLERS[event.type](state, event);
}
