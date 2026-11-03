// What the agent does when the student makes sound over the tutor.
export const TURN_TIMINGS = { wordlessStopMs: 1000, transcriptGraceMs: 700, lateWordMs: 800 };

const SMALL_REACTIONS = new Set(['uh', 'huh', 'uh-huh', 'mm', 'mhm', 'mm-hm', 'hmm', 'yeah', 'yes', 'yep', 'ok', 'okay', 'right', 'sure']);

export const INITIAL_TURN_STATE = { phase: 'clear', isVoiceOn: false, heardReaction: false, isReactionFinal: false, isLateWordOpen: false };

export function isSmallReaction(text) {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  return words.every((word) => SMALL_REACTIONS.has(word.replace(/[^a-z-]/g, '')));
}

const startTimer = (name) => ({ do: 'startTimer', name, ms: TURN_TIMINGS[`${name}Ms`] });
const cancelTimer = (name) => ({ do: 'cancelTimer', name });
const CANCEL_ALL = ['wordlessStop', 'transcriptGrace', 'lateWord'].map(cancelTimer);
const RELEASE_REACTION = [...CANCEL_ALL, { do: 'unyield' }, { do: 'clearHeldWords' }];

function onVoiceStarted(state, { isTutorSpeaking }) {
  const next = { ...state, isVoiceOn: true };
  if (state.phase === 'clear' && isTutorSpeaking) {
    return { state: { ...next, phase: 'yielding', heardReaction: false, isReactionFinal: false, isLateWordOpen: false }, actions: [cancelTimer('lateWord'), { do: 'yield' }, startTimer('wordlessStop')] };
  }
  if (state.phase === 'yielding') return { state: next, actions: [cancelTimer('transcriptGrace'), ...(state.heardReaction ? [] : [startTimer('wordlessStop')])] };
  if (state.phase === 'held') return { state: next, actions: [cancelTimer('transcriptGrace')] };
  return { state: next, actions: [] };
}

function onVoiceEnded(state) {
  const next = { ...state, isVoiceOn: false };
  if (state.phase === 'yielding' && state.isReactionFinal) return { state: { ...next, phase: 'clear' }, actions: RELEASE_REACTION };
  if (state.phase === 'yielding') return { state: next, actions: [cancelTimer('wordlessStop'), startTimer('transcriptGrace')] };
  if (state.phase === 'held') return { state: next, actions: [startTimer('transcriptGrace')] };
  return { state: next, actions: [] };
}

function onRealWords(state, reason) {
  if (state.phase === 'yielding' || (state.phase === 'clear' && state.isLateWordOpen)) {
    return { state: { ...state, phase: 'stopped', isLateWordOpen: false }, actions: [...CANCEL_ALL, { do: 'stop', reason }] };
  }
  if (state.phase === 'held') return { state: { ...state, phase: 'stopped' }, actions: CANCEL_ALL };
  return { state, actions: [] };
}

// The SDK holds a reaction as the start of the student's next turn, and would answer it later, so it is cleared.
function onReaction(state, isFinal) {
  const isDone = isFinal && !state.isVoiceOn;
  if (state.phase === 'yielding') {
    const heard = { ...state, heardReaction: true, isReactionFinal: isFinal };
    if (isDone) return { state: { ...heard, phase: 'clear' }, actions: RELEASE_REACTION };
    return { state: heard, actions: [cancelTimer('wordlessStop')] };
  }
  if (state.phase === 'held' && isDone) return { state: { ...state, phase: 'clear' }, actions: [...CANCEL_ALL, { do: 'clearHeldWords' }, { do: 'resume' }] };
  if (state.phase === 'clear' && isFinal) return { state, actions: [{ do: 'clearHeldWords' }] };
  return { state, actions: [] };
}

function onWords(state, { text, isFinal, expectsReply, isTutorSpeaking }) {
  if (text.trim() === '') return { state, actions: [] };
  if (state.phase === 'clear' && !isTutorSpeaking) return { state, actions: [] };
  if (isSmallReaction(text) && !expectsReply) return onReaction(state, isFinal);
  return onRealWords(state, state.phase === 'clear' ? 'late word' : 'real word');
}

function onTutorFinished(state) {
  if (state.phase === 'yielding') return { state: { ...INITIAL_TURN_STATE, isVoiceOn: state.isVoiceOn }, actions: [...CANCEL_ALL, { do: 'unyield' }] };
  return { state, actions: [] };
}

function onTimer(state, { name }) {
  if (name === 'wordlessStop' && state.phase === 'yielding' && !state.heardReaction) {
    return { state: { ...state, phase: 'held' }, actions: [{ do: 'stop', reason: 'no words after 1 s' }] };
  }
  if (name === 'transcriptGrace' && state.phase === 'yielding') {
    return { state: { ...state, phase: 'clear', isLateWordOpen: true }, actions: [{ do: 'unyield' }, ...(state.heardReaction ? [{ do: 'clearHeldWords' }] : []), startTimer('lateWord')] };
  }
  if (name === 'transcriptGrace' && state.phase === 'held') return { state: { ...state, phase: 'clear' }, actions: [{ do: 'resume' }] };
  if (name === 'lateWord') return { state: { ...state, isLateWordOpen: false }, actions: [] };
  return { state, actions: [] };
}

const HANDLERS = {
  voiceStarted: onVoiceStarted,
  voiceEnded: onVoiceEnded,
  words: onWords,
  timer: onTimer,
  tutorStarted: () => ({ state: INITIAL_TURN_STATE, actions: CANCEL_ALL }),
  tutorFinished: onTutorFinished,
};

export function getNextTurnState(state, event) {
  return HANDLERS[event.type](state, event);
}
