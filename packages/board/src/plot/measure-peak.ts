import { type AxisRange, LARGEST_FITTED_VALUE } from './axis-ticks.ts';

const HALVINGS = 36;
const HALVINGS_COMPARED = 12;
const MOST_PEAKS_MEASURED = 6;
/** Below this, a change in the top is the rounding of the number itself. */
const ROUNDING_SHARE = 1e-9;

interface Top {
  x: number;
  y: number;
}

export interface SampledCurve {
  evaluate(x: number): number;
  samples: readonly Top[];
}

/** Climbs from a sample by halving its step. A finite top settles, gaining at worst half as much each time, and a pole or a log goes on gaining, so that returns null. */
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
  return gainedLast > Math.abs(best.y) * ROUNDING_SHARE && gainedLast >= gainedBefore / 2 ? null : best;
}

// A top at an edge can be a pole just past it, as tan(x) is on [-1.57, 1.57], where the whole height would flatten the curve, so that counts as growing without bound.
function measureTop(evaluate: (x: number) => number, start: Top, { spacing, domain }: { spacing: number; domain: AxisRange }): number | null {
  const top = climbToTop(evaluate, start, { spacing, domain });
  if (!top) return null;
  const [low, high] = domain;
  const isNearAnEdge = top.x <= low + spacing || top.x >= high - spacing;
  return isNearAnEdge && !climbToTop(evaluate, top, { spacing, domain: [low - spacing, high + spacing] }) ? null : top.y;
}

const isLocalTop = (samples: readonly Top[], index: number) => !((samples[index - 1]?.y as number) > (samples[index] as Top).y) && !((samples[index + 1]?.y as number) > (samples[index] as Top).y);

/** The highest top above `above` that stays finite, or null when each one seen grows without bound or there is none. `direction` of -1 finds the lowest valley. */
export function getFiniteTop(curves: readonly SampledCurve[], { above, direction, spacing, domain }: { above: number; direction: 1 | -1; spacing: number; domain: AxisRange }): number | null {
  const tops = curves.flatMap(({ evaluate, samples }) => {
    const signed = samples.map(({ x, y }) => ({ x, y: y * direction }));
    return signed.flatMap((start, index) => (start.y > above * direction && start.y <= LARGEST_FITTED_VALUE && isLocalTop(signed, index) ? [{ start, evaluate: (x: number) => evaluate(x) * direction }] : []));
  });
  const measured = tops.sort((first, second) => second.start.y - first.start.y).slice(0, MOST_PEAKS_MEASURED).flatMap(({ start, evaluate }) => measureTop(evaluate, start, { spacing, domain }) ?? []);
  return measured.length === 0 ? null : Math.max(...measured) * direction;
}
