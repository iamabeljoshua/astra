import type { ElementId, StudentWork, Task } from '@astra/contracts';
import type { BoardState } from '../player/board-state.ts';
import { checkWork, type CheckedWork, getCurveOf, type WorkContext } from './check-work.ts';

function getOpenTask(board: BoardState, id: ElementId | undefined): Task | null {
  const element = id === undefined ? undefined : board.elements.get(id);
  return element?.content.kind === 'task' && element.progress?.isOpen ? element.content : null;
}

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

export function checkWorkOnBoard(work: StudentWork, board: BoardState): CheckedWork {
  return checkWork(work, getWorkContext(board, work.task));
}

export function getOpenTaskOnBoard(board: BoardState): Task | null {
  for (const element of [...board.elements.values()].reverse()) {
    if (element.content.kind === 'task' && element.progress?.isOpen) return element.content;
  }
  return null;
}
