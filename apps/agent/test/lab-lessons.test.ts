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

  it('never lands a mark on a ball that is still on its way, because a mark stays where the ball was', () => {
    const beats = (['shot', 'launch'] as const).flatMap((lesson) => LESSONS[lesson].flat());
    const early = beats.flatMap((beat) => {
      const cues = getCues(beat);
      return cues.flatMap(({ atWord, command }) => {
        if (command.kind !== 'runSimulation' || !('overWords' in command) || command.overWords === undefined) return [];
        const landsOn = atWord + command.overWords;
        return cues.filter((cue) => (cue.command.kind === 'annotate' || cue.command.kind === 'highlight') && cue.command.target === `${command.target}.ball` && cue.atWord >= atWord && cue.atWord < landsOn).map(() => beat.id);
      });
    });
    expect(early).toEqual([]);
  });

  it('puts a drawing on every word of the stored line, so a real voice is tested with no pause to land in', () => {
    expect(getCues(STOCK_MATH_TURN[0] as Beat).map((cue) => cue.atWord)).toEqual([0, 1, 2, 3, 4]);
  });

  it('puts a drawing on every word of the every-word lesson', () => {
    const atWords = getCues(LESSONS['every-word'][0]?.[0] as Beat).map((cue) => cue.atWord);
    expect(atWords).toEqual(Array.from({ length: atWords.length }, (_, word) => word));
  });
});
