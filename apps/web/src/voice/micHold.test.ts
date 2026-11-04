import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMicHold } from './micHold';

function makeHold() {
  let isMicOn = false;
  const calls: string[] = [];
  const hold = createMicHold({
    getIsMicOn: () => isMicOn,
    openMic() {
      isMicOn = true;
      calls.push('open');
    },
    closeMic() {
      isMicOn = false;
      calls.push('close');
    },
    endLine() {
      isMicOn = false;
      calls.push('endLine');
    },
    lowerTutor: () => calls.push('lower'),
    tellHoldStarted: () => calls.push('told'),
    onHolding: (isHolding) => calls.push(isHolding ? 'holding' : 'notHolding'),
    onLimitReached: () => calls.push('limit'),
  });
  return { hold, calls, isMicOn: () => isMicOn };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('holding to talk', () => {
  it('becomes a hold at 300 ms and not before', () => {
    const { hold, calls } = makeHold();
    hold.press('space');
    expect(calls).toEqual(['open', 'lower']);
    vi.advanceTimersByTime(299);
    expect(calls).not.toContain('told');
    vi.advanceTimersByTime(1);
    expect(calls).toEqual(['open', 'lower', 'holding', 'told']);
  });

  it('leaves a quick tap of Talk on, with the tutor never told of a hold', () => {
    const { hold, calls, isMicOn } = makeHold();
    hold.press('talkButton');
    vi.advanceTimersByTime(100);
    hold.release('talkButton');
    vi.advanceTimersByTime(5000);
    expect(isMicOn()).toBe(true);
    expect(calls).not.toContain('told');
  });

  it('closes at the limit with the key still down, and a key repeat cannot reopen it', () => {
    const { hold, calls, isMicOn } = makeHold();
    hold.press('space');
    vi.advanceTimersByTime(300 + 60_000);
    expect(isMicOn()).toBe(false);
    expect(calls).toContain('limit');
    expect(calls.at(-1)).toBe('limit');
  });

  it('runs no timer after a release, so nothing fires later', () => {
    const { hold, calls } = makeHold();
    hold.press('space');
    vi.advanceTimersByTime(400);
    hold.release('space');
    const before = [...calls];
    vi.advanceTimersByTime(120_000);
    expect(calls).toEqual(before);
  });

  it('closes on losing the page, and on closing', () => {
    const lost = makeHold();
    lost.hold.press('space');
    lost.hold.loseFinger();
    expect(lost.isMicOn()).toBe(false);
    const closed = makeHold();
    closed.hold.press('talkButton');
    vi.advanceTimersByTime(400);
    closed.hold.close();
    expect(closed.isMicOn()).toBe(false);
    expect(closed.calls).toContain('notHolding');
  });

  it('takes the microphone going off another way with one line end, and the release after it does nothing', () => {
    const { hold, calls } = makeHold();
    hold.press('space');
    vi.advanceTimersByTime(400);
    hold.noteMicOff();
    hold.release('space');
    expect(calls.filter((call) => call === 'close' || call === 'endLine')).toEqual(['endLine']);
  });
});
