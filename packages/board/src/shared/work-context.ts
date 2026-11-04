import type { ElementId, StudentWork, Task } from '@astra/contracts';
import type { BoardState } from '../player/board-state.ts';
import { checkWork, type CheckedWork, getCurveOf, type WorkContext } from './check-work.ts';

function getOpenTask(board: BoardState, id: ElementId | undefined): Task | null {
  const element = id === undefined ? undefined : board.elements.get(id);
  return element?.content.kind === 'task' && element.progress?.isOpen ? element.content : null;
}

/** The task a browser's message names, only if it is the open one. A forged name finds nothing. */
export function getWorkContext(board: BoardState, taskId: ElementId | undefined): WorkContext {
  const task = getOpenTask(board, taskId);
  const progress = taskId === undefined ? undefined : board.elements.get(taskId)?.progress;
  return {
    task,
    previousTex: progress?.lastLineTex ?? null,
    pickedRight: progress?.pickedRight ?? [],
    getLineTex(id) {
      const element = board.elements.get(id);
      return element?.math?.tex ?? null;
    },
    getCurve(id) {
      const content = board.elements.get(id)?.content;
      if (content?.kind !== 'plot') return null;
      return getCurveOf(content.expression, new Map((content.constants ?? []).map(({ name, value }) => [name, value])));
    },
  };
}

export function getWorkTaskId(work: StudentWork): ElementId | undefined {
  return work.task;
}

/** What code makes of this work on this board. The page uses it to react at once, and the agent to check the same work for itself. */
export function checkWorkOnBoard(work: StudentWork, board: BoardState): CheckedWork {
  return checkWork(work, getWorkContext(board, getWorkTaskId(work)));
}

/** The task open on the board now, for the page to offer. */
export function getOpenTaskOnBoard(board: BoardState): Task | null {
  for (const element of [...board.elements.values()].reverse()) {
    if (element.content.kind === 'task' && element.progress?.isOpen) return element.content;
  }
  return null;
}
