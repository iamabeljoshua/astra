export type PressSource = 'talkButton' | 'space';

export type PressState = { kind: 'free' } | { kind: 'pressing'; source: PressSource } | { kind: 'holding'; source: PressSource };

export type PressEvent =
  | { type: 'pressed'; source: PressSource; micIsOn: boolean }
  | { type: 'released'; source: PressSource }
  | { type: 'tapTimeUp' }
  | { type: 'limitReached' }
  | { type: 'fingerLost' }
  | { type: 'micWentOff' };

export type PressCommand = 'openMic' | 'closeMic' | 'endLine' | 'lowerTutor' | 'tellHoldStarted' | 'startTapTimer' | 'startLimitTimer' | 'cancelTimers' | 'showLimitNote';

export interface PressStep {
  state: PressState;
  commands: PressCommand[];
}

/** A tap is quicker than this, and anyone holding to speak is still down when it passes. */
export const TAP_LIMIT_MS = 300;
/** A stuck key stops here. Long enough for a student's longest explanation. */
export const HOLD_LIMIT_MS = 60_000;

export const INITIAL_PRESS: PressState = { kind: 'free' };

const FREE: PressState = INITIAL_PRESS;
const STAY = (state: PressState): PressStep => ({ state, commands: [] });

function onPressedWhileFree(event: PressEvent & { type: 'pressed' }): PressStep {
  if (event.micIsOn) return { state: FREE, commands: event.source === 'talkButton' ? ['closeMic'] : [] };
  return { state: { kind: 'pressing', source: event.source }, commands: ['openMic', 'lowerTutor', 'startTapTimer'] };
}

// Talk pressed during a Space hold means off, and any other second press changes nothing.
function onPressedWhileDown(state: PressState & { kind: 'pressing' | 'holding' }, event: PressEvent & { type: 'pressed' }): PressStep {
  if (state.source !== 'space' || event.source !== 'talkButton') return STAY(state);
  return { state: FREE, commands: [state.kind === 'holding' ? 'endLine' : 'closeMic', 'cancelTimers'] };
}

// Only a tap of Talk leaves the microphone on, because a tap of Space is usually a slip.
function onReleased(state: PressState & { kind: 'pressing' | 'holding' }): PressStep {
  if (state.kind === 'holding') return { state: FREE, commands: ['endLine', 'cancelTimers'] };
  return { state: FREE, commands: state.source === 'space' ? ['closeMic', 'cancelTimers'] : ['cancelTimers'] };
}

// One finger owns the microphone at a time, and any way a finger stops being known closes it.
export function getNextPress(state: PressState, event: PressEvent): PressStep {
  if (state.kind === 'free') return event.type === 'pressed' ? onPressedWhileFree(event) : STAY(state);
  switch (event.type) {
    case 'pressed':
      return onPressedWhileDown(state, event);
    case 'released':
      return event.source === state.source ? onReleased(state) : STAY(state);
    case 'tapTimeUp':
      return state.kind === 'pressing' ? { state: { kind: 'holding', source: state.source }, commands: ['tellHoldStarted', 'startLimitTimer'] } : STAY(state);
    case 'limitReached':
      return state.kind === 'holding' ? { state: FREE, commands: ['endLine', 'cancelTimers', 'showLimitNote'] } : STAY(state);
    case 'fingerLost':
      return { state: FREE, commands: [state.kind === 'holding' ? 'endLine' : 'closeMic', 'cancelTimers'] };
    case 'micWentOff':
      return { state: FREE, commands: state.kind === 'holding' ? ['endLine', 'cancelTimers'] : ['cancelTimers'] };
  }
}
