/** Counts and lists a proof writes that must come to nothing, wherever they sit in its results. */
const MUST_BE_NONE = new Set(['differing', 'described', 'describedDifferently', 'overlap', 'overlapFrames', 'textOverlapFrames', 'textOutsideFrames', 'outside', 'outsideBoardFrames', 'outsideBoard', 'inkOverNeighbourFrames', 'notFinite', 'notFiniteFrames', 'rawSourceFrames', 'errorMarkFrames', 'forbiddenElementFrames', 'wrongEquationFrames', 'liveSamplesDifferingFromReplay', 'liveFramesDifferingFromLog', 'errorCount', 'stopped', 'writes', 'animations', 'mutationsWithNoCause', 'differentTwice', 'oldWordsLeft', 'numbersMoved', 'curvesMisjudged', 'refusalsMissed']);
const MUST_BE_TRUE = new Set(['scaleHeld', 'identical', 'logged', 'framesIdentical', 'frozenStill']);
const MUST_BE_FALSE = new Set(['pwned', 'crashed']);

/** A resize lays out on purpose between frames, so its own frames can sit outside the board and write with no cue. */
const EXPECTED_WHILE_RESIZING = new Set(['outside', 'outsideBoardFrames', 'outsideBoard', 'inkOverNeighbourFrames', 'mutationsWithNoCause']);

function isFailure(key: string, value: unknown): boolean {
  if (MUST_BE_TRUE.has(key)) return value === false;
  if (MUST_BE_FALSE.has(key)) return value === true;
  if (!MUST_BE_NONE.has(key)) return false;
  return Array.isArray(value) ? value.length > 0 : typeof value === 'number' && value !== 0;
}

/** Every value in one proof's results that says it failed, each with where it sits. */
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

/** Says what failed and ends the run with its code, so a script or a person reading only the exit sees a failed proof. */
export function exitWithVerdict(failures: readonly string[]): never {
  for (const failure of failures) console.error('FAILED', failure);
  process.exit(failures.length > 0 ? 1 : 0);
}
