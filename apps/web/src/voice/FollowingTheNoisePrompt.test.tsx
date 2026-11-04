import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VOICE_LABELS } from '../strings';
import { NoisePrompt } from './NoisePrompt';
import { useHoldToTalk } from './useHoldToTalk';
import type { HeldMic } from './useLiveVoice';

function makeRoom() {
  let isOn = false;
  let line: string[] = [];
  const answered: string[] = [];
  const told: string[] = [];
  const mic: HeldMic = {
    isMicOn: () => isOn,
    open() {
      isOn = true;
    },
    close() {
      isOn = false;
      line = [];
    },
    endLine() {
      isOn = false;
      if (line.length > 0) answered.push(line.join(' '));
      line = [];
    },
    lowerTutor() {},
    tellHoldStarted: () => told.push('holdStarted'),
  };
  return {
    mic,
    answered,
    told,
    getIsOn: () => isOn,
    say(words: string) {
      if (isOn) line.push(words);
    },
  };
}

function SessionInNoise({ mic }: { mic: HeldMic }) {
  const hold = useHoldToTalk({ heldMic: mic, isTalkOn: true, toggleTalk: async () => {}, isEnabled: true });
  return (
    <>
      <NoisePrompt sessionId="noisy" isRoomNoisy isHolding={hold.isHolding} />
      <button type="button" {...hold.buttonProps}>Talk</button>
    </>
  );
}

const talk = () => screen.getByRole('button', { name: 'Talk' });
const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
const pressTalk = () => fireEvent.pointerDown(talk(), { button: 0, pointerId: 1, isPrimary: true });
const letGoOfTalk = () => fireEvent.pointerUp(talk(), { button: 0, pointerId: 1, isPrimary: true });
const pressSpace = (target: Element) => fireEvent.keyDown(target, { code: 'Space', key: ' ' });
const letGoOfSpace = (target: Element) => fireEvent.keyUp(target, { code: 'Space', key: ' ' });

function setUpNoisyRoom({ isPhone = false } = {}) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: isPhone && query.includes('coarse') }));
  const room = makeRoom();
  render(<SessionInNoise mic={room.mic} />);
  pressTalk();
  wait(100);
  letGoOfTalk();
  expect(room.getIsOn()).toBe(true);
  return room;
}

function expectFirstHoldHeard(room: ReturnType<typeof makeRoom>, press: () => void, letGo: () => void) {
  press();
  room.say('Do I factor');
  wait(600);
  expect(room.getIsOn()).toBe(true);
  expect(room.told).toEqual(['holdStarted']);
  room.say('the quadratic first?');
  letGo();
  expect(room.answered).toEqual(['Do I factor the quadratic first?']);
  expect(room.getIsOn()).toBe(false);
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

describe('a student in a noisy room who follows the prompt', () => {
  it('is heard from the first word on a phone, with the microphone off at release', () => {
    const room = setUpNoisyRoom({ isPhone: true });
    expect(screen.getByText(VOICE_LABELS.noisyHoldTalk)).toBeTruthy();
    expectFirstHoldHeard(room, pressTalk, letGoOfTalk);
    expect(screen.queryByText(VOICE_LABELS.noisyHoldTalk)).toBeNull();
  });

  it('is heard from the first word holding Space with focus on Talk, where a mouse tap left it', () => {
    const room = setUpNoisyRoom();
    talk().focus();
    expect(screen.getByText(VOICE_LABELS.noisyHoldSpace)).toBeTruthy();
    expectFirstHoldHeard(room, () => pressSpace(talk()), () => letGoOfSpace(talk()));
    expect(screen.queryByText(VOICE_LABELS.noisyHoldSpace)).toBeNull();
  });

  it('is heard from the first word holding Space with focus on the page, and no noise reaches the tutor after', () => {
    const room = setUpNoisyRoom();
    expect(screen.getByText(VOICE_LABELS.noisyHoldSpace)).toBeTruthy();
    expectFirstHoldHeard(room, () => pressSpace(document.body), () => letGoOfSpace(document.body));
    expect(screen.queryByText(VOICE_LABELS.noisyHoldSpace)).toBeNull();
    room.say('steady noise');
    expect(room.answered).toHaveLength(1);
  });
});

describe('a short press in the same room', () => {
  it('of Talk turns the microphone off, and starts no hold', () => {
    const room = setUpNoisyRoom();
    pressTalk();
    wait(100);
    letGoOfTalk();
    expect(room.getIsOn()).toBe(false);
    expect(room.told).toEqual([]);
  });

  it('of Space on a focused Talk turns the microphone off, as a press of Talk does', () => {
    const room = setUpNoisyRoom();
    pressSpace(talk());
    wait(100);
    letGoOfSpace(talk());
    expect(room.getIsOn()).toBe(false);
    expect(room.told).toEqual([]);
  });

  it('of Space on the page leaves the microphone on, because the student turned that on themselves', () => {
    const room = setUpNoisyRoom();
    pressSpace(document.body);
    wait(100);
    letGoOfSpace(document.body);
    expect(room.getIsOn()).toBe(true);
    expect(room.told).toEqual([]);
  });

  it('leaves the prompt up and the mode alone, so the noise alone changes nothing', () => {
    const room = setUpNoisyRoom();
    wait(60_000);
    expect(room.getIsOn()).toBe(true);
    expect(room.told).toEqual([]);
    expect(screen.getByText(VOICE_LABELS.noisyHoldSpace)).toBeTruthy();
  });
});
