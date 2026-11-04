import type { BoardOperation } from '@astra/board';

const MOST_KEPT_CHARACTERS = 2_000_000;
const SETTLED_MS_BEFORE_THIS_PAGE = 2000;

const getKey = (roomName: string) => `astra.board.${roomName}`;

/** Kept for this tab only, so a reload brings the board back and nothing stays on a shared computer once the tab closes. */
export function keepBoard(roomName: string, operations: readonly BoardOperation[]): void {
  try {
    const whole = JSON.stringify(operations);
    sessionStorage.setItem(getKey(roomName), whole.length <= MOST_KEPT_CHARACTERS ? whole : JSON.stringify(operations.filter(({ kind }) => kind !== 'inkStroke')));
  } catch {
    // A full or blocked store only costs the student the comeback.
  }
}

const moveInTime = (operation: BoardOperation, byMs: number): BoardOperation => {
  const atMs = operation.atMs + byMs;
  if (operation.kind === 'rewound') return { ...operation, atMs, toMs: operation.toMs + byMs };
  if (operation.kind === 'reaim') return { ...operation, atMs, landsAtMs: operation.landsAtMs + byMs };
  return { ...operation, atMs };
};

/** The last page's times mean nothing on this page's clock, so they move to just before its zero, with everything already drawn. */
export function getKeptBoard(roomName: string): BoardOperation[] {
  try {
    const kept = JSON.parse(sessionStorage.getItem(getKey(roomName)) ?? '[]') as BoardOperation[];
    if (!Array.isArray(kept) || kept.length === 0) return [];
    const lastMs = Math.max(...kept.map(({ atMs }) => atMs));
    return kept.map((operation) => moveInTime(operation, -lastMs - SETTLED_MS_BEFORE_THIS_PAGE));
  } catch {
    return [];
  }
}
