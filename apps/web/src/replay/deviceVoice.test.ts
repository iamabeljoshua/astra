import { describe, expect, it, vi } from 'vitest';
import { createDeviceVoice } from './deviceVoice';
import type { SpokenBeat } from './replayLesson';

const beat: SpokenBeat = { key: 'b1', turnKey: 't', atMs: 0, endMs: 2000, words: ['one', 'two', 'three', 'four'].map((text, index) => ({ text, atMs: index * 500 })) };

function makeSpeech(voices: Partial<SpeechSynthesisVoice>[]) {
  return { getVoices: () => voices as SpeechSynthesisVoice[], speak: vi.fn(), cancel: vi.fn() } as unknown as SpeechSynthesis & { speak: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn> };
}

const makeUtterance = (text: string) => ({ text }) as SpeechSynthesisUtterance;
const LOCAL_VOICE = { localService: true, default: true, lang: 'en-US' };
const follow = (word = 0, wasJump = false) => ({ beat, word, speed: 1 as const, wasJump });

describe('the device voice', () => {
  it('never uses a voice that sends the words away', () => {
    const speech = makeSpeech([{ localService: false, default: true, lang: 'en-US' }]);
    const voice = createDeviceVoice(speech, makeUtterance);
    expect(voice.canSpeak()).toBe(false);
    voice.follow(follow());
    expect(speech.speak).not.toHaveBeenCalled();
  });

  it('stays silent where the browser has no speech at all', () => {
    const voice = createDeviceVoice(undefined, makeUtterance);
    expect(voice.canSpeak()).toBe(false);
    expect(() => voice.follow(follow())).not.toThrow();
  });

  it('says a beat once, however many frames follow it', () => {
    const speech = makeSpeech([LOCAL_VOICE]);
    const voice = createDeviceVoice(speech, makeUtterance);
    voice.follow(follow());
    voice.follow(follow(1));
    voice.follow(follow(2));
    expect(speech.speak).toHaveBeenCalledOnce();
    expect(speech.speak.mock.calls[0]?.[0]).toMatchObject({ text: 'one two three four' });
  });

  it('picks up from the word it landed on after a seek', () => {
    const speech = makeSpeech([LOCAL_VOICE]);
    const voice = createDeviceVoice(speech, makeUtterance);
    voice.follow(follow());
    voice.follow(follow(2, true));
    expect(speech.speak.mock.lastCall?.[0]).toMatchObject({ text: 'three four' });
  });

  it('asks for a faster voice when the replay runs faster', () => {
    const speech = makeSpeech([LOCAL_VOICE]);
    createDeviceVoice(speech, makeUtterance).follow(follow());
    const normal = (speech.speak.mock.lastCall?.[0] as SpeechSynthesisUtterance).rate;
    const faster = makeSpeech([LOCAL_VOICE]);
    createDeviceVoice(faster, makeUtterance).follow({ ...follow(), speed: 2 });
    expect((faster.speak.mock.lastCall?.[0] as SpeechSynthesisUtterance).rate).toBeGreaterThan(normal);
  });

  it('stops when told to, and only then says the same beat again', () => {
    const speech = makeSpeech([LOCAL_VOICE]);
    const voice = createDeviceVoice(speech, makeUtterance);
    voice.follow(follow());
    speech.cancel.mockClear();
    voice.stop();
    expect(speech.cancel).toHaveBeenCalledOnce();
    voice.follow(follow(1));
    expect(speech.speak).toHaveBeenCalledTimes(2);
  });
});
