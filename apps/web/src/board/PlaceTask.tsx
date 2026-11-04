import type { TaskProgress } from '@astra/board';
import { getItemsToShow } from '@astra/board/shared';
import type { StudentWork, Task } from '@astra/contracts';
import { useState } from 'react';
import { BOARD_WORK_LABELS } from '../strings';

interface PlaceTaskProps {
  task: Task & { way: 'place' };
  progress: TaskProgress | undefined;
  onWork?: (work: StudentWork) => void;
}

const CHOICE = 'border border-line px-3 py-1.5 text-sub text-left';

export function PlaceTask({ task, progress, onWork }: PlaceTaskProps) {
  const [chosen, setChosen] = useState<string | null>(null);
  const placed = progress?.placed ?? task.slots.map(() => null);
  const canAct = Boolean(onWork) && progress?.isOpen === true;
  const unplaced = getItemsToShow(task).filter((item) => !placed.includes(item));

  const place = (slotIndex: number) => {
    const next = placed.map((item, index) => (index === slotIndex ? chosen : item === chosen ? null : item));
    setChosen(null);
    onWork?.({ way: 'place', task: task.id, placed: next });
  };

  const takeOut = (slotIndex: number) => onWork?.({ way: 'place', task: task.id, placed: placed.map((item, index) => (index === slotIndex ? null : item)) });

  return (
    <div data-testid="place-task" className="flex max-w-full flex-col gap-3 font-ui">
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label={BOARD_WORK_LABELS.items}>
        {unplaced.map((item) => (
          <li key={item}>
            <button type="button" data-testid="place-item" disabled={!canAct} aria-pressed={chosen === item} onClick={() => setChosen(chosen === item ? null : item)} className={`${CHOICE} ${chosen === item ? 'bg-ink text-paper' : ''}`}>
              {item}
            </button>
          </li>
        ))}
      </ul>
      <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
        {task.slots.map((slot, index) => {
          const item = placed[index] ?? null;
          const canPlace = canAct && chosen !== null;
          return (
            <li key={slot} className="flex items-center gap-3">
              <span className="label min-w-16 text-ink-2">{slot}</span>
              {item === null ? (
                <button type="button" data-testid="place-slot" disabled={!canPlace} aria-label={BOARD_WORK_LABELS.placeInSlot(slot)} onClick={() => place(index)} className={`${CHOICE} min-w-40 text-ink-2`}>
                  {BOARD_WORK_LABELS.emptySlot}
                </button>
              ) : (
                <button type="button" data-testid="placed-item" disabled={!canAct} aria-label={BOARD_WORK_LABELS.clearSlot(item, slot)} onClick={() => takeOut(index)} className={`${CHOICE} min-w-40`}>
                  {item}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
