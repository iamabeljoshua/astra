import type { BoardOperation } from '@astra/board';

const MOST_KEPT_CHARACTERS = 2_000_000;
const SETTLED_MS_BEFORE_THIS_PAGE = 2000;

const KEY_START = 'astra.board.';
let isSignedOut = false;

const getKey = (roomName: string) => `${KEY_START}${roomName}`;

/** Students share machines, so a kept board goes at sign-out and when another student takes over. A sign-out leaves the page, and leaving is what keeps a board, so nothing is kept after it. */
export function forgetKeptBoards({ isSigningOut = false } = {}): void {
  isSignedOut ||= isSigningOut;
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith(KEY_START)) sessionStorage.removeItem(key);
    }
  } catch {
    // A blocked store holds nothing to forget.
  }
}

/** Kept for this tab only, so a reload brings the board back. */
export function keepBoard(roomName: string, operations: readonly BoardOperation[]): void {
  if (isSignedOut) return;
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
