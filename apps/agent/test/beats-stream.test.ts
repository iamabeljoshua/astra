import { type BoardKinds, getCues, getSpokenWords, parseWrittenBeat } from '@astra/contracts';
import { describe, expect, it } from 'vitest';
import { BeatTextReader, TURN_WORDS_TO_WRAP, type WrittenBeatParts } from '../src/tutor/beat-text-reader.ts';

const HIDE = '{"kind":"hide","target":"a"}';
const CLEAR = '{"kind":"clearBoard"}';
const MANY_WORDS = Array.from({ length: 130 }, (_, index) => `word${index}`).join(' ');
const FIRST_NINETY = Array.from({ length: 90 }, (_, index) => `word${index}`).join(' ');
const ONE_LONG_WORD = 'a'.repeat(1300);
const MANY_COMMANDS = `Watch ${CLEAR.repeat(14)}this.`;
const BAD_SIMULATE = '{"kind":"simulate","id":"s","simulation":{"model":"bogus"}}';
const RUN_S = '{"kind":"runSimulation","target":"s","action":"play"}';
const OVER_THE_LIMIT = 16 * 1024;
const LONG_STRING = `{"kind":"text","id":"t","text":"${'y'.repeat(OVER_THE_LIMIT)}","handwritten":true}`;
const LONG_LIST = `{"kind":"plot","id":"p2","expression":"x","domain":[${'1,'.repeat(OVER_THE_LIMIT / 2)}1]}`;
const FRAGMENT_SIZES = [1, 3, 14, 60];

interface ReaderCase {
  name: string;
  text: string;
  spoken: string;
  cues?: number[];
  bad?: number;
  beats?: number;
  replies?: boolean[];
  textAfter?: string;
}

