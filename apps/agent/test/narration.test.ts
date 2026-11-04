import { type Beat, getBeatText, getCues, parseBeat, type RichScene } from '@astra/contracts';
import { describe, expect, it } from 'vitest';
import { getNominalTiming, getSceneBeat, readMarks } from '../src/scenes/narration.ts';

const MARKED = '[[curve]] Here is the curve. [[point]] Pick one point on it. [[tangent]] This line just touches it there.';
const SCENE = { kind: 'richScene', id: 'slope', engine: 'manimgx', sceneId: 'slope-1a2b', moments: { curve: 0, point: 1.5, tangent: 3 }, parts: [], durationSeconds: 7 } as unknown as RichScene;

const getRuns = (beat: Beat) => getCues(beat).flatMap((cue) => (cue.command.kind === 'runSimulation' && cue.command.action === 'play' ? [{ atWord: cue.atWord, until: cue.command.until, overWords: cue.command.overWords }] : []));

describe('marked narration', () => {
  it('reads each mark and the word it sits on, with the marks gone from the words', () => {
    const { text, marks } = readMarks(MARKED);
    expect(text).toBe('Here is the curve. Pick one point on it. This line just touches it there.');
    expect(marks.map(({ id, atWord }) => [id, atWord])).toEqual([['curve', 0], ['point', 4], ['tangent', 9]]);
  });

  it('gives each moment a nominal time on the take, and leaves room after the last word', () => {
    const { moments, durationSeconds } = getNominalTiming(MARKED);
    expect(moments.curve).toBe(0);
    expect(moments.point).toBeGreaterThan(1);
    expect(moments.tangent).toBeGreaterThan(moments.point as number);
    expect(durationSeconds).toBeGreaterThan(moments.tangent as number + 2);
  });
});

describe('the beat a scene plays under', () => {
  it('places the scene on the first word and plays it to each next moment over the words between', () => {
    const beat = getSceneBeat({ id: 'slope-take', marked: MARKED, scene: SCENE });
    expect(getCues(beat)[0]).toEqual({ atWord: 0, command: SCENE });
    expect(getRuns(beat)).toEqual([
      { atWord: 0, until: 'point', overWords: 4 },
      { atWord: 4, until: 'tangent', overWords: 5 },
      { atWord: 9, until: undefined, overWords: 6 },
    ]);
    expect(getBeatText(beat)).toBe('Here is the curve. Pick one point on it. This line just touches it there.');
  });

  it('runs the scene up to a first mark that sits later in the words', () => {
    const beat = getSceneBeat({ id: 'later', marked: 'So here is [[curve]] the curve, and [[point]] one point on it.', scene: SCENE });
    expect(getRuns(beat)[0]).toEqual({ atWord: 0, until: 'curve', overWords: 3 });
  });

  it('is a beat the parser accepts', () => {
    const beat = getSceneBeat({ id: 'slope-take', marked: MARKED, scene: SCENE });
    expect(parseBeat(JSON.parse(JSON.stringify(beat))).ok).toBe(true);
  });
});
