import { type ElementId, getInkStrokeId, type InkPoint, type Task } from '@astra/contracts';
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import type { LiveVoice } from '../voice/liveVoice';
import { BOARD_WORK_LABELS } from '../strings';
import { InkLine } from './InkLine';

const PEN_PEEK_MS = 650;
const PEN_COMMIT_MS = 2000;

interface PenBandProps {
  task: Task | null;
  voice: Pick<LiveVoice, 'sendInkStroke' | 'sendInkPeek' | 'sendInkDone'>;
  nextLineId(): ElementId;
  onLineChange(lineId: ElementId | null): void;
  doneRef: RefObject<(() => void) | null>;
  onWorking(): void;
  onFinished(): void;
}

// A band to write on: each stroke goes out as it ends, and a pause sends the line to be read.
export function PenBand({ task, voice, nextLineId, onLineChange, doneRef, onWorking, onFinished }: PenBandProps) {
  const band = useRef<HTMLDivElement>(null);
  const [strokes, setStrokes] = useState<readonly (readonly InkPoint[])[]>([]);
  const [drawing, setDrawing] = useState<readonly InkPoint[] | null>(null);
  const lineId = useRef<ElementId | null>(null);
  const strokeStartedAt = useRef(0);
  const strokeCount = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const peekTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const getStrokeIds = (id: ElementId) => Array.from({ length: strokeCount.current }, (_, index) => getInkStrokeId(id, index));

  const getPoint = (event: React.PointerEvent): InkPoint => {
    const box = (band.current as HTMLDivElement).getBoundingClientRect();
    const toFraction = (value: number) => Number(Math.min(1, Math.max(0, value / box.width)).toFixed(4));
    return [toFraction(event.clientX - box.left), toFraction(event.clientY - box.top), Math.round(performance.now() - strokeStartedAt.current)];
  };

  const finish = useCallback(() => {
    clearTimeout(timer.current);
    clearTimeout(peekTimer.current);
    const id = lineId.current;
    if (!id) return;
    voice.sendInkDone(id, getStrokeIds(id), task?.id ?? null);
    lineId.current = null;
    strokeCount.current = 0;
    setStrokes([]);
    onLineChange(null);
    onFinished();
  }, [voice, task, onLineChange, onFinished]);

  const latestFinish = useRef(finish);
  useEffect(() => {
    latestFinish.current = finish;
    doneRef.current = finish;
  }, [doneRef, finish]);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      clearTimeout(peekTimer.current);
    },
    [],
  );

  const start = (event: React.PointerEvent) => {
    event.preventDefault();
    clearTimeout(timer.current);
    clearTimeout(peekTimer.current);
    band.current?.setPointerCapture(event.pointerId);
    if (!lineId.current) {
      lineId.current = nextLineId();
      onLineChange(lineId.current);
    }
    strokeStartedAt.current = performance.now();
    setDrawing([getPoint(event)]);
    onWorking();
  };

  const move = (event: React.PointerEvent) => {
    if (!drawing) return;
    setDrawing([...drawing, getPoint(event)]);
    onWorking();
  };

  const end = () => {
    const id = lineId.current;
    if (!drawing || !id) return;
    voice.sendInkStroke(getInkStrokeId(id, strokeCount.current), drawing);
    strokeCount.current += 1;
    setStrokes([...strokes, drawing]);
    setDrawing(null);
    peekTimer.current = setTimeout(() => voice.sendInkPeek(getStrokeIds(id)), PEN_PEEK_MS);
    timer.current = setTimeout(() => latestFinish.current(), PEN_COMMIT_MS);
  };

  return (
    <div ref={band} role="img" aria-label={BOARD_WORK_LABELS.band} data-testid="pen-band" className="board-band" onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      <InkLine strokes={drawing ? [...strokes, drawing] : strokes} testId="pen-strokes" />
    </div>
  );
}
