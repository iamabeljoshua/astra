import { type PropsWithChildren, useEffect, useRef } from 'react';
import { PRODUCT_NAME } from '../../strings';
import { ThemeToggle } from '../../theme/ThemeToggle';
import type { DotPoint } from './dotDrawings';
import { createDotPainter, type DotPainter } from './dotPainter';

interface DotStageProps extends PropsWithChildren {
  shape: readonly DotPoint[];
}

// One calm page: a still dot grid, a shape made of dots that forms when `shape` changes, and the question beside it.
export function DotStage({ shape, children }: DotStageProps) {
  const stage = useRef<HTMLDivElement>(null);
  const gridCanvas = useRef<HTMLCanvasElement>(null);
  const shapeCanvas = useRef<HTMLCanvasElement>(null);
  const painter = useRef<DotPainter | null>(null);

  useEffect(() => {
    if (!stage.current || !gridCanvas.current || !shapeCanvas.current) return undefined;
    const created = createDotPainter({ stage: stage.current, gridCanvas: gridCanvas.current, shapeCanvas: shapeCanvas.current });
    painter.current = created;
    return () => {
      created?.stop();
      painter.current = null;
    };
  }, []);

  useEffect(() => {
    painter.current?.showShape(shape);
  }, [shape]);

  return (
    <div ref={stage} className="relative flex min-h-dvh flex-col overflow-hidden">
      <title>{PRODUCT_NAME}</title>
      <canvas ref={gridCanvas} aria-hidden="true" className="absolute inset-0 size-full text-ink" />
      <canvas ref={shapeCanvas} aria-hidden="true" className="absolute text-ink" />
      <div className="relative flex items-center justify-between px-page-side py-5">
        <div className="product-mark">{PRODUCT_NAME}</div>
        <ThemeToggle />
      </div>
      <main className="relative flex flex-1 animate-arrive items-center pb-14 max-md:items-start max-md:pt-stage-shape-room">
        <div className="flex w-full max-w-stage flex-col gap-6.5 pr-4 pl-stage-side">{children}</div>
      </main>
    </div>
  );
}
