import type { InkPoint } from '@astra/contracts';
import { getStroke } from 'perfect-freehand';
import { memo, useMemo } from 'react';

const UNITS = 1000;
const FEWEST_UNITS_HIGH = 90;
const PADDING = 12;
const PEN = { size: 8.5, thinning: 0.55, smoothing: 0.6, streamline: 0.42, simulatePressure: true };

function getInkPath(points: readonly InkPoint[]): string {
  const outline = getStroke(points.map(([x, y]) => [x * UNITS, y * UNITS]), PEN) as [number, number][];
  const [first] = outline;
  if (!first || outline.length < 2) return '';
  const curves = outline.map(([x, y], index) => {
    const [nextX, nextY] = outline[(index + 1) % outline.length] as [number, number];
    return `${x.toFixed(1)} ${y.toFixed(1)} ${((x + nextX) / 2).toFixed(1)} ${((y + nextY) / 2).toFixed(1)}`;
  });
  return `M${first[0].toFixed(1)} ${first[1].toFixed(1)}Q${curves.join(' ')}Z`;
}

const InkStroke = memo(function InkStroke({ points }: { points: readonly InkPoint[] }) {
  const path = useMemo(() => getInkPath(points), [points]);
  return <path d={path} />;
});

export function InkLine({ strokes, testId = 'ink-line' }: { strokes: readonly (readonly InkPoint[])[]; testId?: string }) {
  const bottom = Math.max(0, ...strokes.flatMap((points) => points.map((point) => point[1] * UNITS)));
  return (
    <svg data-testid={testId} viewBox={`0 0 ${UNITS} ${Math.max(FEWEST_UNITS_HIGH, Math.ceil(bottom) + PADDING)}`} className="board-ink-line" aria-hidden="true">
      {strokes.map((points, index) => <InkStroke key={index} points={points} />)}
    </svg>
  );
}
