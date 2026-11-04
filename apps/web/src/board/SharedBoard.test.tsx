import { type BoardOperation, getBoardAt } from '@astra/board';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SharedBoard } from './SharedBoard';

const command = (value: object, atMs: number) => ({ kind: 'command', atMs, command: value, overMs: null }) as unknown as BoardOperation;
const table = (id: string, cell: string, atMs: number) => command({ kind: 'table', id, columns: ['Year'], rows: [[cell]] }, atMs);
const LONG_AFTER = 60_000;

describe('the shared board', () => {
  it('draws the table a tutor replaces under the same id, and not the old one', () => {
    const first = table('money', '110', 1);
    const { rerender } = render(<SharedBoard board={getBoardAt([first], LONG_AFTER)} atMs={LONG_AFTER} />);
    expect(screen.getByText('110')).toBeTruthy();
    rerender(<SharedBoard board={getBoardAt([first, table('money', '121', 2)], LONG_AFTER)} atMs={LONG_AFTER} />);
    expect(screen.getByText('121')).toBeTruthy();
    expect(screen.queryByText('110')).toBeNull();
  });

  it('shows a label given to a check, beside the check', () => {
    const operations = [table('money', '110', 1), command({ kind: 'annotate', id: 'tick', target: 'money', mark: 'check', label: 'all right' }, 2)];
    render(<SharedBoard board={getBoardAt(operations, LONG_AFTER)} atMs={LONG_AFTER} />);
    expect(screen.getByTestId('mark-check')).toBeTruthy();
    expect(screen.getByText('all right')).toBeTruthy();
  });

  it('gives a table, a timeline, code, and a drawing the row type words use, and leaves math its own', () => {
    const operations = [table('money', '110', 1), command({ kind: 'timeline', id: 'rome', events: [{ when: '27 BC', label: 'Augustus' }] }, 2), command({ kind: 'code', id: 'loop', language: 'python', source: 'print(1)' }, 3), command({ kind: 'drawing', id: 'cell', name: 'animal-cell' }, 4), command({ kind: 'writeMath', id: 'steps', tex: 'x = 1' }, 5)];
    const { container } = render(<SharedBoard board={getBoardAt(operations, LONG_AFTER)} atMs={LONG_AFTER} />);
    const isBlock = (id: string) => container.querySelector(`[data-row="${id}"]`)?.classList.contains('board-row-block');
    expect(['money', 'rome', 'loop', 'cell'].map(isBlock)).toEqual([true, true, true, true]);
    expect(isBlock('steps')).toBe(false);
  });

  it('gives a drawing only ever seen under a flight no row of its own', () => {
    const { container } = render(<SharedBoard board={getBoardAt([command({ kind: 'drawing', id: 'court', name: 'hoop-side' }, 1)], LONG_AFTER)} atMs={LONG_AFTER} />);
    expect(container.querySelector('[data-row="court"]')).toBeNull();
  });

  it('tells the tutor once when a curve turns too fast to draw', () => {
    const onBoardProblem = vi.fn();
    const operations = [command({ kind: 'plot', id: 'fine', expression: 'sin(9000*x)', domain: [0, 100] }, 1)];
    const { rerender } = render(<SharedBoard board={getBoardAt(operations, LONG_AFTER)} atMs={LONG_AFTER} onBoardProblem={onBoardProblem} />);
    rerender(<SharedBoard board={getBoardAt(operations, LONG_AFTER + 1)} atMs={LONG_AFTER + 1} onBoardProblem={onBoardProblem} />);
    expect(onBoardProblem.mock.calls.filter(([{ kind }]) => kind === 'curveTooFine')).toEqual([[{ kind: 'curveTooFine', target: 'fine' }]]);
  });
});
