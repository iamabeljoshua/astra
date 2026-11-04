import type { BoardOperation } from '@astra/board';

const MOST_KEY_MOMENTS = 3;
/** So a moment shows what landed and not the instant before it. */
const AFTER_IT_LANDS_MS = 600;

const getRightWorkTimes = (operations: readonly BoardOperation[]) => operations.flatMap((operation) => (operation.kind === 'worked' && operation.action.verdict.status === 'right' ? [operation.atMs] : []));

const getTutorTimes = (operations: readonly BoardOperation[]) => operations.flatMap((operation) => (operation.kind === 'command' ? [operation.atMs] : []));

export function getKeyMoments(operations: readonly BoardOperation[]): number[] {
  const rightTimes = getRightWorkTimes(operations);
  const times = rightTimes.length > 0 ? rightTimes : getTutorTimes(operations);
  if (times.length === 0) return [];
  const distinct = [...new Set(times)];
  const shown = Math.min(MOST_KEY_MOMENTS, distinct.length);
  return Array.from({ length: shown }, (_, index) => (distinct[Math.round(((index + 1) * distinct.length) / shown) - 1] as number) + AFTER_IT_LANDS_MS);
}

/** Which moment to show with this share of the recap spoken, or null to show the board as it stands now. */
export function getRecapMoment(moments: readonly number[], spokenShare: number): number | null {
  return moments[Math.floor(spokenShare * moments.length)] ?? null;
}
