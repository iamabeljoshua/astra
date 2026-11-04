import { getBoardAt, type BoardOperation } from '@astra/board';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BoardView } from './BoardView';

const OPERATIONS: BoardOperation[] = [
  { kind: 'beatStarted', atMs: 0 },
  { kind: 'command', atMs: 100, overMs: null, command: { kind: 'text', id: 'title' as never, text: 'A jump shot' } },
  { kind: 'command', atMs: 500, overMs: null, command: { kind: 'simulate', id: 'shot' as never, simulation: { model: 'projectile', parameters: { horizontalSpeed: 4, upwardSpeed: 5, releaseHeight: 2, gravity: 9.8 } } } },
];

describe('BoardView', () => {
  it('draws only what the board holds at this moment, and says once when each element first appears', () => {
    const onElementDrawn = vi.fn();
    const { rerender } = render(<BoardView board={getBoardAt(OPERATIONS, 50)} atMs={50} onElementDrawn={onElementDrawn} />);
    expect(screen.queryByText('A jump shot')).toBeNull();
    rerender(<BoardView board={getBoardAt(OPERATIONS, 200)} atMs={200} onElementDrawn={onElementDrawn} />);
    expect(screen.getByText('A jump shot')).toBeTruthy();
    rerender(<BoardView board={getBoardAt(OPERATIONS, 300)} atMs={300} onElementDrawn={onElementDrawn} />);
    expect(onElementDrawn.mock.calls).toEqual([['title']]);
  });

  it('fades an element in from the clock, so a frozen board keeps its place', () => {
    const { container } = render(<BoardView board={getBoardAt(OPERATIONS, 200)} atMs={200} />);
    expect(container.querySelector<HTMLElement>('[data-element="title"]')?.style.opacity).toBe('0.25');
  });

  it('draws a ball once a simulation is placed', () => {
    const { container, rerender } = render(<BoardView board={getBoardAt(OPERATIONS, 200)} atMs={200} />);
    expect(container.querySelectorAll('[data-testid="scene"] circle')).toHaveLength(0);
    rerender(<BoardView board={getBoardAt(OPERATIONS, 600)} atMs={600} />);
    expect(container.querySelectorAll('[data-testid="scene"] circle')).toHaveLength(1);
  });
});
