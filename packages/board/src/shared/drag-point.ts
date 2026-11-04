import type { BoardElement } from '../player/board-state.ts';

type Domain = readonly [number, number];

/** Where the point waits before it is first moved, as a share of the way along the plot. */
const STARTS_AT_SHARE = 1 / 6;
const STEPS_ACROSS = 50;

export const getDragStep = ([low, high]: Domain) => 10 ** Math.floor(Math.log10((high - low) / STEPS_ACROSS));

/** A point moves in steps a person can read, and stays on the plot. */
export function snapDragX(x: number, domain: Domain): number {
  const step = getDragStep(domain);
  const kept = Math.min(domain[1], Math.max(domain[0], x));
  return Number((Math.round(kept / step) * step).toFixed(6));
}

export function getPointX(task: BoardElement, domain: Domain): number {
  return task.progress?.pointX ?? snapDragX(domain[0] + (domain[1] - domain[0]) * STARTS_AT_SHARE, domain);
}
