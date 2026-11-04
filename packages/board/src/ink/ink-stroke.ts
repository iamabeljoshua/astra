export interface InkPosition {
  x: number;
  y: number;
}

/** One touch of the pen, in board pixels. */
export interface InkStroke {
  points: readonly InkPosition[];
  length: number;
}

/** Strokes in the order a hand would draw them, with the room they take. */
export interface InkDrawing {
  strokes: readonly InkStroke[];
  width: number;
  height: number;
}

export function makeStroke(points: readonly InkPosition[]): InkStroke {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) length += Math.hypot((points[index]?.x ?? 0) - (points[index - 1]?.x ?? 0), (points[index]?.y ?? 0) - (points[index - 1]?.y ?? 0));
  return { points, length };
}

const toFixed = (value: number) => Number(value.toFixed(2));

// Rounds each corner through the midpoints, which is what makes straight font segments read as a moving hand.
export function getStrokePath({ points }: InkStroke): string {
  const [first, ...rest] = points;
  if (!first) return '';
  if (rest.length === 0) return `M${toFixed(first.x)} ${toFixed(first.y)}h0.01`;
  const curves = rest.slice(0, -1).map((point, index) => {
    const next = rest[index + 1] as InkPosition;
    return `Q${toFixed(point.x)} ${toFixed(point.y)} ${toFixed((point.x + next.x) / 2)} ${toFixed((point.y + next.y) / 2)}`;
  });
  const last = rest.at(-1) as InkPosition;
  return `M${toFixed(first.x)} ${toFixed(first.y)}${curves.join('')}L${toFixed(last.x)} ${toFixed(last.y)}`;
}

/** How much of each stroke has drawn when `progress` of the whole has, so the pen keeps one speed across short and long strokes. */
export function getStrokeProgress(strokes: readonly InkStroke[], progress: number): number[] {
  if (progress >= 1) return strokes.map(() => 1);
  const total = strokes.reduce((sum, stroke) => sum + stroke.length, 0);
  let remaining = total * Math.max(0, progress);
  return strokes.map((stroke) => {
    const drawn = stroke.length === 0 ? (remaining > 0 ? 1 : 0) : Math.min(1, remaining / stroke.length);
    remaining = Math.max(0, remaining - stroke.length);
    return drawn;
  });
}

/** A seeded generator, so the same words wobble the same way in a replay. */
export function makeSeededRandom(seedText: string): () => number {
  let state = 2166136261;
  for (const character of seedText) state = Math.imul(state ^ (character.codePointAt(0) ?? 0), 16777619);
  return () => {
    state = Math.imul(state ^ (state >>> 15), 2654435761) >>> 0;
    state = (state + 0x9e3779b9) >>> 0;
    return state / 4294967296;
  };
}

export const getSpread = (random: () => number, size: number) => (random() - 0.5) * 2 * size;
