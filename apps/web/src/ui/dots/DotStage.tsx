import { type PropsWithChildren, type ReactNode, useLayoutEffect, useRef } from 'react';
import { PRODUCT_NAME } from '../../strings';
import { ThemeToggle } from '../../theme/ThemeToggle';
import { PATH_LEG_COUNT, type LitStar } from './chartStars';
import { DOT_DRAWINGS } from './dotDrawings';
import { createDotPainter, type DotPainter } from './dotPainter';
import type { DotPoint } from './dotPoint';

interface DotStageProps extends PropsWithChildren {
  shape?: readonly DotPoint[];
  legsDrawn?: number;
  litStars?: readonly LitStar[];
  chartTitle?: string;
  headerAction?: ReactNode;
  formsOnArrival?: boolean;
}

const NO_LIT_STARS: readonly LitStar[] = [];

export function DotStage({ shape = DOT_DRAWINGS.planet, legsDrawn = PATH_LEG_COUNT, litStars = NO_LIT_STARS, chartTitle, headerAction, formsOnArrival = false, children }: DotStageProps) {
  const stage = useRef<HTMLDivElement>(null);
  const backdropCanvas = useRef<HTMLCanvasElement>(null);
  const liveCanvas = useRef<HTMLCanvasElement>(null);
  const painter = useRef<DotPainter | null>(null);

  // Layout effects paint before the browser does, so moving from one dot page to the next never shows a blank chart.
  useLayoutEffect(() => {
    if (!stage.current || !backdropCanvas.current || !liveCanvas.current) return undefined;
    const created = createDotPainter({ stage: stage.current, backdropCanvas: backdropCanvas.current, liveCanvas: liveCanvas.current, formsOnArrival });
    painter.current = created;
    return () => {
      created?.stop();
      painter.current = null;
    };
  }, [formsOnArrival]);

  useLayoutEffect(() => {
    painter.current?.show({ shape, legsDrawn, litStars });
  }, [shape, legsDrawn, litStars]);

  return (
    <div ref={stage} className="relative flex min-h-dvh flex-col overflow-hidden">
      <title>{PRODUCT_NAME}</title>
      <canvas ref={backdropCanvas} aria-hidden="true" className="absolute inset-0 size-full bg-paper text-ink" />
      <canvas ref={liveCanvas} aria-hidden="true" className="absolute inset-0 size-full" />
      <div className="relative flex items-center justify-between px-stage-edge py-7 max-lg:absolute max-lg:inset-x-0 max-lg:top-0">
        <div className="product-mark">{PRODUCT_NAME}</div>
        <div className="flex items-center gap-4">
          {headerAction}
          <ThemeToggle />
        </div>
      </div>
      <div className="h-stage-band flex-none lg:hidden" />
      {chartTitle && (
        <p className="relative px-stage-edge text-right font-voice text-chart-title wrap-anywhere italic max-lg:text-body lg:absolute lg:right-0 lg:bottom-6 lg:max-w-[58vw]">
          {chartTitle}
        </p>
      )}
      <main className="relative flex flex-1 animate-arrive items-center pb-14 max-lg:items-start max-lg:pt-4 max-lg:pb-10">
        <div className="flex w-full max-w-stage flex-col gap-5.5 pr-5 pl-stage-side lg:max-w-[min(var(--container-stage),42vw)]">{children}</div>
      </main>
    </div>
  );
}
