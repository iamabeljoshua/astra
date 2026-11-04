/** Enough of the board moved one way, up or down in luminance, to count as half a flash. */
export interface LuminanceChange {
  atMs: number;
  direction: 1 | -1;
}

/** WCAG's limit: 25% of a 10 degree field, which is 341 by 256 pixels at 1024 by 768. */
export const FLASH_AREA_PX = 21_824;
export const FLASH_LUMINANCE_CHANGE = 0.1;
/** WCAG counts a change only when its darker side is under this. */
export const DARKER_SIDE_LIMIT = 0.8;
const WINDOW_MS = 1000;

/** A flash is a pair of opposing changes, so only a change of direction counts. */
export function getMostFlashesInASecond(changes: readonly LuminanceChange[]): number {
  const turns = changes.filter(({ direction }, index) => direction !== changes[index - 1]?.direction).map(({ atMs }) => atMs);
  const mostTurns = turns.reduce((most, startMs) => Math.max(most, turns.filter((atMs) => atMs >= startMs && atMs < startMs + WINDOW_MS).length), 0);
  return Math.floor(mostTurns / 2);
}
