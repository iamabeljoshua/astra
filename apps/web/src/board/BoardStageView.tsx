import type { BoardStage } from '@astra/board';
import { writeStyle } from '@astra/board/drawing';
import { type PropsWithChildren, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BOARD_WORK_LABELS } from '../strings';
import { getKeptClearWidth, getPhoneKeptClearHeight, getVisualPlace, getVisualTransform, type VisualPeek } from './boardStage';
import { useReducedMotion } from './useReducedMotion';

const PHONE_WIDTH = 860;

interface BoardStageViewProps extends PropsWithChildren {
  stage: BoardStage | null;
  atMs: number;
  visual: ReactNode;
  ariaLabel: string;
  peek: VisualPeek | null;
  onPeek(peek: VisualPeek): void;
  footer: ReactNode;
}

// The session's right side: the visual while teaching, and for hands-on the visual glides to the corner as the board fades in.
export function BoardStageView({ stage, atMs, visual, ariaLabel, peek, onPeek, footer, children }: BoardStageViewProps) {
  const right = useRef<HTMLDivElement>(null);
  const visualBox = useRef<HTMLButtonElement>(null);
  const boardBox = useRef<HTMLDivElement>(null);
  const isReducedMotion = useReducedMotion();
  const hasVisual = visual !== null && visual !== undefined;
  const { smallShare, isMoving } = getVisualPlace({ stage, peek, atMs, isReducedMotion });
  const isSmall = smallShare === 1;
  const isBigOverBoard = peek?.isBig === true;
  const [peeksTaken, setPeeksTaken] = useState(0);

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
      writeStyle(visualBox.current, 'transform', getVisualTransform({ smallShare: isPhone ? (isSmall ? 1 : 0) : smallShare, width, isPhone }));
      writeStyle(visualBox.current, 'opacity', isPhone && !isSmall && smallShare > 0 ? String(1 - smallShare) : '');
    }
    if (boardBox.current) {
      writeStyle(boardBox.current, 'opacity', hasVisual && smallShare < 1 ? smallShare.toFixed(3) : '');
      boardBox.current.style.pointerEvents = hasVisual && smallShare === 0 ? 'none' : '';
    }
    right.current?.style.setProperty('--board-kept-clear', hasVisual && !isPhone && smallShare > 0 ? `${getKeptClearWidth(width)}px` : '0px');
    right.current?.style.setProperty('--board-kept-clear-top', hasVisual && isPhone && smallShare > 0 ? `${getPhoneKeptClearHeight(width)}px` : '0px');
  });

  const togglePeek = () => {
    if (smallShare === 0 && !peek?.isBig) return;
    if (!peek?.isBig) setPeeksTaken((taken) => taken + 1);
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
          {isBigOverBoard && (
            <span className="board-visual-tip label" data-first-time={peeksTaken === 1}>
              {BOARD_WORK_LABELS.visualPutBackTip}
            </span>
          )}
        </button>
      )}
      <div ref={boardBox} className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
      {footer}
    </section>
  );
}
