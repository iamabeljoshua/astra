export interface WatchedMoment {
  atS: number;
  /** Ids of the beats the page has played, which tells the closing question from a question in the middle of a lesson. */
  closedBeats: readonly string[];
  hasScene: boolean;
}

// The window is about 20 s after the opening, and the close can come before it ends, so this waits a little longer than the whole window.
const SECONDS_TO_WATCH_AFTER_THE_CLOSE = 25;
const SECONDS_TO_LET_THE_CLOSE_LAND = 2;

export function isLessonDone(moments: readonly WatchedMoment[]): boolean {
  const last = moments.at(-1);
  const closedAt = moments.find(({ closedBeats }) => closedBeats.includes('close'));
  if (!last || !closedAt) return false;
  if (last.closedBeats.includes('close-again')) return true;
  const secondsSinceClose = last.atS - closedAt.atS;
  const wasShownByTheClose = moments.some(({ hasScene, atS }) => hasScene && atS <= closedAt.atS);
  return secondsSinceClose >= (wasShownByTheClose ? SECONDS_TO_LET_THE_CLOSE_LAND : SECONDS_TO_WATCH_AFTER_THE_CLOSE);
}
