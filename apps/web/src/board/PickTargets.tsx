import type { BoardState } from '@astra/board';
import { getOpenTaskOnBoard, getPickParts } from '@astra/board/shared';
import type { TermQuery } from '@astra/board/drawing';
import type { StudentWork } from '@astra/contracts';
import { BOARD_WORK_LABELS } from '../strings';

interface PickTargetsProps {
  board: BoardState;
  targets: Map<string, { button: HTMLButtonElement; query: TermQuery; on: string }>;
  onWork(work: StudentWork): void;
}

// Real buttons laid over the parts, so a keyboard and a screen reader can pick too. The board moves them each frame.
export function PickTargets({ board, targets, onWork }: PickTargetsProps) {
  const task = getOpenTaskOnBoard(board);
  if (task?.way !== 'pick') {
    targets.clear();
    return null;
  }
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
          ref={(button) => {
            if (button) targets.set(part, { button, query, on: task.on });
            else targets.delete(part);
          }}
          onClick={() => onWork({ way: 'pick', task: task.id, part })}
        />
      ))}
    </>
  );
}
