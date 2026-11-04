import type { Task } from '@astra/contracts';

const getSeed = (text: string) => [...text].reduce((seed, character) => (seed * 31 + (character.codePointAt(0) ?? 0)) % 2147483647, 7) || 1;

// Seeded by the task's id, so a replay shows the same order, and turned once more if it would have landed on the answer.
export function getItemsToShow(task: Task & { way: 'place' }): string[] {
  let state = getSeed(task.id);
  const items = [...task.items];
  for (let index = items.length - 1; index > 0; index -= 1) {
    state = (state * 48271) % 2147483647;
    const other = state % (index + 1);
    [items[index], items[other]] = [items[other] as string, items[index] as string];
  }
  const isTheAnswer = task.answer?.every((item, index) => items[index] === item) ?? false;
  return isTheAnswer ? [...items.slice(1), items[0] as string] : items;
}
