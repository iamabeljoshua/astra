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

// One loop moves the microphone toward what the student last asked for, so a press only changes that wish. A second capture cannot start while one is open or opening, and off stops the capture before it waits on anything.
export function createMicrophone<Line extends { stop(): void }>({ capture, publish, unpublish, onState }: MicrophoneOptions<Line>): Microphone<Line> {
  let wantsOn = false;
  let isClosed = false;
  let line: Line | null = null;
  let state: MicState = 'off';
  let settling: Promise<void> | null = null;

  const setState = (next: MicState) => {
    state = next;
    onState(next);
  };

  const shut = async (open: Line) => {
    open.stop();
    line = null;
    setState('off');
    await unpublish(open).catch(() => {});
  };

  const open = async () => {
    setState('starting');
    try {
      line = await capture();
      if (!wantsOn) return;
      setState('on');
      await publish(line);
    } catch (problem) {
      wantsOn = false;
      if (line) await shut(line);
      setState(getProblemState(problem));
    }
  };

  const settle = (): Promise<void> => {
    settling ??= (async () => {
      while (wantsOn !== (line !== null)) {
        if (line) await shut(line);
        else await open();
      }
      if (!wantsOn && state === 'starting') setState('off');
      settling = null;
    })();
    return settling;
  };

  const setOn = (isOn: boolean) => {
    wantsOn = isOn && !isClosed;
    return settle();
  };

  return {
    getState: () => state,
    getLine: () => line,
    setOn,
    toggle: () => setOn(!wantsOn),
    stopAtOnce() {
      wantsOn = false;
      line?.stop();
      void settle();
    },
    close() {
      isClosed = true;
      wantsOn = false;
      return settle();
    },
  };
}
