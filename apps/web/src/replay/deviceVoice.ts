import type { ReplaySpeed } from './replayClock';
import type { SpokenBeat } from './replayLesson';

/** An ordinary voice's pace at rate 1. Only sets how fast to ask for, and the captions keep the true time. */
const CHARACTERS_PER_SECOND = 14;
const SLOWEST_RATE = 0.7;
const FASTEST_RATE = 2.5;
const MS_PER_SECOND = 1000;

export interface DeviceVoice {
  canSpeak(): boolean;
  /** Says this beat from this word, unless it is saying it already. A beat that ends is left to finish its last word. */
  follow(spoken: { beat: SpokenBeat; word: number; speed: ReplaySpeed; wasJump: boolean }): void;
  stop(): void;
}

// Only a voice on this device, so the tutor's words, which can repeat a student's, go to no outside service, and no credit is spent. A browser with no such voice stays silent, and the captions carry the lesson.
export function createDeviceVoice(speech: SpeechSynthesis | undefined, makeUtterance: (text: string) => SpeechSynthesisUtterance = (text) => new SpeechSynthesisUtterance(text)): DeviceVoice {
  let saying: string | null = null;

  const getLocalVoice = () => {
    const voices = speech?.getVoices().filter((voice) => voice.localService) ?? [];
    return voices.find((voice) => voice.default && voice.lang.startsWith('en')) ?? voices.find((voice) => voice.lang.startsWith('en')) ?? voices[0] ?? null;
  };

  const stop = () => {
    if (saying !== null) speech?.cancel();
    saying = null;
  };

  return {
    canSpeak: () => getLocalVoice() !== null,
    stop,
    follow({ beat, word, speed, wasJump }) {
      if (saying === beat.key && !wasJump) return;
      const voice = getLocalVoice();
      if (!speech || !voice) return;
      speech.cancel();
      const text = beat.words.slice(word).map(({ text: spokenWord }) => spokenWord).join(' ');
      const utterance = makeUtterance(text);
      utterance.voice = voice;
      const remainingSeconds = Math.max(0.2, (beat.endMs - (beat.words[word]?.atMs ?? beat.atMs)) / MS_PER_SECOND / speed);
      utterance.rate = Math.min(FASTEST_RATE, Math.max(SLOWEST_RATE, text.length / CHARACTERS_PER_SECOND / remainingSeconds));
      speech.speak(utterance);
      saying = beat.key;
    },
  };
}
