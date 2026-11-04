import { getBoardAt } from '@astra/board';
import { parseSceneCommand, type SceneCommand } from '@astra/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PickTargets } from './PickTargets';

const toCommand = (raw: object, atMs: number) => {
  const parsed = parseSceneCommand(raw);
  if (!parsed.ok) throw new Error(parsed.problem);
  return { kind: 'command' as const, atMs, command: parsed.value as SceneCommand, overMs: null };
};

describe('the terms a student clicks', () => {
  it('offers the signed term, as the prototype does, and sends it as the pick', () => {
    const board = getBoardAt([toCommand({ kind: 'writeMath', id: 'eq', tex: '2x+3=11', claim: 'new' }, 0), toCommand({ kind: 'task', id: 'a1', way: 'pick', on: 'eq', answer: ['+3'] }, 10)], 5000);
    const onWork = vi.fn();
    render(<PickTargets board={board} onTarget={() => {}} onWork={onWork} />);
    expect(screen.getAllByTestId('pick-part').map((button) => button.getAttribute('aria-label'))).toEqual(['Pick 2x', 'Pick +3', 'Pick 11']);
    screen.getByRole('button', { name: 'Pick +3' }).click();
    expect(onWork).toHaveBeenCalledWith({ way: 'pick', task: 'a1', part: '+3' });
  });
});
