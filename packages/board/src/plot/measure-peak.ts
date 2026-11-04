import { type AxisRange, LARGEST_FITTED_VALUE } from './axis-ticks.ts';

const HALVINGS = 36;
const HALVINGS_COMPARED = 12;
const MOST_PEAKS_MEASURED = 6;
/** A gain below this share of the top counts as evaluation noise, not a climb. */
const NOISE_SHARE = 1e-9;
/** A pole falls away by far more than this share over the last halvings compared, and a finite top is flat at that scale. */
const SPIKE_SHARE = 16;

interface Top {
  x: number;
  y: number;
}

export interface SampledCurve {
  evaluate(x: number): number;
  samples: readonly Top[];
}

// A climb can stop gaining by chance when its last steps all overshoot a pole, so a top must also hold up beside itself.
function isSpike(evaluate: (x: number) => number, { x, y }: Top, step: number): boolean {
  const beside = Math.max(...[x - step, x + step].map(evaluate).filter(Number.isFinite));
  return y - beside > Math.abs(beside) * SPIKE_SHARE;
}

/** Climbs by halving its step, and returns null unless the gain keeps at least halving, because a finite top settles and a pole or a log does not. */
function climbToTop(evaluate: (x: number) => number, start: Top, { spacing, domain: [low, high] }: { spacing: number; domain: AxisRange }): Top | null {
  let best = start;
  const tops = [start.y];
  for (let halving = 1; halving <= HALVINGS; halving += 1) {
    const step = spacing / 2 ** halving;
    for (const x of [best.x - step, best.x + step]) {
      if (x < low || x > high) continue;
      const y = evaluate(x);
      if (y > LARGEST_FITTED_VALUE) return null;
      if (y > best.y) best = { x, y };
    }
    tops.push(best.y);
  }
  const gainedLast = best.y - (tops[HALVINGS - HALVINGS_COMPARED] as number);
  const gainedBefore = (tops[HALVINGS - HALVINGS_COMPARED] as number) - (tops[HALVINGS - 2 * HALVINGS_COMPARED] as number);
  if (gainedLast > Math.abs(best.y) * NOISE_SHARE && gainedLast >= gainedBefore / 2) return null;
  return isSpike(evaluate, best, spacing / 2 ** (HALVINGS - HALVINGS_COMPARED)) ? null : best;
}

// A top at a domain edge may be a pole just past it, as with tan(x) on [-1.57, 1.57], so it climbs again past the edge.
function measureTop(evaluate: (x: number) => number, start: Top, { spacing, domain }: { spacing: number; domain: AxisRange }): number | null {
  const top = climbToTop(evaluate, start, { spacing, domain });
  if (!top) return null;
  const [low, high] = domain;
  const isNearAnEdge = top.x <= low + spacing || top.x >= high - spacing;
  return isNearAnEdge && !climbToTop(evaluate, top, { spacing, domain: [low - spacing, high + spacing] }) ? null : top.y;
}

const isLocalTop = (samples: readonly Top[], index: number) => !((samples[index - 1]?.y as number) > (samples[index] as Top).y) && !((samples[index + 1]?.y as number) > (samples[index] as Top).y);

export function getFiniteTop(curves: readonly SampledCurve[], { above, direction, spacing, domain }: { above: number; direction: 1 | -1; spacing: number; domain: AxisRange }): number | null {
  const tops = curves.flatMap(({ evaluate, samples }) => {
    const signed = samples.map(({ x, y }) => ({ x, y: y * direction }));
    return signed.flatMap((start, index) => (start.y > above * direction && start.y <= LARGEST_FITTED_VALUE && isLocalTop(signed, index) ? [{ start, evaluate: (x: number) => evaluate(x) * direction }] : []));
  });
  const measured = tops.sort((first, second) => second.start.y - first.start.y).slice(0, MOST_PEAKS_MEASURED).flatMap(({ start, evaluate }) => measureTop(evaluate, start, { spacing, domain }) ?? []);
  return measured.length === 0 ? null : Math.max(...measured) * direction;
}
