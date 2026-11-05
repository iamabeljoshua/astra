import { type Beat, type BeatId, getBeatText, getSpokenWords, type TimedWord } from '@astra/contracts';

export interface BeatWords {
  beatId: BeatId;
  firstWord: number;
  words: TimedWord[];
}

interface ExpectedWord {
  beatId: BeatId;
  wordInBeat: number;
  text: string;
  startMs: number | null;
}

const ENDS_A_SENTENCE = /[.!?]["')\]]*$/;
const ENDS_A_CLAUSE = /[,;:]["')\]]*$/;

export type SpeechBreak = 'sentence' | 'clause';

// A voice names words its own way, so its words are matched to ours by position and `atWord` always counts ours. Beats arrive as the brain writes them.
export function createWordTimeline(beats: readonly Beat[] = []) {
  const expected: ExpectedWord[] = [];
  let nextWord = 0;
  const mismatches: { ours: string; theirs: string }[] = [];
  let breakCursor = 0;

  const addBeat = (beat: Beat) => {
    getSpokenWords(getBeatText(beat)).forEach((text, wordInBeat) => expected.push({ beatId: beat.id, wordInBeat, text, startMs: null }));
  };
  beats.forEach(addBeat);

  const toBeatWords = (voiceWords: readonly TimedWord[]): BeatWords[] => {
    const batches = new Map<BeatId, BeatWords>();
    for (const voiceWord of voiceWords) {
      const ours = expected[nextWord];
      if (!ours) return [...batches.values()];
      nextWord += 1;
      ours.startMs = voiceWord.startMs;
      if (ours.text !== voiceWord.text.trim()) mismatches.push({ ours: ours.text, theirs: voiceWord.text.trim() });
      const batch = batches.get(ours.beatId) ?? { beatId: ours.beatId, firstWord: ours.wordInBeat, words: [] };
      batch.words.push({ text: ours.text, startMs: voiceWord.startMs });
      batches.set(ours.beatId, batch);
    }
    return [...batches.values()];
  };

  const getWordsSent = (positionMs: number): Map<BeatId, number> => {
    const sent = new Map<BeatId, number>();
    for (const word of expected) {
      if (word.startMs !== null && word.startMs <= positionMs) sent.set(word.beatId, word.wordInBeat + 1);
    }
    return sent;
  };

  /** True once for each sentence end whose next word starts by `positionMs`. */
  const getCrossedBreak = (positionMs: number): SpeechBreak | null => {
    let crossed: SpeechBreak | null = null;
    for (; breakCursor < expected.length; breakCursor += 1) {
      const { startMs } = expected[breakCursor] as ExpectedWord;
      if (startMs === null || startMs > positionMs) break;
      const word = expected[breakCursor - 1]?.text ?? '';
      if (ENDS_A_SENTENCE.test(word)) crossed = 'sentence';
      else if (crossed === null && ENDS_A_CLAUSE.test(word)) crossed = 'clause';
    }
    return crossed;
  };

  return { addBeat, toBeatWords, getWordsSent, getCrossedBreak, getMismatches: () => mismatches, isComplete: () => nextWord === expected.length };
}
