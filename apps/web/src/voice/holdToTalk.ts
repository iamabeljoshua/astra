export type PressSource = 'talkButton' | 'space';

export type PressState = { kind: 'free' } | { kind: 'pressing'; source: PressSource; wasMicOn: boolean } | { kind: 'holding'; source: PressSource };

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

export const TAP_LIMIT_MS = 300;
export const HOLD_LIMIT_MS = 60_000;

export const INITIAL_PRESS: PressState = { kind: 'free' };

const FREE: PressState = INITIAL_PRESS;
const STAY = (state: PressState): PressStep => ({ state, commands: [] });

// With the microphone on, the line is already going out, so nothing is lost while the tap limit tells a tap from a hold. The tutor stays up until then, because a tap only turns the microphone off.
function onPressedWhileFree({ source, micIsOn }: PressEvent & { type: 'pressed' }): PressStep {
  return { state: { kind: 'pressing', source, wasMicOn: micIsOn }, commands: micIsOn ? ['startTapTimer'] : ['openMic', 'lowerTutor', 'startTapTimer'] };
}

function onPressedWhileDown(state: PressState & { kind: 'pressing' | 'holding' }, event: PressEvent & { type: 'pressed' }): PressStep {
  if (state.source !== 'space' || event.source !== 'talkButton') return STAY(state);
  return { state: FREE, commands: [state.kind === 'holding' ? 'endLine' : 'closeMic', 'cancelTimers'] };
}

function onTapTimeUp({ source, wasMicOn }: PressState & { kind: 'pressing' }): PressStep {
  return { state: { kind: 'holding', source }, commands: wasMicOn ? ['lowerTutor', 'tellHoldStarted', 'startLimitTimer'] : ['tellHoldStarted', 'startLimitTimer'] };
}

// A tap of Talk flips the microphone, and a tap of Space puts it back as it was.
function onReleased(state: PressState & { kind: 'pressing' | 'holding' }): PressStep {
  if (state.kind === 'holding') return { state: FREE, commands: ['endLine', 'cancelTimers'] };
  const staysOn = state.source === 'talkButton' ? !state.wasMicOn : state.wasMicOn;
  return { state: FREE, commands: staysOn ? ['cancelTimers'] : ['closeMic', 'cancelTimers'] };
}

export function getNextPress(state: PressState, event: PressEvent): PressStep {
  if (state.kind === 'free') return event.type === 'pressed' ? onPressedWhileFree(event) : STAY(state);
  switch (event.type) {
    case 'pressed':
      return onPressedWhileDown(state, event);
    case 'released':
      return event.source === state.source ? onReleased(state) : STAY(state);
    case 'tapTimeUp':
      return state.kind === 'pressing' ? onTapTimeUp(state) : STAY(state);
    case 'limitReached':
      return state.kind === 'holding' ? { state: FREE, commands: ['endLine', 'cancelTimers', 'showLimitNote'] } : STAY(state);
    case 'fingerLost':
      return { state: FREE, commands: [state.kind === 'holding' ? 'endLine' : 'closeMic', 'cancelTimers'] };
    case 'micWentOff':
      return { state: FREE, commands: state.kind === 'holding' ? ['endLine', 'cancelTimers'] : ['cancelTimers'] };
  }
}
