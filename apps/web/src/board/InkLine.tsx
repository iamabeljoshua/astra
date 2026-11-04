import type { InkPoint } from '@astra/contracts';

const UNITS = 1000;
const STROKE = 7;
const FEWEST_UNITS_HIGH = 90;
const PADDING = 12;

// Rounds each corner through the midpoints, the way a hand moves.
function getInkPath(points: readonly InkPoint[]): string {
  const [first] = points;
  if (!first) return '';
  const at = (point: InkPoint) => `${(point[0] * UNITS).toFixed(1)} ${(point[1] * UNITS).toFixed(1)}`;
  let path = `M${at(first)}`;
  if (points.length === 1) return `${path}L${at(first)}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const [point, next] = [points[index] as InkPoint, points[index + 1] as InkPoint];
    path += `Q${at(point)} ${(((point[0] + next[0]) / 2) * UNITS).toFixed(1)} ${(((point[1] + next[1]) / 2) * UNITS).toFixed(1)}`;
  }
  return `${path}L${at(points.at(-1) as InkPoint)}`;
}

export function InkLine({ strokes, testId = 'ink-line' }: { strokes: readonly (readonly InkPoint[])[]; testId?: string }) {
  const bottom = Math.max(0, ...strokes.flatMap((points) => points.map((point) => point[1] * UNITS)));
  return (
    <svg data-testid={testId} viewBox={`0 0 ${UNITS} ${Math.max(FEWEST_UNITS_HIGH, Math.ceil(bottom) + PADDING)}`} className="board-ink-line" strokeWidth={STROKE} aria-hidden>
      {strokes.map((points, index) => <path key={index} d={getInkPath(points)} />)}
    </svg>
  );
}
