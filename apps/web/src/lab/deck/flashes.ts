export interface LuminanceSample {
  atMs: number;
  mean: number;
}

const FLASH_AREA_PX = 87_296;
const FLASH_LUMINANCE_CHANGE = 0.1;
const WINDOW_MS = 1000;

/** The change in the board's mean that a flash of WCAG's area and depth causes, which on a board smaller than that area is the full depth. */
export const getSmallestFlashChange = (boardPx: number) => FLASH_LUMINANCE_CHANGE * Math.min(1, FLASH_AREA_PX / boardPx);

// Each change is a run in one direction at least `smallest` deep, so noise smaller than a flash never counts.
function getChangeTimes(samples: readonly LuminanceSample[], smallest: number): number[] {
  const changes: number[] = [];
  let direction = 0;
  let turn = samples[0]?.mean ?? 0;
  for (const { atMs, mean } of samples) {
    const moved = mean - turn;
    if (Math.abs(moved) < smallest) continue;
    const isReversal = Math.sign(moved) !== direction;
    if (isReversal) changes.push(atMs);
    direction = Math.sign(moved);
    turn = mean;
  }
  return changes;
}

/** A flash is a pair of opposing changes in luminance. */
export function getMostFlashesInASecond(samples: readonly LuminanceSample[], smallest: number): number {
  const changes = getChangeTimes(samples, smallest);
  const mostChanges = changes.reduce((most, startMs) => Math.max(most, changes.filter((atMs) => atMs >= startMs && atMs < startMs + WINDOW_MS).length), 0);
  return Math.floor(mostChanges / 2);
}
