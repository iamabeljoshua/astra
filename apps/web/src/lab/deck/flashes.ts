/** One frame's mean relative luminance, from 0 to 1, over the whole board. */
export interface LuminanceSample {
  atMs: number;
  mean: number;
}

/** WCAG's 25% of a 10 degree field of view, at 1024 by 768, in pixels. */
const FLASH_AREA_PX = 87_296;
const FLASH_LUMINANCE_CHANGE = 0.1;
const WINDOW_MS = 1000;

/** The change in the board's mean that a flash over WCAG's area and depth causes. A board smaller than that area needs the whole of it to change. */
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

/** The most flashes in any one second. A flash is a pair of opposing changes in luminance. */
export function getMostFlashesInASecond(samples: readonly LuminanceSample[], smallest: number): number {
  const changes = getChangeTimes(samples, smallest);
  const mostChanges = changes.reduce((most, startMs) => Math.max(most, changes.filter((atMs) => atMs >= startMs && atMs < startMs + WINDOW_MS).length), 0);
  return Math.floor(mostChanges / 2);
}
