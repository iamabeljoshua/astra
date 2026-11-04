import type { BoardState } from '@astra/board';
import { getOpenTaskOnBoard, getPickParts } from '@astra/board/shared';
import type { TermQuery } from '@astra/board/drawing';
import type { StudentWork } from '@astra/contracts';
import { BOARD_WORK_LABELS } from '../strings';

export interface PickTarget {
  button: HTMLButtonElement;
  query: TermQuery;
  on: string;
}

interface PickTargetsProps {
  board: BoardState;
  onTarget(part: string, target: PickTarget | null): void;
  onWork(work: StudentWork): void;
}

// Real buttons laid over the parts, which the board moves each frame.
export function PickTargets({ board, onTarget, onWork }: PickTargetsProps) {
  const task = getOpenTaskOnBoard(board);
  if (task?.way !== 'pick') return null;
  const parts = getPickParts(board.elements.get(task.on));
  return (
    <>
      {parts.map(({ part, query }) => (
        <button
          key={part}
          type="button"
          data-testid="pick-part"
          aria-label={BOARD_WORK_LABELS.pickPart(part)}
          className="board-pick absolute top-0 left-0 cursor-pointer"
          ref={(button) => onTarget(part, button && { button, query, on: task.on })}
          onClick={() => onWork({ way: 'pick', task: task.id, part })}
        />
      ))}
    </>
  );
}