const CASES: ReaderCase[] = [
  { name: 'a command before its word', text: `Your ${HIDE}hand.`, spoken: 'Your hand. ', cues: [1] },
  { name: 'a command right after a word, then a space', text: `Your hand,${HIDE} right up.`, spoken: 'Your hand, right up.', cues: [2] },
  { name: 'a command inside a word', text: `Watch this ar${HIDE}row now.`, spoken: 'Watch this arrow now.', cues: [2] },
  { name: 'a command at the end of a beat', text: `Watch this.${HIDE}\nThen this.`, spoken: 'Watch this. Then this. ', cues: [1] },
  { name: 'a line with only a command waits for the next word', text: `${CLEAR}\nWatch this.`, spoken: 'Watch this.', cues: [0] },
  { name: 'a command with no word after it at the end of the turn', text: `Watch this.\n${CLEAR}`, spoken: 'Watch this.', cues: [], bad: 1 },
  { name: 'keys in another order', text: 'Watch {"target":"a","kind":"hide"}this.', spoken: 'Watch this.', cues: [1] },
  { name: 'a space after the brace', text: 'Watch { "kind" : "hide", "target":"a" }this.', spoken: 'Watch this.', cues: [1] },
  { name: 'JSON with no kind is not spoken', text: 'Watch {"hello":"world"}this.', spoken: 'Watch this.', bad: 1 },
  { name: 'braces in speech', text: 'The set {1, 2, 3} has three members.', spoken: 'The set 1, 2, 3 has three members.' },
  { name: 'an open brace that never closes', text: 'A notation like {x where x is even. Then the rest.', spoken: 'A notation like x where x is even. Then the rest.' },
  { name: 'no newline at the end', text: 'So its sideways speed never changes', spoken: 'So its sideways speed never changes' },
  { name: 'a command cut off by max_tokens', text: 'Watch this {"kind":"hide","tar', spoken: 'Watch this ', bad: 1 },
  { name: 'a command cut off by a newline, then more speech', text: 'Watch {"kind":"hide"\nThis still plays.', spoken: 'Watch This still plays.', bad: 1 },
  { name: 'an unclosed command does not swallow the words after it', text: 'Watch {"kind":"hide","target":"a" lets go now.\nNext.', spoken: 'Watch lets go now. Next.', bad: 1 },
  { name: 'an unclosed command, then a good one', text: `Watch {"kind":"hide","target":"a" lets ${HIDE}go.`, spoken: 'Watch lets go.', bad: 1, cues: [2] },
  { name: 'broken JSON that closes', text: 'Watch {"kind":hide}this.', spoken: 'Watch this.', bad: 1 },
  { name: 'a string that never closes loses the rest of its line, and says so', text: 'Watch {"kind":"text","id":"a","text":"never closed lets go.\nNext.', spoken: 'Watch Next.', bad: 1 },
  { name: 'a command the contracts refuse', text: 'Watch {"kind":"laser"}this.', spoken: 'Watch this.', bad: 1 },
  { name: 'a brace inside a label', text: 'Look {"kind":"text","id":"t","text":"set {1}"}here.', spoken: 'Look here.', cues: [1] },
  { name: 'a quote inside a label', text: 'Look {"kind":"text","id":"t","text":"say \\"hi\\" }"}here.', spoken: 'Look here.', cues: [1] },
  { name: 'true, false, and numbers in a command', text: 'Look {"kind":"text","id":"t","text":"x","handwritten":true}here {"kind":"markValue","id":"m","target":"p","at":1e2}now.', spoken: 'Look here now.', cues: [1, 2] },
  { name: 'text with a NUL and a broken character', text: 'Watch\u0000 this \uD83D now.', spoken: 'Watch this  now.' },
  { name: 'a long run of combining marks is cut to a few', text: `Wa${'\u0301'.repeat(40)}tch this.`, spoken: `Wa${'\u0301'.repeat(4)}tch this.`.normalize('NFC') },
  { name: 'a private use character and a hidden selector are not spoken', text: 'Watch\uE000 this\u{E0100} now.', spoken: 'Watch this now.' },
  { name: 'markdown and emoji are not spoken', text: 'This is *really* _neat_ `code` \u{1F600} now.', spoken: 'This is really neat code  now.' },
  { name: 'TeX marks are not spoken', text: 'So $x^2$ and \\frac are here.', spoken: 'So x2 and frac are here.' },
  { name: 'a model that forgets the format stops at the turn limit', text: MANY_WORDS, spoken: FIRST_NINETY, beats: 2 },
  { name: 'one word longer than a beat holds', text: ONE_LONG_WORD, spoken: `${'a'.repeat(600)} ${'a'.repeat(600)} ${'a'.repeat(100)}`, beats: 3 },
  { name: 'more commands than a beat holds', text: MANY_COMMANDS, spoken: 'Watch this.', cues: Array<number>(12).fill(1), bad: 2 },
  { name: 'the same id twice in a beat', text: 'Watch {"kind":"writeMath","id":"e","tex":"x"}this {"kind":"writeMath","id":"e","tex":"y"}now.', spoken: 'Watch this now.', cues: [1], bad: 1 },
  { name: 'a dropped simulate takes its later commands with it, and the words still play', text: `Watch ${BAD_SIMULATE}this ${RUN_S}go.`, spoken: 'Watch this go.', bad: 2 },
  { name: 'a command on an element of the wrong kind', text: 'Watch {"kind":"runSimulation","target":"p","action":"play"}this.', spoken: 'Watch this.', bad: 1 },
  { name: 'a pretty-printed command is a command', text: 'Watch {\n  "kind": "hide",\n  "target": "a"\n}this.', spoken: 'Watch this.', cues: [1] },
  { name: 'a newline in the middle of a command is a command', text: 'Watch {"kind":"hide",\n"target":"a"}this now.', spoken: 'Watch this now.', cues: [1] },
  { name: 'a brace and a newline then speech', text: 'Watch {\nthis now.', spoken: 'Watch this now.', beats: 2 },
  { name: 'an oversized string speaks none of its tail', text: `Look ${LONG_STRING}here.`, spoken: 'Look here.', bad: 1 },
  { name: 'an oversized list speaks none of its tail', text: `Look ${LONG_LIST}here.`, spoken: 'Look here.', bad: 1 },
  { name: 'a broken command with a far closing brace keeps its words', text: 'Watch {"kind":"hide","target":"a" lets go now. And the set is 1} more.', spoken: 'Watch lets go now. And the set is 1 more.', bad: 1 },
  { name: 'a zero-width space and a bidi override are not spoken', text: 'Watch​ this‮ now.', spoken: 'Watch this now.' },
  { name: 'a question ends the turn, so the tutor cannot answer itself', text: 'What pulls on it?\nGravity pulls on it.', spoken: 'What pulls on it?', replies: [true], textAfter: 'Gravity pulls on it.' },
  { name: 'a question inside a line ends the turn too', text: 'What pulls on it? Gravity.\nNext.', spoken: 'What pulls on it?', replies: [true], textAfter: 'Gravity. Next.' },
  { name: 'a sentence ends its beat', text: 'Gravity pulls down. Speed drops.', spoken: 'Gravity pulls down. Speed drops.', beats: 2 },
  { name: 'a comma ends a beat once it has a few words', text: 'So the ball slows down, and then it stops.', spoken: 'So the ball slows down, and then it stops.', beats: 2 },
  { name: 'a comma after one word does not', text: 'Okay, the ball slows.', spoken: 'Okay, the ball slows.', beats: 1 },
  { name: 'the first comma of a turn ends a beat sooner', text: 'Good question, the ball slows.', spoken: 'Good question, the ball slows.', beats: 2 },
  { name: 'a later comma needs a few words', text: 'It stops. Up there, it stops.', spoken: 'It stops. Up there, it stops.', beats: 2 },
  { name: 'a decimal does not end a beat', text: 'It pulls at 9.8 metres.', spoken: 'It pulls at 9.8 metres.', beats: 1 },
  { name: 'a command waiting for its word holds the beat open', text: 'Watch the ball,{"kind":"hide","target":"a"} now.', spoken: 'Watch the ball, now.', beats: 1 },
  { name: 'an internal tag is dropped', text: 'Fine.</thinking> The ball <b>falls</b> here.', spoken: 'Fine. The ball falls here.', bad: 3 },
  { name: 'what is inside a private tag is never spoken', text: 'Okay. <thinking>the answer is 12 and I should not say so</thinking>What do you get?', spoken: 'Okay. What do you get?', bad: 1 },
  { name: 'a private tag split across a model name', text: 'Okay. <reasoning>secret</reasoning>Next.', spoken: 'Okay. Next.', bad: 1 },
  { name: 'a less than sign in speech is not a tag', text: 'So x < 5 here.', spoken: 'So x < 5 here.' },
  { name: 'a tag never closed by the end of the stream', text: 'So x <y', spoken: 'So x <y' },
];

