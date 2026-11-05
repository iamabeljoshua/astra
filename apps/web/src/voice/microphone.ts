export type MicState = 'off' | 'starting' | 'on' | 'denied' | 'noDevice' | 'failed';

interface LineEnds {
  stop(): void;
  finish(): Promise<void>;
}

export interface MicrophoneOptions<Line extends LineEnds> {
  capture(): Promise<Line>;
  publish(line: Line): Promise<void>;
  unpublish(line: Line): Promise<void>;
  onState(state: MicState): void;
}

export interface Microphone<Line> {
  getState(): MicState;
  /** The line on the wire, or the one next to go on it. */
  getLine(): Line | null;
  toggle(): Promise<void>;
  setOn(isOn: boolean): Promise<void>;
  /** Off for a held line: only what the capture already holds still goes. */
  finishLine(): Promise<void>;
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
export function createMicrophone<Line extends LineEnds>({ capture, publish, unpublish, onState }: MicrophoneOptions<Line>): Microphone<Line> {
  let wantsOn = false;
  let isClosed = false;
  let line: Line | null = null;
  let state: MicState = 'off';
  let settling: Promise<void> | null = null;
  // The agent's input follows the newest track, so lines leave the room one at a time or the last words of one are lost.
  const leaving: Line[] = [];
  let lastHasLeft: Promise<void> = Promise.resolve();
  const publishes = new Map<Line, Promise<void>>();
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
    leaving.forEach((finishing) => finishing.stop());
    if (state === 'on' || state === 'starting') setState('off');
  };

  // A line holds its sound while it waits its turn, so a press during another line's last words loses nothing.
  const publishInTurn = (captured: Line) => {
    const publishing = lastHasLeft.then(() => (line === captured || leaving.includes(captured) ? publish(captured) : undefined));
    publishes.set(captured, publishing);
    return publishing;
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
      const isFirstInLine = leaving.length === 0;
      const publishing = publishInTurn(captured);
      if (isFirstInLine) await publishing;
      else publishing.catch(() => captured?.stop());
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

  const finishLine = () => {
    wantsOn = false;
    if (!line) {
      stopLine();
      return settle();
    }
    const finishing = line;
    leaving.push(finishing);
    line = null;
    setState('off');
    const drained = finishing.finish();
    const publishing = publishes.get(finishing) ?? Promise.resolve();
    lastHasLeft = publishing
      .catch(() => {})
      .then(() => drained)
      .then(() => {
        finishing.stop();
        leaving.shift();
        publishes.delete(finishing);
        return unpublish(finishing);
      })
      .catch(() => {});
    return settle();
  };

  const setOn = (isOn: boolean) => {
    wantsOn = isOn && !isClosed;
    if (wantsOn && !line) setState('starting');
    if (!wantsOn) stopLine();
    return settle();
  };

  return {
    getState: () => state,
    getLine: () => leaving[0] ?? line,
    setOn,
    finishLine,
    toggle: () => setOn(!wantsOn),
    stopAtOnce: () => void setOn(false),
    async close() {
      isClosed = true;
      await setOn(false);
      await lastHasLeft;
    },
  };
}
