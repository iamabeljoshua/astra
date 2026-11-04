import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isOpenToSpace, useHoldToTalk } from './useHoldToTalk';
import type { HeldMic } from './useLiveVoice';

function makeHeldMic() {
  let isOn = false;
  const calls: string[] = [];
  const mic: HeldMic = {
    isMicOn: () => isOn,
    open() {
      isOn = true;
      calls.push('open');
    },
    close() {
      isOn = false;
      calls.push('close');
    },
    endLine() {
      isOn = false;
      calls.push('endLine');
    },
    lowerTutor: () => calls.push('lower'),
    tellHoldStarted: () => calls.push('told'),
  };
  return { mic, calls, getIsOn: () => isOn };
}

function Screen({ mic, isEnabled = true, toggleTalk }: { mic: HeldMic; isEnabled?: boolean; toggleTalk: () => Promise<void> }) {
  const hold = useHoldToTalk({ heldMic: mic, isTalkOn: true, toggleTalk, isEnabled });
  return (
    <div>
      <p data-testid="plain">words</p>
      <textarea aria-label="reply" />
      <input aria-label="name" />
      <button type="button">Other</button>
      <div role="textbox" tabIndex={0} aria-label="math" />
      <button type="button" aria-pressed={mic.isMicOn()} {...hold.buttonProps}>Talk</button>
      {hold.hasHitLimit && <p>limit</p>}
    </div>
  );
}

function setUp({ isEnabled = true } = {}) {
  const held = makeHeldMic();
  const toggleTalk = vi.fn(async () => {});
  render(<Screen mic={held.mic} isEnabled={isEnabled} toggleTalk={toggleTalk} />);
  return { ...held, toggleTalk };
}

const talk = () => screen.getByRole('button', { name: 'Talk' });
const spaceDown = (target: Element, init: KeyboardEventInit = {}) => fireEvent.keyDown(target, { code: 'Space', key: ' ', ...init });
const spaceUp = (target: Element) => fireEvent.keyUp(target, { code: 'Space', key: ' ' });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('a tutor that can no longer answer', () => {
  it('takes no press of Talk, so a hold cannot start on a closed tutor', () => {
    const { calls } = setUp({ isEnabled: false });
    fireEvent.pointerDown(talk(), { button: 0, pointerId: 1 });
    expect(calls).toEqual([]);
  });
});

