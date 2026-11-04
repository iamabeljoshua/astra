import { getBeatText, getCues, getSpokenWords, parseBeat, type RichScene } from '@astra/contracts';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getLineBeats, getSceneBeats, getSpokenBeats } from '../src/scenes/lesson/lesson-beats.ts';
import { splitIntoShortLines } from '../src/scenes/lesson/short-lines.ts';
import { readMarks } from '../src/scenes/narration.ts';
import type { LessonPlan } from '../src/scenes/scene-types.ts';

const SCENE = { kind: 'richScene', id: 'scene', engine: 'manimgx', sceneId: 'scene-1', moments: {}, parts: [], durationSeconds: 30 } as unknown as RichScene;
const countWords = (text: string) => getSpokenWords(text).length;
const FIXTURES = resolve(import.meta.dirname, 'fixtures/saved-plans');
const SAVED = readdirSync(FIXTURES).map((file) => (JSON.parse(readFileSync(resolve(FIXTURES, file), 'utf8')) as { plan: LessonPlan }).plan);
const LONG_NARRATION = '[[one]]Here is a long first sentence that keeps going on about a curve and how it moves across the page while the student watches it carefully and waits for the point. [[two]]Now the second part goes on too, because it has to say what the slope means, what the tangent does, and what happens right at the very bottom of the curve where it is flat. [[three]]And here it ends.';

describe('how long the tutor speaks without a pause', () => {
  it.each(SAVED.map((plan, index) => [index, plan] as const))('never passes 45 words in a line of a real saved plan, %i', (_index, plan) => {
    const scene = getSceneBeats({ setup: plan.setup, narration: plan.narration, scene: SCENE });
    const lines = [...plan.opening.flatMap((line, index) => getLineBeats(`line-${index}`, line)), ...(plan.more ?? []).flatMap((line, index) => getLineBeats(`more-${index}`, line)), ...scene, ...getSpokenBeats('close', plan.close, true)];
    for (const beat of lines) expect(countWords(getBeatText(beat))).toBeLessThanOrEqual(45);
  });

  it('breaks a long narration into lines at its sentences, usually under 25 words', () => {
    const beats = getSceneBeats({ setup: 'Watch.', narration: LONG_NARRATION, scene: SCENE });
    expect(beats.length).toBeGreaterThan(2);
    const counts = beats.map((beat) => countWords(getBeatText(beat)));
    expect(Math.max(...counts)).toBeLessThanOrEqual(45);
    expect(counts.filter((count) => count <= 25).length).toBeGreaterThanOrEqual(counts.length - 1);
  });

  it('keeps every moment on its own word across the lines, with no run past the end of its line', () => {
    const beats = getSceneBeats({ setup: 'Watch.', narration: LONG_NARRATION, scene: SCENE }).slice(1);
    const { text, marks } = readMarks(LONG_NARRATION);
    const words = text.split(' ');
    let offset = 0;
    const cueWords: number[] = [];
    for (const beat of beats) {
      const count = countWords(getBeatText(beat));
      for (const { atWord, command } of getCues(beat)) {
        if (command.kind !== 'runSimulation') continue;
        cueWords.push(offset + atWord);
        if ('overWords' in command && command.overWords !== undefined) expect(atWord + command.overWords).toBeLessThanOrEqual(count);
      }
      offset += count;
    }
    expect(offset).toBe(words.length);
    for (const mark of marks) expect(cueWords).toContain(mark.atWord);
    expect(parseBeat({ id: beats[0]?.id, script: beats[0]?.script, expectsReply: false }).ok).toBe(true);
  });

  it('puts the scene on the board once, in the first line of the take', () => {
    const beats = getSceneBeats({ setup: 'Watch.', narration: LONG_NARRATION, scene: SCENE }).slice(1);
    const withScene = beats.filter((beat) => beat.script.some((item) => typeof item === 'object' && item.kind === 'richScene'));
    expect(withScene.map((beat) => beat.id)).toEqual(['scene-take']);
  });

  it('gives only the last line of a close its question', () => {
    const beats = getSpokenBeats('close', 'This one sentence is here to make the closing line longer than the usual breath of a person. And then it goes on and on for more words than that. So what do you think happens next?', true);
    expect(beats.at(-1)?.expectsReply).toBe(true);
    expect(beats.slice(0, -1).every((beat) => !beat.expectsReply)).toBe(true);
  });

  it('keeps a board mark with the first piece of a split line', () => {
    const beats = getLineBeats('line-0', { say: 'This first sentence runs for a good while so that the whole thing has to split somewhere. And the second one keeps on going until it is well past the limit we want.', tex: 'x^2' });
    expect(beats.length).toBe(2);
    expect(beats[0]?.script.some((item) => typeof item === 'object' && item.kind === 'writeMath')).toBe(true);
    expect(beats[1]?.script.some((item) => typeof item === 'object')).toBe(false);
  });
});

describe('splitting a line', () => {
  it('leaves a line under the usual length alone', () => {
    expect(splitIntoShortLines('A short line. And another one.')).toEqual(['A short line. And another one.']);
  });

  it('splits a sentence with no end in sight at its commas, then by count, so nothing passes 45', () => {
    const words = Array.from({ length: 120 }, (_, index) => `word${index}`).join(' ');
    const lines = splitIntoShortLines(words);
    expect(lines.join(' ')).toBe(words);
    for (const line of lines) expect(countWords(line)).toBeLessThanOrEqual(45);
    const commas = splitIntoShortLines(`${'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen, '.repeat(4)}end.`);
    for (const line of commas) expect(countWords(line)).toBeLessThanOrEqual(25);
  });
});
