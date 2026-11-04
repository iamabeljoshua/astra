import type { BoardStage } from '@astra/board';

const MOVE_MS = 560;
const SMALL_SCALE = 0.3;
/** The sample's phone shows the scene in a 34% corner. */
const PHONE_SMALL_SCALE = 0.34;
/** On a phone the small scene is one band of this share of its width tall, so it does not eat the student's work. */
const PHONE_SMALL_HEIGHT_SHARE = 0.64;
const CORNER_INSET = 12;
const CURVE = { x1: 0.2, y1: 0.75, x2: 0.2, y2: 1 };
const CURVE_STEPS = 8;

const getCurvePoint = (t: number, first: number, second: number) => 3 * (1 - t) ** 2 * t * first + 3 * (1 - t) * t ** 2 * second + t ** 3;

// Solves the cubic-bezier for this moment, so a replay lands on the same frame.
function getGlideShare(timeShare: number): number {
  let t = timeShare;
  for (let step = 0; step < CURVE_STEPS; step += 1) {
    const slope = 3 * (1 - t) ** 2 * CURVE.x1 + 6 * (1 - t) * t * (CURVE.x2 - CURVE.x1) + 3 * t ** 2 * (1 - CURVE.x2);
    if (slope < 1e-6) break;
    t -= (getCurvePoint(t, CURVE.x1, CURVE.x2) - timeShare) / slope;
  }
  return getCurvePoint(t, CURVE.y1, CURVE.y2);
}

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
  smallShare: number;
  isMoving: boolean;
}

export function getVisualPlace(input: VisualPlaceInput): VisualPlace {
  const move = getLatestMove(input);
  if (!move) return { smallShare: 0, isMoving: false };
  const timeShare = Math.min(1, Math.max(0, (input.atMs - move.sinceMs) / MOVE_MS));
  const glide = input.isReducedMotion ? 1 : getGlideShare(timeShare);
  return { smallShare: move.isTowardSmall ? glide : 1 - glide, isMoving: !input.isReducedMotion && timeShare < 1 };
}

export const getPhoneKeptClearHeight = (width: number) => Math.round(width * PHONE_SMALL_SCALE * PHONE_SMALL_HEIGHT_SHARE) + CORNER_INSET * 2;

export function getVisualTransform({ smallShare, width, isPhone = false }: { smallShare: number; width: number; isPhone?: boolean }): string {
  const smallScale = isPhone ? PHONE_SMALL_SCALE : SMALL_SCALE;
  const scale = 1 + (smallScale - 1) * smallShare;
  const x = (width * (1 - smallScale) - CORNER_INSET) * smallShare;
  return `translate(${x.toFixed(1)}px, ${(CORNER_INSET * smallShare).toFixed(1)}px) scale(${scale.toFixed(4)})`;
}

export const getKeptClearWidth = (width: number) => Math.round(width * SMALL_SCALE) + CORNER_INSET;
