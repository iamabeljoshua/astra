import { canRenderTex } from '@astra/board/tex-check';
import { type Beat, getCues } from '@astra/contracts';
import { describe, expect, it } from 'vitest';
import { LESSONS, type LessonName, STOCK_MATH_TURN } from '../src/lab/lesson.ts';

const MEANT_TO_FAIL = new Set(['x^2^3', String.raw`\frac{1}`]);

function getMath(beats: readonly Beat[]): string[] {
  return beats.flatMap(getCues).flatMap(({ command }) => (command.kind === 'writeMath' || command.kind === 'transformMath' ? [command.tex] : []));
}

describe('the lab lessons', () => {
  it.each(Object.keys(LESSONS) as LessonName[])('%s holds only math KaTeX can set, apart from what is meant to fail', (lesson) => {
    const math = LESSONS[lesson].flatMap(getMath);
    expect(math.filter((tex) => !canRenderTex(tex) && !MEANT_TO_FAIL.has(tex))).toEqual([]);
  });

  it('puts a drawing on every word of the stored line, so a real voice is tested with no pause to land in', () => {
    expect(getCues(STOCK_MATH_TURN[0] as Beat).map((cue) => cue.atWord)).toEqual([0, 1, 2, 3, 4]);
  });

  it('puts a drawing on every word of the every-word lesson', () => {
    const atWords = getCues(LESSONS['every-word'][0]?.[0] as Beat).map((cue) => cue.atWord);
    expect(atWords).toEqual(Array.from({ length: atWords.length }, (_, word) => word));
  });
});
