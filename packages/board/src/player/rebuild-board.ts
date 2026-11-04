import type { SessionEvent } from '@astra/contracts';
import { getLogOperations } from './board-operations.ts';
import { type BoardState, getBoardAt } from './board-state.ts';
import type { SceneCatalog } from './scene.ts';

export function rebuildBoard(log: readonly SessionEvent[], atMs: number, catalog?: SceneCatalog): BoardState {
  return getBoardAt(getLogOperations(log), atMs, catalog);
}