function read(text: string, fragmentSize: number, board: BoardKinds = new Map([['a', 'text'], ['p', 'plot']])) {
  const beats: WrittenBeatParts[] = [];
  const bad: string[] = [];
  const reader = new BeatTextReader({ board, onBeatEnd: (beat) => beats.push(beat), onBadCommand: (problem) => bad.push(problem), onWrongMath: (problem) => bad.push(problem) });
  for (let offset = 0; offset < text.length; offset += fragmentSize) reader.push(text.slice(offset, offset + fragmentSize));
  reader.finish();
  const parsed = beats.map((written, index) => parseWrittenBeat({ id: `b${index}`, script: written.script, expectsReply: written.expectsReply }));
  const spoken = beats.map((beat) => beat.script.filter((part) => typeof part === 'string').join('')).join(' ');
  const cues = parsed.flatMap((result) => (result.ok ? getCues(result.value.beat).filter((cue) => cue.command.kind !== 'focus').map((cue) => cue.atWord) : []));
  return { beats, bad, parsed, spoken, cues, textAfter: reader.textAfterTurn };
}

const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();

describe('reading a model stream into beats', () => {
  describe.each(FRAGMENT_SIZES)('in pieces of %i characters', (fragmentSize) => {
    it.each(CASES)('$name', ({ text, spoken, cues = [], bad = 0, beats, replies, textAfter }) => {
      const seen = read(text, fragmentSize);
      expect(normalize(seen.spoken)).toBe(normalize(spoken));
      expect(seen.bad).toHaveLength(bad);
      if (beats === undefined) expect(seen.cues).toEqual(cues);
      else expect(seen.beats).toHaveLength(beats);
      if (replies) expect(seen.beats.map((beat) => beat.expectsReply)).toEqual(replies);
      if (textAfter !== undefined) expect(normalize(seen.textAfter)).toBe(textAfter);
      for (const [index, result] of seen.parsed.entries()) {
        expect(result.ok, `beat ${index} must parse`).toBe(true);
        if (result.ok) expect(result.value.droppedCommandProblems).toEqual([]);
        if (result.ok) expect(getSpokenWords(seen.beats[index]?.script.filter((part) => typeof part === 'string').join('') ?? '')).toHaveLength(seen.beats[index]?.wordCount ?? -1);
      }
    });
  });

  it('wraps a long turn at the next clause, and keeps what came after out of the voice', () => {
    const sentence = 'The ball keeps climbing a little slower every single second until it stops.';
    const text = Array.from({ length: 8 }, () => sentence).join(' ');
    const seen = read(text, 5);
    expect(getSpokenWords(seen.spoken).length).toBeGreaterThanOrEqual(TURN_WORDS_TO_WRAP);
    expect(getSpokenWords(seen.spoken).length).toBeLessThan(TURN_WORDS_TO_WRAP + 13);
    expect(seen.textAfter).not.toBe('');
  });

  it('adds the guard from B2 when a turn reaches its third word with no drawing', () => {
    const beats: WrittenBeatParts[] = [];
    const reader = new BeatTextReader({ board: new Map([['steps', 'writeMath']]), onBeatEnd: (beat) => beats.push(beat), onBadCommand: () => {}, onWrongMath: () => {} });
    reader.push('So the ball slows down here.');
    reader.finish();
    expect(beats[0]?.script).toEqual(['So the ', { kind: 'focus', target: 'steps' }, 'ball slows down here.']);
  });

  it('adds no guard when a turn has already drawn, or the board is empty', () => {
    const drawn: WrittenBeatParts[] = [];
    const reader = new BeatTextReader({ board: new Map([['steps', 'writeMath']]), onBeatEnd: (beat) => drawn.push(beat), onBadCommand: () => {}, onWrongMath: () => {} });
    reader.push('So {"kind":"hide","target":"steps"}the ball slows down.');
    reader.finish();
    expect(drawn[0]?.script.filter((part) => typeof part !== 'string')).toHaveLength(1);
    const empty: WrittenBeatParts[] = [];
    const emptyReader = new BeatTextReader({ onBeatEnd: (beat) => empty.push(beat), onBadCommand: () => {}, onWrongMath: () => {} });
    emptyReader.push('So the ball slows down.');
    emptyReader.finish();
    expect(empty[0]?.script).toEqual(['So the ball slows down.']);
  });

  it('halts at a command whose math code found false, so no later word is spoken', () => {
    const beats: WrittenBeatParts[] = [];
    const wrong: string[] = [];
    const reader = new BeatTextReader({ onBeatEnd: (beat) => beats.push(beat), onBadCommand: () => {}, onWrongMath: (problem) => wrong.push(problem), checkCommand: () => ({ ok: false, problem: 'false', isWrongMath: true }) });
    reader.push('So then, {"kind":"writeMath","id":"bad","tex":"2 + 2 = 5"}two plus two is five.');
    reader.closeAttempt();
    expect(wrong).toEqual(['false']);
    expect(beats[0]?.script).toEqual(['So then, ']);
    expect(beats).toHaveLength(1);
  });

  it('never speaks a command, whatever a hostile model writes', () => {
    const hostile = ['{"kind":"writeMath","id":"a","tex":"\\\\href{javascript:alert(1)}{x}"}', '{"kind":"text","id":"__proto__","text":"x"}', '{"kind":"hide","target":"constructor"}', '{"kind":"text","id":"t","text":"<script>alert(1)</script>"}', '{"__proto__":{"polluted":true},"kind":"clearBoard"}'].map((command) => `Now ${command}this.`).join(' ');
    const seen = read(hostile, 7);
    expect(normalize(seen.spoken)).not.toMatch(/[{}"]|kind|alert/);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
