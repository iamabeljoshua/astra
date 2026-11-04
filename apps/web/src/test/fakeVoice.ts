import { vi } from 'vitest';
import type { LiveVoice, LiveVoiceView } from '../voice/liveVoice';

const BASE_VIEW: LiveVoiceView = { phase: 'live', mic: 'off', isSoundBlocked: false, isHeard: false, isThinking: false, isTutorSpeaking: false, closedBecause: null, studentLines: [], tutorHeard: [], tutorComing: [] };

export function makeFakeVoice(view: Partial<LiveVoiceView> = {}): LiveVoice {
  let current = { ...BASE_VIEW, ...view };
  const listeners = new Set<() => void>();
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
    setMicOn: vi.fn(async (isOn: boolean) => {
      current = { ...current, mic: isOn ? 'on' : 'off' };
      listeners.forEach((listener) => listener());
    }),
    turnOnSound: vi.fn(),
    mark: vi.fn(),
    close: vi.fn(async () => {}),
  };
}
