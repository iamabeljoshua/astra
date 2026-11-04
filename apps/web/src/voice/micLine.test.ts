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
