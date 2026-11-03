import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCues, getSpokenWords, parseWrittenBeat } from '../../../packages/contracts/src/index.ts';
import { BeatTextReader } from './beat-text-reader.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

const HIDE = '{"kind":"hide","target":"a"}';
const CLEAR = '{"kind":"clearBoard"}';
const MANY_WORDS = Array.from({ length: 130 }, (_, index) => `word${index}`).join(' ');
const ONE_LONG_WORD = 'a'.repeat(1300);
const MANY_COMMANDS = `Watch ${CLEAR.repeat(14)}this.`;
const BAD_SIMULATE = '{"kind":"simulate","id":"s","simulation":{"model":"bogus"}}';
const RUN_S = '{"kind":"runSimulation","target":"s","action":"play"}';

const CASES = [
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
  { name: 'a brace inside a label', text: `Look ${'{"kind":"text","id":"t","text":"set {1}"}'}here.`, spoken: 'Look here.', cues: [1] },
  { name: 'a quote inside a label', text: `Look ${'{"kind":"text","id":"t","text":"say \\"hi\\" }"}'}here.`, spoken: 'Look here.', cues: [1] },
  { name: 'true, false, and numbers in a command', text: 'Look {"kind":"text","id":"t","text":"x","handwritten":true}here {"kind":"markValue","id":"m","target":"p","at":1e2}now.', spoken: 'Look here now.', cues: [1, 2] },
  { name: 'text with a NUL and a broken character', text: 'Watch\u0000 this \uD83D now.', spoken: 'Watch this  now.' },
  { name: 'markdown and emoji are not spoken', text: 'This is *really* _neat_ `code` \u{1F600} now.', spoken: 'This is really neat code  now.' },
  { name: 'a model that forgets the format and writes 130 words', text: MANY_WORDS, spoken: MANY_WORDS, beats: 3 },
  { name: 'one word longer than a beat holds', text: ONE_LONG_WORD, spoken: `${'a'.repeat(600)} ${'a'.repeat(600)} ${'a'.repeat(100)}`, beats: 3 },
  { name: 'more commands than a beat holds', text: MANY_COMMANDS, spoken: 'Watch this.', cues: Array(12).fill(1), bad: 2 },
  { name: 'the same id twice in a beat', text: `Watch ${'{"kind":"writeMath","id":"e","tex":"x"}'}this ${'{"kind":"writeMath","id":"e","tex":"y"}'}now.`, spoken: 'Watch this now.', cues: [1], bad: 1 },
  { name: 'a dropped simulate takes its later commands with it, and the words still play', text: `Watch ${BAD_SIMULATE}this ${RUN_S}go.`, spoken: 'Watch this go.', bad: 2 },
  { name: 'a command on an element of the wrong kind', text: 'Watch {"kind":"runSimulation","target":"p","action":"play"}this.', spoken: 'Watch this.', bad: 1 },
  { name: 'a question ends the turn, so the tutor cannot answer itself', text: 'What pulls on it?\nGravity pulls on it.', spoken: 'What pulls on it?', replies: [true], textAfter: 'Gravity pulls on it.' },
  { name: 'a question inside a line does not end the beat', text: 'What pulls on it? Gravity.\nNext.', spoken: 'What pulls on it? Gravity. Next.', replies: [false, false] },
];

function read(text, fragmentSize) {
  const seen = { spoken: '', cues: [], bad: 0, beats: [], flushes: [], textAfter: '' };
  let beatCues = [];
  const board = new Map([['a', 'text'], ['p', 'plot']]);
  const reader = new BeatTextReader({
    board,
    onText: (words) => (seen.spoken += words),
    onFlush: (reason) => {
      seen.flushes.push(reason);
      if (!/\s$/.test(seen.spoken)) seen.flushInsideAWord = true;
    },
    onCommand: (command, atWord) => {
      beatCues.push({ atWord, command });
      seen.cues.push(atWord);
    },
    onBadCommand: () => (seen.bad += 1),
    onBeatEnd: ({ script, wordCount, expectsReply }) => {
      seen.beats.push({ script, wordCount, expectsReply, cues: beatCues });
      beatCues = [];
    },
  });
  for (let offset = 0; offset < text.length; offset += fragmentSize) reader.push(text.slice(offset, offset + fragmentSize));
  reader.finish();
  seen.textAfter = reader.textAfterQuestion;
  return seen;
}

function checkAgainstContracts(seen) {
  return seen.beats.flatMap((written, index) => {
    const parsed = parseWrittenBeat({ id: `b${index}`, script: written.script, expectsReply: written.expectsReply });
    if (!parsed.ok) return [`beat ${index} refused: ${parsed.problem}`];
    const problems = [];
    if (parsed.value.droppedCommandProblems.length > 0) problems.push(`beat ${index} dropped a command the browser already has`);
    if (JSON.stringify(getCues(parsed.value.beat)) !== JSON.stringify(written.cues)) problems.push(`beat ${index} cues differ from getCues`);
    const words = getSpokenWords(written.script.filter((part) => typeof part === 'string').join(''));
    if (words.length !== written.wordCount) problems.push(`beat ${index} word count differs`);
    return problems;
  });
}

const normalize = (text) => text.replace(/\s+/g, ' ').trim();

const results = CASES.flatMap(({ name, text, spoken, cues = [], bad = 0, beats, replies, textAfter }) =>
  [1, 3, 14, 60].map((fragmentSize) => {
    const seen = read(text, fragmentSize);
    const problems = checkAgainstContracts(seen);
    if (seen.flushInsideAWord) problems.push('a flush fell inside a word');
    if (normalize(seen.spoken) !== normalize(spoken)) problems.push(`spoke ${JSON.stringify(seen.spoken.slice(0, 80))}`);
    if (JSON.stringify(seen.cues) !== JSON.stringify(cues) && beats === undefined) problems.push(`cues at ${JSON.stringify(seen.cues)}`);
    if (seen.bad !== bad) problems.push(`refused ${seen.bad}`);
    if (beats !== undefined && seen.beats.length !== beats) problems.push(`made ${seen.beats.length} beats`);
    if (replies && JSON.stringify(seen.beats.map((beat) => beat.expectsReply)) !== JSON.stringify(replies)) problems.push('expectsReply is wrong');
    if (textAfter !== undefined && normalize(seen.textAfter) !== textAfter) problems.push(`text after the question ${JSON.stringify(seen.textAfter)}`);
    return { name, fragmentSize, problems };
  }),
);

const firstWordsFlush = read('So the thing to notice here is that the sideways speed never changes at all.', 3).flushes;
const summary = {
  passed: results.filter((row) => row.problems.length === 0).length,
  total: results.length,
  cases: CASES.length,
  flushesOnALongFirstSentence: firstWordsFlush,
  failed: results.filter((row) => row.problems.length > 0),
};
writeFileSync(join(HERE, 'results', 'reader.json'), `${JSON.stringify({ reader: summary }, null, 1)}\n`);
console.log(JSON.stringify(summary, null, 1));
if (summary.failed.length > 0) process.exit(1);
