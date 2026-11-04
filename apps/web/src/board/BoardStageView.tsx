import type { BoardStage } from '@astra/board';
import { writeStyle } from '@astra/board/drawing';
import { type PropsWithChildren, type ReactNode, useEffect, useLayoutEffect, useRef } from 'react';
import { BOARD_WORK_LABELS } from '../strings';
import { getKeptClearWidth, getVisualPlace, getVisualTransform, type VisualPeek } from './boardStage';
import { useReducedMotion } from './useReducedMotion';

const PHONE_WIDTH = 860;

interface BoardStageViewProps extends PropsWithChildren {
  stage: BoardStage | null;
  atMs: number;
  /** The seam for what fills the right side while teaching, today a session's picture and later a scene. It is drawn once at full size and only moved. */
  visual: ReactNode;
  ariaLabel: string;
  /** The student's own move of the visual, kept by the page because typing makes one too. */
  peek: VisualPeek | null;
  onPeek(peek: VisualPeek): void;
  /** Stays under the right side in both modes, so the student can always answer. */
  footer: ReactNode;
}

// The right side of the session. While teaching it holds the visual. For hands-on the visual glides to the corner and the board fades in under it, all read from the clock, so a replay lands on the same frame.
export function BoardStageView({ stage, atMs, visual, ariaLabel, peek, onPeek, footer, children }: BoardStageViewProps) {
  const right = useRef<HTMLDivElement>(null);
  const visualBox = useRef<HTMLButtonElement>(null);
  const boardBox = useRef<HTMLDivElement>(null);
  const isReducedMotion = useReducedMotion();
  const hasVisual = visual !== null && visual !== undefined;
  const { smallShare, isMoving } = getVisualPlace({ stage, peek, atMs, isReducedMotion });
  const isSmall = smallShare === 1;
  const isBigOverBoard = peek?.isBig === true;

  useEffect(() => {
    if (!isBigOverBoard) return;
    const putBack = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onPeek({ isBig: false, atMs });
    };
    document.addEventListener('keydown', putBack, true);
    return () => document.removeEventListener('keydown', putBack, true);
  }, [isBigOverBoard, atMs, onPeek]);

  useLayoutEffect(() => {
    const width = right.current?.clientWidth ?? 0;
    const isPhone = window.innerWidth <= PHONE_WIDTH;
    if (visualBox.current) {
      writeStyle(visualBox.current, 'transform', isPhone ? '' : getVisualTransform({ smallShare, width }));
      writeStyle(visualBox.current, 'opacity', isPhone && !isSmall && smallShare > 0 ? String(1 - smallShare) : '');
    }
    if (boardBox.current) {
      writeStyle(boardBox.current, 'opacity', hasVisual && smallShare < 1 ? smallShare.toFixed(3) : '');
      boardBox.current.style.pointerEvents = hasVisual && smallShare === 0 ? 'none' : '';
    }
    right.current?.style.setProperty('--board-kept-clear', hasVisual && !isPhone && smallShare > 0 ? `${getKeptClearWidth(width)}px` : '0px');
  });

  const togglePeek = () => {
    if (smallShare === 0 && !peek?.isBig) return;
    onPeek({ isBig: !(peek?.isBig ?? false), atMs });
  };

  return (
    <section aria-label={ariaLabel} className="fades-with-theme board-right-side">
      <div ref={right} className="board-right" data-testid="board-right">
      {hasVisual && (
        <button
          ref={visualBox}
          type="button"
          data-testid="board-visual"
          data-big={smallShare === 0}
          data-small={isSmall}
          data-moving={isMoving}
          data-big-over-board={isBigOverBoard}
          aria-label={isBigOverBoard ? BOARD_WORK_LABELS.visualPutBack : BOARD_WORK_LABELS.visualLookAgain}
          tabIndex={isSmall || isBigOverBoard ? 0 : -1}
          onClick={togglePeek}
          className="board-visual"
        >
          {visual}
        </button>
      )}
      <div ref={boardBox} className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
      {footer}
    </section>
  );
}
