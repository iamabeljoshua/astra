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
}

function getExpectedWords(beats: readonly Beat[]): ExpectedWord[] {
  return beats.flatMap((beat) => getSpokenWords(getBeatText(beat)).map((text, wordInBeat) => ({ beatId: beat.id, wordInBeat, text })));
}

// A voice names words its own way, so its words are matched to ours by position and `atWord` always counts ours.
export function createWordTimeline(beats: readonly Beat[]) {
  const expected = getExpectedWords(beats);
  let nextWord = 0;
  const mismatches: { ours: string; theirs: string }[] = [];

  const toBeatWords = (voiceWords: readonly TimedWord[]): BeatWords[] => {
    const batches = new Map<BeatId, BeatWords>();
    for (const voiceWord of voiceWords) {
      const ours = expected[nextWord];
      if (!ours) return [...batches.values()];
      nextWord += 1;
      if (ours.text !== voiceWord.text.trim()) mismatches.push({ ours: ours.text, theirs: voiceWord.text.trim() });
      const batch = batches.get(ours.beatId) ?? { beatId: ours.beatId, firstWord: ours.wordInBeat, words: [] };
      batch.words.push({ text: ours.text, startMs: voiceWord.startMs });
      batches.set(ours.beatId, batch);
    }
    return [...batches.values()];
  };

  return { toBeatWords, getMismatches: () => mismatches, isComplete: () => nextWord === expected.length };
}
