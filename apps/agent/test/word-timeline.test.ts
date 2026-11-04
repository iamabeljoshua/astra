import { type Beat, parseBeat } from '@astra/contracts';
import { describe, expect, it } from 'vitest';
import { createWordTimeline } from '../src/live/word-timeline.ts';

function makeBeat(id: string, text: string): Beat {
  const parsed = parseBeat({ id, script: [text], expectsReply: false });
  if (!parsed.ok) throw new Error(parsed.problem);
  return parsed.value;
}

describe('createWordTimeline', () => {
  it('splits one voice batch across beats, and counts within each beat', () => {
    const timeline = createWordTimeline([makeBeat('one', 'First two'), makeBeat('two', 'then three')]);
    const batches = timeline.toBeatWords(['First', 'two', 'then'].map((text, index) => ({ text: `${text} `, startMs: index * 100 })));
    expect(batches).toEqual([
      { beatId: 'one', firstWord: 0, words: [{ text: 'First', startMs: 0 }, { text: 'two', startMs: 100 }] },
      { beatId: 'two', firstWord: 0, words: [{ text: 'then', startMs: 200 }] },
    ]);
    expect(timeline.toBeatWords([{ text: 'three', startMs: 300 }])).toEqual([{ beatId: 'two', firstWord: 1, words: [{ text: 'three', startMs: 300 }] }]);
  });

  it('keeps our word when the voice spells it another way, and notes it', () => {
    const timeline = createWordTimeline([makeBeat('one', 'It is 9.8 now')]);
    const batches = timeline.toBeatWords(['It', 'is', 'nine', 'now'].map((text, index) => ({ text, startMs: index })));
    expect(batches[0]?.words.map((word) => word.text)).toEqual(['It', 'is', '9.8', 'now']);
    expect(timeline.getMismatches()).toEqual([{ ours: '9.8', theirs: 'nine' }]);
  });

  it('ignores words past the end of the script', () => {
    const timeline = createWordTimeline([makeBeat('one', 'Short')]);
    expect(timeline.toBeatWords([{ text: 'Short', startMs: 0 }, { text: 'extra', startMs: 100 }])).toHaveLength(1);
  });
});
