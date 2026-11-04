import { describe, expect, it } from 'vitest';
import { getProofFailures } from '../src/lab/proof/proof-verdict.ts';

describe('a proof\'s verdict', () => {
  it('passes results that hold no failure', () => {
    expect(getProofFailures('marks', [{ label: 'a', replay: { moments: 12, differing: 0, settledOnSecondLook: 3, described: 0 }, frames: { overlapFrames: 0 } }])).toEqual([]);
  });

  it.each([
    ['a replay moment that differs, as a count', { replay: { differing: 1 } }],
    ['a replay moment that differs, as a list', { replay: { differing: [1200] } }],
    ['a board described differently', { replay: { described: 2 } }],
    ['text on text', { frames: { textOverlapFrames: 1 } }],
    ['a number that is not finite', { notFinite: 1 }],
    ['a live frame unlike the log', { figures: { liveSamplesDifferingFromReplay: 1 } }],
    ['a page error', { errorCount: 1 }],
    ['a scale that moved', { scaleHeld: false }],
    ['a frozen board that changed', { identical: false }],
    ['markup that ran', { pwned: true }],
    ['a write with no cause', { still: { writes: 1 } }],
    ['an old word on a new curve', { oldWordsLeft: ['minimum'] }],
  ])('fails on %s', (_name, result) => {
    expect(getProofFailures('marks', [result])).toHaveLength(1);
  });

  it('says where the failure sits', () => {
    expect(getProofFailures('lessons', [{ replay: { differing: 2 } }])).toEqual(['lessons[0].replay.differing = 2']);
  });

  it('leaves a settled count alone, because it is reported and not a failure', () => {
    expect(getProofFailures('marks', [{ replay: { differing: 0, settledOnSecondLook: 5 } }])).toEqual([]);
  });

  it('allows frames off the board while resizing, and only then', () => {
    expect(getProofFailures('resize', [{ frames: { outsideBoardFrames: 2 } }])).toEqual([]);
    expect(getProofFailures('lessons', [{ frames: { outsideBoardFrames: 2 } }])).toHaveLength(1);
  });
});
