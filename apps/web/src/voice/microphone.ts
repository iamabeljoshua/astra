export type MicState = 'off' | 'starting' | 'on' | 'denied' | 'noDevice' | 'failed';

export interface MicrophoneOptions<Line extends { stop(): void }> {
  capture(): Promise<Line>;
  publish(line: Line): Promise<void>;
  unpublish(line: Line): Promise<void>;
  onState(state: MicState): void;
}

export interface Microphone<Line> {
  getState(): MicState;
  /** The line now open, if any. There is never more than one. */
  getLine(): Line | null;
  toggle(): Promise<void>;
  setOn(isOn: boolean): Promise<void>;
  /** For a page leaving, which waits for nothing. */
  stopAtOnce(): void;
  close(): Promise<void>;
}

const NOT_ALLOWED = new Set(['NotAllowedError', 'SecurityError', 'PermissionDeniedError']);
const NO_DEVICE = new Set(['NotFoundError', 'DevicesNotFoundError', 'OverconstrainedError']);

function getProblemState(problem: unknown): MicState {
  const name = (problem as { name?: unknown } | null)?.name;
  if (typeof name === 'string' && NOT_ALLOWED.has(name)) return 'denied';
  if (typeof name === 'string' && NO_DEVICE.has(name)) return 'noDevice';
  return 'failed';
}

// One loop moves the microphone toward what the student last asked for, so a press only changes that wish. A second capture cannot start while one is open or opening, and off stops the capture at once, before the loop waits on anything.
export function createMicrophone<Line extends { stop(): void }>({ capture, publish, unpublish, onState }: MicrophoneOptions<Line>): Microphone<Line> {
  let wantsOn = false;
  let isClosed = false;
  let line: Line | null = null;
  let state: MicState = 'off';
  let settling: Promise<void> | null = null;
  const toUnpublish: Line[] = [];

  const setState = (next: MicState) => {
    state = next;
    onState(next);
  };

  const stopLine = () => {
    if (line) {
      line.stop();
      toUnpublish.push(line);
      line = null;
    }
    if (state === 'on' || state === 'starting') setState('off');
  };

  const open = async () => {
    setState('starting');
    let captured: Line | null = null;
    try {
      captured = await capture();
      if (!wantsOn) {
        captured.stop();
        return;
      }
      line = captured;
      setState('on');
      await publish(captured);
    } catch (problem) {
      captured?.stop();
      const wasPressedOff = captured !== null && line !== captured;
      if (wasPressedOff) return;
      line = null;
      wantsOn = false;
      setState(getProblemState(problem));
    }
  };

  const move = async () => {
    for (;;) {
      const leftover = toUnpublish.shift();
      if (leftover) await unpublish(leftover).catch(() => {});
      else if (wantsOn && !line) await open();
      else return;
    }
  };

  const settle = (): Promise<void> => {
    settling ??= move().finally(() => {
      settling = null;
      if (toUnpublish.length > 0 || (wantsOn && !line)) void settle();
    });
    return settling;
  };

  const setOn = (isOn: boolean) => {
    wantsOn = isOn && !isClosed;
    if (wantsOn && !line) setState('starting');
    if (!wantsOn) stopLine();
    return settle();
  };

  return {
    getState: () => state,
    getLine: () => line,
    setOn,
    toggle: () => setOn(!wantsOn),
    stopAtOnce: () => void setOn(false),
    close() {
      isClosed = true;
      return setOn(false);
    },
  };
}
