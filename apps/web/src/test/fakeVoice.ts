import { vi } from 'vitest';
import type { LiveVoice, LiveVoiceView } from '../voice/liveVoice';

const BASE_VIEW: LiveVoiceView = { phase: 'live', mic: 'off', isRoomNoisy: false, isSoundBlocked: false, isQuietWarning: false, isHeard: false, isThinking: false, isTutorSpeaking: false, closedBecause: null, startedFresh: false, hasTutorStarted: false, studentLines: [], tutorHeard: [], tutorComing: [] };

export function makeFakeVoice(view: Partial<LiveVoiceView> = {}): LiveVoice {
  let current = { ...BASE_VIEW, ...view };
  const listeners = new Set<() => void>();
  const setMic = (isOn: boolean) => {
    current = { ...current, mic: isOn ? 'on' : 'off' };
    listeners.forEach((listener) => listener());
  };
  return {
    records: {} as LiveVoice['records'],
    player: {} as LiveVoice['player'],
    getView: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getBoardNow: () => ({ board: { elements: new Map(), focus: null }, atMs: 0 }),
    sendTyped: vi.fn(),
    reportMarkNotDrawn: vi.fn(),
    toggleMic: vi.fn(async () => setMic(current.mic !== 'on')),
    isMicOn: () => current.mic === 'on',
    setMic: vi.fn(async (isOn: boolean) => setMic(isOn)),
    endLine: vi.fn(() => setMic(false)),
    lowerTutor: vi.fn(),
    tellHoldStarted: vi.fn(),
    sayStillHere: vi.fn(),
    turnOnSound: vi.fn(),
    mark: vi.fn(),
    close: vi.fn(async () => {}),
  };
}
