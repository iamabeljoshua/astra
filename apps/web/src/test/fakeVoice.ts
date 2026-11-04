import { vi } from 'vitest';
import type { LiveVoice, LiveVoiceView } from '../voice/liveVoice';

const BASE_VIEW: LiveVoiceView = { phase: 'live', mic: 'off', isSoundBlocked: false, isQuietWarning: false, isHeard: false, isThinking: false, isTutorSpeaking: false, closedBecause: null, firstWord: null, isStopped: false, typingNoteCount: 0, costUsd: null, startedFresh: false, hasTutorStarted: false, studentLines: [], tutorHeard: [], tutorComing: [], recap: null, isRecapDecided: false };

export function makeFakeVoice(view: Partial<LiveVoiceView> = {}): LiveVoice {
  let current = { ...BASE_VIEW, ...view };
  const listeners = new Set<() => void>();
  return {
    canAskForRecap: vi.fn(() => false),
    askForRecap: vi.fn(() => false),
    records: {} as LiveVoice['records'],
    player: {} as LiveVoice['player'],
    getView: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getBoardNow: () => ({ board: { elements: new Map(), focus: null, stage: null, refusedSliders: [] }, atMs: 0 }),
    sendTyped: vi.fn(),
    sendOpening: vi.fn(),
    reportMarkNotDrawn: vi.fn(),
    sendWork: vi.fn(),
    movePoint: vi.fn(),
    sendInkStroke: vi.fn(),
    sendInkPeek: vi.fn(),
    sendInkDone: vi.fn(),
    noteTyping: vi.fn(),
    sendPause: vi.fn(),
    stopTutor: vi.fn(),
    getLoudness: () => 0,
    toggleMic: vi.fn(async () => {
      current = { ...current, mic: current.mic === 'on' ? 'off' : 'on' };
      listeners.forEach((listener) => listener());
    }),
    sayStillHere: vi.fn(),
    turnOnSound: vi.fn(),
    mark: vi.fn(),
    close: vi.fn(async () => {}),
  };
}
