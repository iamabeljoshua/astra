import { describe, expect, it, vi } from 'vitest';
import { createPlayoutTracker } from '../src/player/playout-tracker.ts';

const FRAME_MS = 20;
const FRAMES = 500;
const TOLERANCE_MS = 20;

function getReportedMs(getFrameAtMs: (frame: number) => number, frameMs = FRAME_MS, frames = FRAMES) {
  const tracker = createPlayoutTracker({ onRanDry: () => {} });
  let reportedMs = 0;
  for (let frame = 0; frame < frames; frame++) reportedMs += tracker.onFrame(getFrameAtMs(frame), frameMs)?.ms ?? 0;
  tracker.close();
  return reportedMs;
}

describe('createPlayoutTracker', () => {
  it('adds up lateness when no single frame is 20 ms late, as a voice at 91% speed is', () => {
    expect(Math.abs(getReportedMs((frame) => frame * 22) - (FRAMES - 1) * 2)).toBeLessThanOrEqual(TOLERANCE_MS);
  });

  it('reports every 15 ms stall', () => {
    expect(Math.abs(getReportedMs((frame) => frame * FRAME_MS + Math.floor(frame / 10) * 15) - 49 * 15)).toBeLessThanOrEqual(TOLERANCE_MS);
  });

  it('reports nothing for a voice on time, or for frames that jitter around their time', () => {
    expect(getReportedMs((frame) => frame * FRAME_MS)).toBe(0);
    expect(getReportedMs((frame) => frame * FRAME_MS + ([3, -3, 2, -2][frame % 4] as number))).toBe(0);
  });

  it('banks no credit from a burst, so a stall after it is still reported', () => {
    const BURST_FRAMES = 50;
    const STALL_MS = 60;
    const burstEndMs = BURST_FRAMES * FRAME_MS;
    const getFrameAtMs = (frame: number) => (frame < BURST_FRAMES ? 0 : burstEndMs + STALL_MS + (frame - BURST_FRAMES) * FRAME_MS);
    expect(getReportedMs(getFrameAtMs, FRAME_MS, BURST_FRAMES + 10)).toBe(STALL_MS);
  });

  it('reads a stall the same on 100 ms chunks', () => {
    const chunkMs = 100;
    const getFrameAtMs = (frame: number) => frame * chunkMs + (frame >= 5 ? 300 : 0);
    expect(getReportedMs(getFrameAtMs, chunkMs, 10)).toBe(300);
  });

  it('reports the moment the queue runs dry, and closes that gap on the next frame even if it is barely late', () => {
    vi.useFakeTimers();
    const dry: { atMs: number }[] = [];
    const tracker = createPlayoutTracker({ onRanDry: (gap) => dry.push(gap) });
    tracker.onFrame(0, FRAME_MS);
    vi.advanceTimersByTime(FRAME_MS + 20);
    expect(dry).toEqual([{ atMs: FRAME_MS }]);
    expect(tracker.onFrame(FRAME_MS + 19, FRAME_MS)).toEqual({ atMs: FRAME_MS, ms: 19 });
    tracker.close();
    vi.useRealTimers();
  });

  it('sends no dry report once closed, because no later word needs it', () => {
    vi.useFakeTimers();
    const onRanDry = vi.fn();
    const tracker = createPlayoutTracker({ onRanDry });
    tracker.onFrame(0, FRAME_MS);
    tracker.close();
    vi.advanceTimersByTime(1000);
    expect(onRanDry).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
