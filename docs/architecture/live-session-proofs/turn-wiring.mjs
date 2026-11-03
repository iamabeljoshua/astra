import { voice } from '@livekit/agents';
import { getNextTurnState, INITIAL_TURN_STATE } from './turn-rule.mjs';

const REPORT_WAIT_MS = 1000;

// The SDK drops a turn while a reply is active unless it has this many words, so our rule's stop is what lets a turn through.
export const INTERRUPTION_SETTINGS = { mode: 'vad', minDuration: 500, minWords: 9999, resumeFalseInterruption: false };

const TUTOR_EVENTS = { thinking: 'tutorThinking', speaking: 'tutorStarted', listening: 'tutorFinished', idle: 'tutorFinished' };

export function connectTurnRule({ session, room, topic, publishStop, publish, log, onResume }) {
  let state = INITIAL_TURN_STATE;
  let playedWords = 0;
  let report = null;
  let onReport = null;
  let isReportPending = false;
  const timers = new Map();
  const dispatch = (event) => {
    const next = getNextTurnState(state, event);
    state = next.state;
    next.actions.forEach(runAction);
  };
  const resumeOnceReported = () => {
    const resume = () => {
      onReport = null;
      onResume({ playedWords, report });
    };
    if (!isReportPending) return resume();
    const timer = setTimeout(resume, REPORT_WAIT_MS);
    onReport = () => {
      clearTimeout(timer);
      resume();
    };
  };
  const runAction = (action) => {
    if (action.do === 'startTimer') timers.set(action.name, setTimeout(() => dispatch({ type: 'timer', name: action.name }), action.ms));
    if (action.do === 'cancelTimer') clearTimeout(timers.get(action.name));
    if (action.do === 'yield' || action.do === 'unyield') {
      log(`policy_${action.do}`);
      publish({ type: 'yield', isYielding: action.do === 'yield', at: Date.now() });
    }
    if (action.do === 'stop') {
      log('policy_interrupt', { reason: action.reason });
      isReportPending = true;
      publishStop();
      session.interrupt();
    }
    if (action.do === 'resume') resumeOnceReported();
    if (action.do === 'clearHeldWords' && process.env.CLEAR_HELD !== '0') {
      log('policy_clear_held');
      // The SDK stores a final transcript just after it reports one, so a clear in the same tick would miss it.
      setTimeout(() => session.clearUserTurn(), 0);
    }
  };
  room.on('dataReceived', (payload, _participant, _kind, messageTopic) => {
    if (messageTopic !== topic) return;
    const message = JSON.parse(new TextDecoder().decode(payload));
    if (message.type === 'played') {
      playedWords = message.playedWords;
      report = message;
      isReportPending = false;
      onReport?.();
    }
    if (message.type === 'questionHeard') {
      log('question_heard');
      dispatch({ type: 'questionHeard' });
    }
  });
  room.on('participantDisconnected', () => dispatch({ type: 'linkLost' }));
  session.on(voice.AgentSessionEventTypes.UserStateChanged, (event) => {
    if (event.newState === 'speaking') dispatch({ type: 'voiceStarted' });
    if (event.oldState === 'speaking') dispatch({ type: 'voiceEnded' });
  });
  session.on(voice.AgentSessionEventTypes.AgentStateChanged, (event) => {
    const tutorEvent = TUTOR_EVENTS[event.newState];
    if (tutorEvent) dispatch({ type: tutorEvent });
  });
  session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (event) => dispatch({ type: 'words', text: event.transcript, isFinal: event.isFinal }));
}