describe('Space', () => {
  it('holds on the page, and scrolls nothing', () => {
    const { calls } = setUp();
    const wasPrevented = !spaceDown(document.body);
    expect(wasPrevented).toBe(true);
    act(() => void vi.advanceTimersByTime(300));
    spaceUp(document.body);
    expect(calls).toEqual(['open', 'lower', 'told', 'endLine']);
  });

  it('types a space in a text field and never opens the microphone', () => {
    const { calls } = setUp();
    for (const name of ['reply', 'name', 'math']) {
      const field = screen.getByRole('textbox', { name });
      const wasPrevented = !spaceDown(field);
      expect(wasPrevented).toBe(false);
      spaceUp(field);
    }
    expect(calls).toEqual([]);
  });

  it('presses any other button it is on, and never opens the microphone', () => {
    const { calls } = setUp();
    const other = screen.getByRole('button', { name: 'Other' });
    expect(!spaceDown(other)).toBe(false);
    spaceUp(other);
    expect(calls).toEqual([]);
  });

  it('holds from a heading the app focused when the screen opened, because that is where focus starts', () => {
    const { calls } = setUp();
    const heading = document.createElement('h1');
    heading.tabIndex = -1;
    document.body.append(heading);
    spaceDown(heading);
    spaceUp(heading);
    heading.remove();
    expect(calls[0]).toBe('open');
  });

  it('holds from inside a region that only names itself', () => {
    const region = document.createElement('div');
    region.setAttribute('role', 'status');
    expect(isOpenToSpace(region)).toBe(true);
  });

  it('leaves a custom element alone, such as a math field', () => {
    const field = document.createElement('math-field');
    document.body.append(field);
    expect(isOpenToSpace(field)).toBe(false);
    field.remove();
  });

  it('counts a key repeat as nothing', () => {
    const { calls } = setUp();
    spaceDown(document.body);
    act(() => void vi.advanceTimersByTime(300));
    const before = [...calls];
    for (let repeat = 0; repeat < 20; repeat += 1) spaceDown(document.body, { repeat: true });
    expect(calls).toEqual(before);
  });

  it('does nothing with a modifier down, so a system shortcut never opens the microphone', () => {
    const { calls } = setUp();
    for (const modifier of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey']) spaceDown(document.body, { [modifier]: true });
    expect(calls).toEqual([]);
  });

  it('does nothing while an input method is composing', () => {
    const { calls } = setUp();
    spaceDown(document.body, { isComposing: true });
    expect(calls).toEqual([]);
  });

  it('does nothing once the room is over, and leaves Space to the page', () => {
    const { calls } = setUp({ isEnabled: false });
    expect(!spaceDown(document.body)).toBe(false);
    expect(calls).toEqual([]);
  });

  it('on a focused Talk means what a press of Talk means, so a tap leaves it on, and a hold ends on release', () => {
    const { calls, getIsOn } = setUp();
    spaceDown(talk());
    spaceUp(talk());
    expect(getIsOn()).toBe(true);
    expect(calls).toEqual(['open', 'lower']);
  });

  it('cancels both Space events on Talk, so the browser sends no click, and a later Enter still counts', () => {
    const { toggleTalk } = setUp();
    expect(!spaceDown(talk())).toBe(true);
    expect(!spaceUp(talk())).toBe(true);
    fireEvent.click(talk());
    expect(toggleTalk).toHaveBeenCalledTimes(1);
  });
});

describe('losing a held key', () => {
  const heldOnPage = () => {
    const held = setUp();
    spaceDown(document.body);
    act(() => void vi.advanceTimersByTime(400));
    return held;
  };

  it.each([
    ['the window losing focus', () => fireEvent.blur(window)],
    ['the page leaving', () => fireEvent(window, new Event('pagehide'))],
    ['Meta going down, because macOS then sends no key-up', () => fireEvent.keyDown(document.body, { key: 'Meta', code: 'MetaLeft' })],
    [
      'the tab hiding',
      () => {
        vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
        fireEvent(document, new Event('visibilitychange'));
        vi.restoreAllMocks();
      },
    ],
  ])('closes on %s', (_name, lose) => {
    const { getIsOn, calls } = heldOnPage();
    lose();
    expect(getIsOn()).toBe(false);
    expect(calls.at(-1)).toBe('endLine');
  });

  it('closes when the screen goes', () => {
    const held = makeHeldMic();
    const { unmount } = render(<Screen mic={held.mic} toggleTalk={async () => {}} />);
    spaceDown(document.body);
    act(() => void vi.advanceTimersByTime(400));
    unmount();
    expect(held.getIsOn()).toBe(false);
  });

  it('takes a Space press again after losing one, with no key-up ever seen', () => {
    const { calls } = heldOnPage();
    fireEvent.blur(window);
    const before = calls.length;
    spaceDown(document.body);
    expect(calls.length).toBeGreaterThan(before);
  });

  it('closes at the limit, shows why, and a repeat of the same key does not reopen', () => {
    const { getIsOn, calls } = heldOnPage();
    act(() => void vi.advanceTimersByTime(60_000));
    expect(getIsOn()).toBe(false);
    expect(screen.getByText('limit')).toBeTruthy();
    const opens = calls.filter((call) => call === 'open').length;
    spaceDown(document.body, { repeat: true });
    expect(calls.filter((call) => call === 'open')).toHaveLength(opens);
  });
});

describe('the Talk button', () => {
  it('stays on after a quick press with the pointer', () => {
    const { getIsOn, toggleTalk } = setUp();
    fireEvent.pointerDown(talk(), { button: 0, pointerId: 1 });
    act(() => void vi.advanceTimersByTime(100));
    fireEvent.pointerUp(talk(), { button: 0, pointerId: 1 });
    fireEvent.click(talk());
    expect(getIsOn()).toBe(true);
    expect(toggleTalk).not.toHaveBeenCalled();
  });

  it('closes on release after a hold, even outside the window', () => {
    const { getIsOn, calls } = setUp();
    fireEvent.pointerDown(talk(), { button: 0, pointerId: 1 });
    act(() => void vi.advanceTimersByTime(400));
    expect(getIsOn()).toBe(true);
    fireEvent.pointerUp(window, { button: 0, pointerId: 1 });
    expect(getIsOn()).toBe(false);
    expect(calls.at(-1)).toBe('endLine');
  });

  it('does not read the click that ends a long hold as a press, which would turn the microphone back on', () => {
    const { getIsOn, toggleTalk } = setUp();
    fireEvent.pointerDown(talk(), { button: 0, pointerId: 1 });
    act(() => void vi.advanceTimersByTime(3000));
    fireEvent.pointerUp(talk(), { button: 0, pointerId: 1 });
    fireEvent.click(talk());
    expect(getIsOn()).toBe(false);
    expect(toggleTalk).not.toHaveBeenCalled();
  });

  it('stops a key-up with no key-down from clicking Talk, which a browser does while the pointer is down', () => {
    setUp();
    expect(!spaceUp(talk())).toBe(true);
  });

  it.each(['pointerCancel', 'lostPointerCapture'] as const)('closes on %s', (event) => {
    const { getIsOn } = setUp();
    fireEvent.pointerDown(talk(), { button: 0, pointerId: 1 });
    act(() => void vi.advanceTimersByTime(400));
    fireEvent[event](talk(), { pointerId: 1 });
    expect(getIsOn()).toBe(false);
  });

  it('ignores any button but the main one', () => {
    const { calls } = setUp();
    fireEvent.pointerDown(talk(), { button: 2, pointerId: 1 });
    expect(calls).toEqual([]);
  });

  it('gives a click with no press, from Enter or a screen reader, the press-once meaning', () => {
    const { toggleTalk } = setUp();
    act(() => void vi.advanceTimersByTime(1000));
    fireEvent.click(talk());
    expect(toggleTalk).toHaveBeenCalledTimes(1);
  });

  it('does not flip on Enter held down', () => {
    setUp();
    expect(!fireEvent.keyDown(talk(), { key: 'Enter', repeat: true })).toBe(true);
  });

  it('tells assistive technology about Space, and how the press works', () => {
    setUp();
    expect(talk().getAttribute('aria-keyshortcuts')).toBe('Space');
    expect(talk().getAttribute('title')).toContain('hold');
  });
});
