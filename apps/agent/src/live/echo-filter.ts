import { getWords } from './turn-words.ts';

/** Fewer words than this could match by chance, so they are never called an echo. */
const FEWEST_ECHO_WORDS = 2;
const OLDEST_ECHO_MS = 6000;

interface SpokenWord {
  word: string;
  saidAtMs: number;
}

export interface EchoFilter {
  noteTutorWords(words: readonly string[], saidAtMs: number): void;
  isEcho(transcript: string, nowMs: number): boolean;
}

// The SDK's echo wait is off, because it deafened the transcriber for 3 s. A laptop speaker can still leak the tutor into the microphone, so a transcript that repeats what the tutor just said in order is not the student talking.
export function createEchoFilter(): EchoFilter {
  let spoken: SpokenWord[] = [];
  return {
    noteTutorWords(words, saidAtMs) {
      spoken.push(...words.flatMap((text) => getWords(text).map((word) => ({ word, saidAtMs }))));
    },
    isEcho(transcript, nowMs) {
      spoken = spoken.filter(({ saidAtMs }) => nowMs - saidAtMs <= OLDEST_ECHO_MS);
      const heard = getWords(transcript);
      if (heard.length < FEWEST_ECHO_WORDS) return false;
      const recent = spoken.map(({ word }) => word);
      return recent.some((_, start) => heard.every((word, offset) => recent[start + offset] === word));
    },
  };
}
