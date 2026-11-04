/** 0 draws everything. 1 paints moving things at most 30 times a second. 2 also lands each drawing at once. */
export type QualityTier = 0 | 1 | 2;

const WINDOW_MS = 500;
const LONGEST_FRAME_COUNTED_MS = 1000;
const LOWEST_RATES: Record<QualityTier, number> = { 0: 50, 1: 28, 2: 0 };
const RATE_TO_CLIMB: Record<QualityTier, number> = { 0: Number.POSITIVE_INFINITY, 1: 57, 2: 40 };
const WINDOWS_TO_DROP = 2;
const FIRST_WINDOWS_TO_CLIMB = 20;
const MOST_WINDOWS_TO_CLIMB = 640;
const SMALLEST_PAINT_GAP_MS = 30;

export interface TierWatch {
  noteFrame(nowMs: number): QualityTier;
  getTier(): QualityTier;
}

interface WatchState {
  tier: QualityTier;
  windowStartMs: number | null;
  framesInWindow: number;
  lastFrameMs: number | null;
  slowWindows: number;
  fastWindows: number;
  windowsToClimb: number;
  hasClimbed: boolean;
}

const startWindow = (state: WatchState, nowMs: number | null) => {
  state.windowStartMs = nowMs;
  state.framesInWindow = 0;
};

function moveToTier(state: WatchState, tier: QualityTier, onChange?: (tier: QualityTier) => void): void {
  state.tier = tier;
  state.slowWindows = 0;
  state.fastWindows = 0;
  onChange?.(tier);
}

// A tier that fell again after a climb waits twice as long before its next try, so a board on the edge does not keep changing.
function judgeWindow(state: WatchState, framesPerSecond: number, onChange?: (tier: QualityTier) => void): void {
  const isSlow = framesPerSecond < LOWEST_RATES[state.tier];
  state.slowWindows = isSlow ? state.slowWindows + 1 : 0;
  state.fastWindows = framesPerSecond >= RATE_TO_CLIMB[state.tier] ? state.fastWindows + 1 : 0;
  if (state.slowWindows >= WINDOWS_TO_DROP && state.tier < 2) {
    if (state.hasClimbed) state.windowsToClimb = Math.min(MOST_WINDOWS_TO_CLIMB, state.windowsToClimb * 2);
    state.hasClimbed = false;
    moveToTier(state, (state.tier + 1) as QualityTier, onChange);
  } else if (state.fastWindows >= state.windowsToClimb && state.tier > 0) {
    state.hasClimbed = true;
    moveToTier(state, (state.tier - 1) as QualityTier, onChange);
  }
}

/** A gap over a second is a hidden tab and not a slow device, so it counts for nothing. */
export function createTierWatch(onChange?: (tier: QualityTier) => void): TierWatch {
  const state: WatchState = { tier: 0, windowStartMs: null, framesInWindow: 0, lastFrameMs: null, slowWindows: 0, fastWindows: 0, windowsToClimb: FIRST_WINDOWS_TO_CLIMB, hasClimbed: false };
  return {
    getTier: () => state.tier,
    noteFrame(nowMs) {
      const isGapTooLong = state.lastFrameMs !== null && nowMs - state.lastFrameMs > LONGEST_FRAME_COUNTED_MS;
      state.lastFrameMs = nowMs;
      if (isGapTooLong || state.windowStartMs === null) {
        startWindow(state, nowMs);
        return state.tier;
      }
      state.framesInWindow += 1;
      const elapsedMs = nowMs - state.windowStartMs;
      if (elapsedMs < WINDOW_MS) return state.tier;
      judgeWindow(state, (state.framesInWindow * 1000) / elapsedMs, onChange);
      startWindow(state, nowMs);
      return state.tier;
    },
  };
}

export const canPaintAt = (tier: QualityTier, sinceLastPaintMs: number) => tier === 0 || sinceLastPaintMs >= SMALLEST_PAINT_GAP_MS;

export const landsDrawingsAtOnce = (tier: QualityTier) => tier === 2;
