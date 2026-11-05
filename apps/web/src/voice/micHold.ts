import { getNextPress, HOLD_LIMIT_MS, INITIAL_PRESS, type PressCommand, type PressEvent, type PressSource, type PressState, TAP_LIMIT_MS } from './holdToTalk';

export interface MicHoldDeps {
  getIsMicOn(): boolean;
  openMic(): void;
  closeMic(): void;
  endLine(): void;
  lowerTutor(): void;
  tellHoldStarted(): void;
  onHolding(isHolding: boolean): void;
  onLimitReached(): void;
}

export interface MicHold {
  press(source: PressSource): void;
  release(source: PressSource): void;
  loseFinger(): void;
  noteMicOff(): void;
  close(): void;
}

export function createMicHold({ getIsMicOn, openMic, closeMic, endLine, lowerTutor, tellHoldStarted, onHolding, onLimitReached }: MicHoldDeps): MicHold {
  let state: PressState = INITIAL_PRESS;
  let tapTimer: ReturnType<typeof setTimeout> | undefined;
  let limitTimer: ReturnType<typeof setTimeout> | undefined;

  const commands: Record<PressCommand, () => void> = {
    openMic,
    closeMic,
    endLine,
    lowerTutor,
    tellHoldStarted,
    showLimitNote: onLimitReached,
    startTapTimer() {
      tapTimer = setTimeout(() => step({ type: 'tapTimeUp' }), TAP_LIMIT_MS);
    },
    startLimitTimer() {
      limitTimer = setTimeout(() => step({ type: 'limitReached' }), HOLD_LIMIT_MS);
    },
    cancelTimers() {
      clearTimeout(tapTimer);
      clearTimeout(limitTimer);
    },
  };

  function step(event: PressEvent): void {
    const wasHolding = state.kind === 'holding';
    const next = getNextPress(state, event);
    state = next.state;
    if (wasHolding !== (state.kind === 'holding')) onHolding(state.kind === 'holding');
    next.commands.forEach((command) => commands[command]());
  }

  return {
    press: (source) => step({ type: 'pressed', source, micIsOn: getIsMicOn() }),
    release: (source) => step({ type: 'released', source }),
    loseFinger: () => step({ type: 'fingerLost' }),
    noteMicOff: () => step({ type: 'micWentOff' }),
    close() {
      step({ type: 'fingerLost' });
      commands.cancelTimers();
    },
  };
}
