import type { BoardElement } from '@astra/board';
import { getDragStep, getDragXAtPixel, getPointX, snapDragX } from '@astra/board/drawing';
import type { PointSample, StudentWork } from '@astra/contracts';
import { type KeyboardEvent, type PointerEvent, useRef } from 'react';
import { BOARD_WORK_LABELS } from '../strings';

/** The wire takes this many, so a long drag keeps its start and its latest place. */
const MOST_SAMPLES = 300;
const GRAB_WITHIN_PIXELS = 26;
const GRAB_WITHIN_SHARE = 0.06;

interface DragSurfaceProps {
  plot: BoardElement;
  task: BoardElement;
  atMs: number;
  isReducedMotion: boolean;
  onMovePoint(x: number): void;
  onWork(work: StudentWork, startedMsAgo: number): void;
}

const getDomain = (plot: BoardElement) => (plot.content.kind === 'plot' ? plot.content.domain : ([0, 1] as const));

// Lies over the plot and moves the student's point, by pointer or arrow keys. The board draws the point, and letting go sends the work.
export function DragSurface({ plot, task, atMs, isReducedMotion, onMovePoint, onWork }: DragSurfaceProps) {
  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startedAtMs: number; samples: PointSample[]; lastX: number } | null>(null);
  const domain = getDomain(plot);
  const pointX = getPointX(task, domain);

  // The figure can be narrower than its row, and the point is drawn on the figure.
  const getFigureBox = () => {
    const own = surface.current as HTMLDivElement;
    return (own.parentElement?.querySelector('[data-testid="figure"]') ?? own).getBoundingClientRect();
  };

  const getXAt = (event: PointerEvent) => {
    const box = getFigureBox();
    return getDragXAtPixel({ element: plot, atMs, isReducedMotion, width: box.width, height: box.height }, event.clientX - box.left);
  };

  const moveTo = (x: number) => {
    const held = drag.current;
    if (!held || x === held.lastX) return;
    held.lastX = x;
    const sample = { afterMs: Math.round(performance.now() - held.startedAtMs), x };
    if (held.samples.length < MOST_SAMPLES) held.samples.push(sample);
    else held.samples[MOST_SAMPLES - 1] = sample;
    onMovePoint(x);
  };

  const hold = () => {
    drag.current ??= { startedAtMs: performance.now(), samples: [{ afterMs: 0, x: pointX }], lastX: pointX };
  };

  const letGo = () => {
    const held = drag.current;
    drag.current = null;
    if (!held || held.samples.length < 2) return;
    onWork({ way: 'drag', task: task.id, x: held.lastX, samples: held.samples }, Math.round(performance.now() - held.startedAtMs));
  };

  const isNearPoint = (event: PointerEvent) => {
    const span = domain[1] - domain[0];
    const { width } = getFigureBox();
    return Math.abs(getXAt(event) - pointX) <= Math.max(span * GRAB_WITHIN_SHARE, (GRAB_WITHIN_PIXELS / width) * span);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      letGo();
      return;
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    hold();
    const step = getDragStep(domain) * (event.key === 'ArrowLeft' ? -1 : 1);
    moveTo(snapDragX((drag.current as { lastX: number }).lastX + step, domain));
  };

  return (
    <div
      ref={surface}
      role="slider"
      tabIndex={0}
      aria-label={BOARD_WORK_LABELS.movePoint}
      aria-valuemin={domain[0]}
      aria-valuemax={domain[1]}
      aria-valuenow={pointX}
      data-testid="drag-surface"
      className="board-drag-surface"
      onPointerDown={(event) => {
        if (!isNearPoint(event)) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        hold();
      }}
      onPointerMove={(event) => {
        if (drag.current) moveTo(getXAt(event));
        else event.currentTarget.style.cursor = isNearPoint(event) ? 'grab' : 'default';
      }}
      onPointerUp={letGo}
      onPointerCancel={letGo}
      onKeyDown={onKeyDown}
      onBlur={letGo}
    />
  );
}
