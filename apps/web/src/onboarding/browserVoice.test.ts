import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { speak } from './browserVoice';

const DEVICE_VOICE = { name: 'Samantha', lang: 'en-US', localService: true, default: true };
const CLOUD_VOICE = { name: 'Google US English', lang: 'en-US', localService: false, default: true };

class FakeUtterance {
  voice: unknown = null;
  pitch = 1;
  rate = 1;
  onend: (() => void) | null = null;
  constructor(readonly text: string) {}
}

function stubEngine(voices: object[]) {
  const engine = { cancel: vi.fn(), speak: vi.fn(), getVoices: () => voices };
  vi.stubGlobal('speechSynthesis', engine);
  return engine;
}

beforeEach(() => vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance));
afterEach(() => vi.unstubAllGlobals());

describe('speaking through the browser', () => {
  it('speaks with an on-device voice in the tone of the picked tutor', () => {
    const engine = stubEngine([CLOUD_VOICE, DEVICE_VOICE]);

    expect(speak('Hi Maya.', 'kofi', () => undefined)).toBe(true);

    const utterance = engine.speak.mock.lastCall?.[0] as FakeUtterance;
    expect(utterance).toMatchObject({ text: 'Hi Maya.', voice: DEVICE_VOICE, pitch: 0.8, rate: 0.95 });
  });

  it('gives each voice its own tone', () => {
    const engine = stubEngine([DEVICE_VOICE]);

    const tones = (['ada', 'kofi', 'noor'] as const).map((voice) => {
      speak('Hi.', voice, () => undefined);
      const { pitch, rate } = engine.speak.mock.lastCall?.[0] as FakeUtterance;
      return `${pitch}/${rate}`;
    });

    expect(new Set(tones).size).toBe(3);
  });

  it('never sends words to a cloud voice', () => {
    const engine = stubEngine([CLOUD_VOICE]);

    expect(speak('Hi Maya.', 'ada', () => undefined)).toBe(false);

    expect(engine.speak).not.toHaveBeenCalled();
  });

  it('reports silence in a browser with no speech engine', () => {
    expect(speak('Hi Maya.', 'ada', () => undefined)).toBe(false);
  });
});
