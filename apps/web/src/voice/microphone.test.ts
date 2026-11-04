import { describe, expect, it, vi } from 'vitest';
import { createMicrophone, type MicState } from './microphone';

interface FakeLine {
  id: number;
  stopped: boolean;
  stop(): void;
}

function makeFake({ captureFails, publishFails }: { captureFails?: string; publishFails?: boolean } = {}) {
  const lines: FakeLine[] = [];
  const published = new Set<FakeLine>();
  const states: MicState[] = [];
  const waits: (() => void)[] = [];
  const letCaptureFinish = () => waits.splice(0).forEach((finish) => finish());
  const microphone = createMicrophone<FakeLine>({
    capture: async () => {
      await new Promise<void>((resolve) => waits.push(resolve));
      if (captureFails) throw new DOMException('no', captureFails);
      const line: FakeLine = { id: lines.length, stopped: false, stop: vi.fn(function stop(this: FakeLine) { line.stopped = true; }) };
      lines.push(line);
      return line;
    },
    publish: async (line) => {
      if (publishFails) throw new Error('publish refused');
      published.add(line);
    },
    unpublish: async (line) => void published.delete(line),
    onState: (state) => states.push(state),
  });
  return { microphone, lines, published, states, letCaptureFinish };
}

const flush = async () => {
  for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
};

describe('the microphone', () => {
  it('opens one line and publishes it', async () => {
    const { microphone, lines, published, letCaptureFinish } = makeFake();
    const on = microphone.setOn(true);
    await flush();
    letCaptureFinish();
    await on;
    expect(microphone.getState()).toBe('on');
    expect(lines).toHaveLength(1);
    expect(published.size).toBe(1);
  });

  it('can never hold a second line, whatever is pressed while one opens', async () => {
    const { microphone, lines, letCaptureFinish } = makeFake();
    void microphone.setOn(true);
    void microphone.setOn(true);
    void microphone.toggle();
    void microphone.toggle();
    await flush();
    letCaptureFinish();
    await flush();
    expect(lines).toHaveLength(1);
    expect(microphone.getState()).toBe('on');
  });

  it('takes a press during starting as off: the capture stops the moment it lands and is never published', async () => {
    const { microphone, lines, published, states, letCaptureFinish } = makeFake();
    void microphone.toggle();
    await flush();
    expect(microphone.getState()).toBe('starting');
    const off = microphone.toggle();
    letCaptureFinish();
    await off;
    expect(lines).toHaveLength(1);
    expect(lines[0]?.stopped).toBe(true);
    expect(published.size).toBe(0);
    expect(microphone.getLine()).toBeNull();
    expect(states.at(-1)).toBe('off');
    expect(states).not.toContain('on');
  });

  it('stops the capture before it waits on the room when turned off', async () => {
    const { microphone, lines, published, letCaptureFinish } = makeFake();
    const on = microphone.setOn(true);
    await flush();
    letCaptureFinish();
    await on;
    void microphone.setOn(false);
    expect(lines[0]?.stopped).toBe(true);
    await flush();
    expect(published.size).toBe(0);
    expect(microphone.getState()).toBe('off');
  });

  it('leaves nothing captured when publishing fails, and says it failed rather than denied', async () => {
    const { microphone, lines, letCaptureFinish } = makeFake({ publishFails: true });
    const on = microphone.setOn(true);
    await flush();
    letCaptureFinish();
    await on;
    expect(lines[0]?.stopped).toBe(true);
    expect(microphone.getLine()).toBeNull();
    expect(microphone.getState()).toBe('failed');
  });

  it.each([
    ['NotAllowedError', 'denied'],
    ['NotFoundError', 'noDevice'],
    ['NotReadableError', 'failed'],
  ])('names %s truly as %s, and a press tries again', async (name, state) => {
    const { microphone, letCaptureFinish } = makeFake({ captureFails: name });
    const on = microphone.setOn(true);
    await flush();
    letCaptureFinish();
    await on;
    expect(microphone.getState()).toBe(state);
    void microphone.toggle();
    await flush();
    expect(microphone.getState()).toBe('starting');
  });

  it('stops at once for a page leaving, with no await in the way', async () => {
    const { microphone, lines, letCaptureFinish } = makeFake();
    const on = microphone.setOn(true);
    await flush();
    letCaptureFinish();
    await on;
    microphone.stopAtOnce();
    expect(lines[0]?.stopped).toBe(true);
    await flush();
    expect(microphone.getState()).toBe('off');
  });

  it('opens nothing after it is closed, even for a press that lands late', async () => {
    const { microphone, lines, letCaptureFinish } = makeFake();
    await microphone.close();
    void microphone.setOn(true);
    letCaptureFinish();
    await flush();
    expect(lines).toHaveLength(0);
    expect(microphone.getState()).toBe('off');
  });

  it('settles to the last wish over a run of presses, and off means every line stopped', async () => {
    const { microphone, lines, published, letCaptureFinish } = makeFake();
    const presses = [microphone.toggle(), microphone.toggle(), microphone.toggle()];
    await flush();
    letCaptureFinish();
    await Promise.all(presses);
    expect(microphone.getState()).toBe('on');
    await microphone.toggle();
    expect(lines.every((line) => line.stopped)).toBe(true);
    expect(published.size).toBe(0);
  });
});
