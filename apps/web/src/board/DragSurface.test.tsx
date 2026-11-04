import { type BoardElement, getBoardAt } from '@astra/board';
import { fireEvent, render, screen } from '@testing-library/react';
import { type ElementId, parseSceneCommand, type SceneCommand } from '@astra/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DragSurface } from './DragSurface';

const BOX = { left: 0, top: 0, right: 580, bottom: 418, width: 580, height: 418, x: 0, y: 0, toJSON: () => ({}) };

const toCommand = (raw: object) => {
  const parsed = parseSceneCommand(raw);
  if (!parsed.ok) throw new Error(parsed.problem);
  return { kind: 'command' as const, atMs: 0, command: parsed.value as SceneCommand, overMs: null };
};

function open() {
  const board = getBoardAt([toCommand({ kind: 'plot', id: 'curve', expression: 'x^2 - 4*x + 3', domain: [-1, 5] }), toCommand({ kind: 'task', id: 'a1', way: 'drag', on: 'curve', seek: 'flat' })], 3000);
  const onMovePoint = vi.fn();
  const onWork = vi.fn();
  render(<DragSurface plot={board.elements.get('curve' as ElementId) as BoardElement} task={board.elements.get('a1' as ElementId) as BoardElement} atMs={3000} isReducedMotion={false} onMovePoint={onMovePoint} onWork={onWork} />);
  const surface = screen.getByTestId('drag-surface');
  surface.getBoundingClientRect = () => BOX;
  surface.setPointerCapture = () => {};
  return { surface, onMovePoint, onWork };
}

describe('moving the student\'s point', () => {
  beforeEach(() => vi.clearAllMocks());

  it('moves only from near the point, and sends the whole path on letting go', () => {
    const { surface, onMovePoint, onWork } = open();
    fireEvent.pointerDown(surface, { clientX: 500, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 400, pointerId: 1 });
    fireEvent.pointerUp(surface, { pointerId: 1 });
    expect(onMovePoint).not.toHaveBeenCalled();
    expect(onWork).not.toHaveBeenCalled();

    fireEvent.pointerDown(surface, { clientX: 110, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 300, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 310, pointerId: 1 });
    fireEvent.pointerUp(surface, { pointerId: 1 });
    expect(onMovePoint).toHaveBeenCalledTimes(2);
    expect(onWork).toHaveBeenCalledOnce();
    const [work, startedMsAgo] = onWork.mock.calls[0] as [{ way: string; task: string; x: number; samples: { x: number }[] }, number];
    expect(work).toMatchObject({ way: 'drag', task: 'a1' });
    expect(work.x).toBe(work.samples.at(-1)?.x);
    expect(work.samples).toHaveLength(3);
    expect(startedMsAgo).toBeGreaterThanOrEqual(0);
  });

  it('sends nothing for a press that moved nothing', () => {
    const { surface, onWork } = open();
    fireEvent.pointerDown(surface, { clientX: 110, pointerId: 1 });
    fireEvent.pointerUp(surface, { pointerId: 1 });
    expect(onWork).not.toHaveBeenCalled();
  });

  it('moves by arrow keys and sends on Enter', () => {
    const { surface, onMovePoint, onWork } = open();
    fireEvent.keyDown(surface, { key: 'ArrowRight' });
    fireEvent.keyDown(surface, { key: 'ArrowRight' });
    fireEvent.keyDown(surface, { key: 'Enter' });
    expect(onMovePoint).toHaveBeenCalledTimes(2);
    expect(onWork).toHaveBeenCalledOnce();
  });
});
