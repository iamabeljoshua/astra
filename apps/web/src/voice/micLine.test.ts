import { afterEach, describe, expect, it, vi } from 'vitest';
import { openMicLine } from './micLine';

const makeTrack = () => ({ stop: vi.fn() }) as unknown as MediaStreamTrack;

function makeRunningContext(track: MediaStreamTrack) {
  vi.stubGlobal('MediaStream', class {});
  vi.stubGlobal(
    'AudioWorkletNode',
    class {
      port = { postMessage: vi.fn() };
      connect = vi.fn();
      disconnect = vi.fn();
    },
  );
  return { state: 'running', createMediaStreamSource: () => ({ connect: vi.fn(), disconnect: vi.fn() }), createMediaStreamDestination: () => ({ stream: { getAudioTracks: () => [track] } }) } as unknown as AudioContext;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('finishing a microphone line', () => {
  function openFinishing() {
    vi.useFakeTimers();
    const [captured, toRoom] = [makeTrack(), makeTrack()];
    const posted: string[] = [];
    const worklets: { port: { onmessage: ((event: { data: string }) => void) | null } }[] = [];
    vi.stubGlobal('MediaStream', class {});
    vi.stubGlobal(
      'AudioWorkletNode',
      class {
        port = { postMessage: (message: string) => posted.push(message), onmessage: null };
        connect = vi.fn();
        disconnect = vi.fn();
        constructor() {
          worklets.push(this);
        }
      },
    );
    const onFinished = vi.fn();
    const onSteadyNoise = vi.fn();
    const line = openMicLine(captured, { state: 'running', createMediaStreamSource: () => ({ connect: vi.fn(), disconnect: vi.fn() }), createMediaStreamDestination: () => ({ stream: { getAudioTracks: () => [toRoom] } }) } as unknown as AudioContext, { onFinished, onSteadyNoise });
    const say = (message: string) => worklets[0]?.port.onmessage?.({ data: message });
    return { captured, toRoom, posted, line, say, onFinished, onSteadyNoise };
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ends the capture at once, and keeps the track to the room until what it holds has gone', async () => {
    const { captured, toRoom, line, posted, say, onFinished } = openFinishing();
    let hasLeft = false;
    void line.finish().then(() => (hasLeft = true));
    expect(captured.stop).toHaveBeenCalled();
    expect(toRoom.stop).not.toHaveBeenCalled();
    expect(posted).toContain('endInput');
    expect(onFinished).not.toHaveBeenCalled();
    say('drained');
    expect(toRoom.stop).toHaveBeenCalled();
    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(hasLeft).toBe(false);
    await vi.advanceTimersByTimeAsync(300);
    expect(hasLeft).toBe(true);
  });

  it('gives up on a line that never drains, and drops what it held', async () => {
    const { toRoom, line, posted } = openFinishing();
    let hasLeft = false;
    void line.finish().then(() => (hasLeft = true));
    await vi.advanceTimersByTimeAsync(14_000);
    expect(hasLeft).toBe(true);
    expect(toRoom.stop).toHaveBeenCalled();
    expect(posted).toContain('close');
  });

  it('lets a hard stop end a finishing line at once, and still says the line has ended', async () => {
    const { line, posted, onFinished } = openFinishing();
    let hasLeft = false;
    void line.finish().then(() => (hasLeft = true));
    line.stop();
    await vi.advanceTimersByTimeAsync(0);
    expect(hasLeft).toBe(true);
    expect(posted).toContain('close');
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it('says nothing of a line stopped without finishing, because press-once has no line end', () => {
    const { line, onFinished } = openFinishing();
    line.stop();
    expect(onFinished).not.toHaveBeenCalled();
  });

  it('finishes at once with no audio graph, because nothing is held', async () => {
    const captured = makeTrack();
    await openMicLine(captured, { state: 'suspended' } as unknown as AudioContext).finish();
    expect(captured.stop).toHaveBeenCalled();
  });

  it('passes steady noise up from the worklet', () => {
    const { say, onSteadyNoise } = openFinishing();
    say('steadyNoise');
    expect(onSteadyNoise).toHaveBeenCalledTimes(1);
  });
});

describe('stopping a microphone line', () => {
  it('ends the capture itself, not only the track the room gets, because the capture is what hears the student', () => {
    const [captured, toRoom] = [makeTrack(), makeTrack()];
    openMicLine(captured, makeRunningContext(toRoom)).stop();
    expect(captured.stop).toHaveBeenCalled();
    expect(toRoom.stop).toHaveBeenCalled();
  });

  it('ends the capture with no audio graph too', () => {
    const captured = makeTrack();
    openMicLine(captured, { state: 'suspended' } as unknown as AudioContext).stop();
    expect(captured.stop).toHaveBeenCalled();
  });
});
