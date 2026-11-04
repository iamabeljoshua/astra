import type { BoardStage } from '@astra/board';

const MOVE_MS = 560;
const SMALL_SCALE = 0.3;
const CORNER_INSET = 12;
/** cubic-bezier(.2, .75, .2, 1), read from the clock and not from a CSS transition, so a replay lands on the same frame. */
const CURVE = { x1: 0.2, y1: 0.75, x2: 0.2, y2: 1 };
const CURVE_STEPS = 8;

const getCurvePoint = (t: number, first: number, second: number) => 3 * (1 - t) ** 2 * t * first + 3 * (1 - t) * t ** 2 * second + t ** 3;

function getGlideShare(timeShare: number): number {
  let t = timeShare;
  for (let step = 0; step < CURVE_STEPS; step += 1) {
    const slope = 3 * (1 - t) ** 2 * CURVE.x1 + 6 * (1 - t) * t * (CURVE.x2 - CURVE.x1) + 3 * t ** 2 * (1 - CURVE.x2);
    if (slope < 1e-6) break;
    t -= (getCurvePoint(t, CURVE.x1, CURVE.x2) - timeShare) / slope;
  }
  return getCurvePoint(t, CURVE.y1, CURVE.y2);
}

/** The student's own look back at a visual that has gone small. */
export interface VisualPeek {
  isBig: boolean;
  atMs: number;
}

export interface VisualPlaceInput {
  stage: BoardStage | null;
  peek: VisualPeek | null;
  atMs: number;
  isReducedMotion: boolean;
}

function getLatestMove({ stage, peek }: VisualPlaceInput): { isTowardSmall: boolean; sinceMs: number } | null {
  if (peek && (!stage || peek.atMs >= stage.sinceMs)) return { isTowardSmall: !peek.isBig, sinceMs: peek.atMs };
  return stage && { isTowardSmall: stage.mode === 'handsOn', sinceMs: stage.sinceMs };
}

export interface VisualPlace {
  /** 0 is big over the whole right side, 1 is small in its corner. */
  smallShare: number;
  isMoving: boolean;
}

/** Where the visual is at this moment, from the clock alone. */
export function getVisualPlace(input: VisualPlaceInput): VisualPlace {
  const move = getLatestMove(input);
  if (!move) return { smallShare: 0, isMoving: false };
  const timeShare = Math.min(1, Math.max(0, (input.atMs - move.sinceMs) / MOVE_MS));
  const glide = input.isReducedMotion ? 1 : getGlideShare(timeShare);
  return { smallShare: move.isTowardSmall ? glide : 1 - glide, isMoving: !input.isReducedMotion && timeShare < 1 };
}

export function getVisualTransform({ smallShare, width }: { smallShare: number; width: number }): string {
  const scale = 1 + (SMALL_SCALE - 1) * smallShare;
  const x = (width * (1 - SMALL_SCALE) - CORNER_INSET) * smallShare;
  return `translate(${x.toFixed(1)}px, ${(CORNER_INSET * smallShare).toFixed(1)}px) scale(${scale.toFixed(4)})`;
}

/** How much of the right side's width the board keeps clear, so no line passes under the small visual. */
export const getKeptClearWidth = (width: number) => Math.round(width * SMALL_SCALE) + CORNER_INSET;
