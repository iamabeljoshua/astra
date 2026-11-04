const MUST_BE_NONE = new Set(['differing', 'described', 'describedDifferently', 'overlap', 'overlapFrames', 'textOverlapFrames', 'textOutsideFrames', 'outside', 'outsideBoardFrames', 'outsideBoard', 'inkOverNeighbourFrames', 'notFinite', 'notFiniteFrames', 'rawSourceFrames', 'errorMarkFrames', 'forbiddenElementFrames', 'wrongEquationFrames', 'liveSamplesDifferingFromReplay', 'liveFramesDifferingFromLog', 'errorCount', 'stopped', 'writes', 'animations', 'mutationsWithNoCause', 'differentTwice', 'oldWordsLeft', 'numbersMoved', 'curvesMisjudged', 'refusalsMissed', 'unknownColors', 'gradients', 'differingImages', 'motionLeft', 'movingWithReducedMotion']);
const MUST_BE_TRUE = new Set(['scaleHeld', 'identical', 'logged', 'framesIdentical', 'frozenStill', 'imagesMatch']);
const MUST_BE_FALSE = new Set(['pwned', 'crashed', 'wasRun', 'hasScript']);

/** A resize lays the board out again between frames, so the resize proof alone may report these. */
const EXPECTED_WHILE_RESIZING = new Set(['outside', 'outsideBoardFrames', 'outsideBoard', 'inkOverNeighbourFrames', 'mutationsWithNoCause']);

function isFailure(key: string, value: unknown): boolean {
  if (MUST_BE_TRUE.has(key)) return value === false;
  if (MUST_BE_FALSE.has(key)) return value === true;
  if (!MUST_BE_NONE.has(key)) return false;
  return Array.isArray(value) ? value.length > 0 : typeof value === 'number' && value !== 0;
}

export function getProofFailures(proof: string, results: unknown): string[] {
  const failures: string[] = [];
  const walk = (value: unknown, path: string) => {
    if (Array.isArray(value)) value.forEach((item, index) => walk(item, `${path}[${index}]`));
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return;
    for (const [key, inner] of Object.entries(value)) {
      if (isFailure(key, inner) && !(proof === 'resize' && EXPECTED_WHILE_RESIZING.has(key))) failures.push(`${path}.${key} = ${JSON.stringify(inner)}`);
      else walk(inner, `${path}.${key}`);
    }
  };
  walk(results, proof);
  return failures;
}

export function exitWithVerdict(failures: readonly string[]): never {
  for (const failure of failures) console.error('FAILED', failure);
  process.exit(failures.length > 0 ? 1 : 0);
}
