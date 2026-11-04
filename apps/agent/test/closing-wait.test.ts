import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClosingWait, type ClosingWait } from '../src/live/closing-wait.ts';

const LEFT_MS = 15_000;
const DROPPED_MS = 120_000;

describe('how long a room waits for a student who left', () => {
  let close: ReturnType<typeof vi.fn>;
  let wait: ClosingWait;

  beforeEach(() => {
    vi.useFakeTimers();
    close = vi.fn();
    wait = createClosingWait({ leftOnPurposeMs: LEFT_MS, linkDroppedMs: DROPPED_MS, onClose: close });
  });

  afterEach(() => {
    wait.cancel();
    vi.useRealTimers();
  });

  it('closes after the wait for how they left', () => {
    wait.studentLeft({ leftOnPurpose: true });
    vi.advanceTimersByTime(LEFT_MS - 1);
    expect(close).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(close).toHaveBeenCalledOnce();
  });

  it('waits longer for a dropped link', () => {
    wait.studentLeft({ leftOnPurpose: false });
    vi.advanceTimersByTime(DROPPED_MS - 1);
    expect(close).not.toHaveBeenCalled();
  });

  it('stays open from the moment they join again, before they have said anything', () => {
    wait.studentLeft({ leftOnPurpose: true });
    vi.advanceTimersByTime(LEFT_MS - 1);
    wait.cancel();
    vi.advanceTimersByTime(LEFT_MS * 2);
    expect(close).not.toHaveBeenCalled();
  });

  it('starts again if they leave again', () => {
    wait.studentLeft({ leftOnPurpose: true });
    wait.cancel();
    wait.studentLeft({ leftOnPurpose: true });
    vi.advanceTimersByTime(LEFT_MS);
    expect(close).toHaveBeenCalledOnce();
  });
});
