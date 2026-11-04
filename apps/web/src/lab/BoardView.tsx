import { type BoardElement, type BoardState, type SliderMove } from '@astra/board';
import { canWriteByHand, preloadMathFonts } from '@astra/board/drawing';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { hasOwnPlace } from '../board/boardItems';
import { createBoardPainting } from '../board/boardPainting';
import { useReducedMotion } from '../board/useReducedMotion';

interface BoardViewProps {
  board: BoardState;
  atMs: number;
  onElementDrawn?(id: string): void;
  onMathRefused?(tex: string): void;
  /** A student's drag. With no listener, as in a replay, a slider shows its value and cannot be moved. */
  onSliderMove?(move: SliderMove): void;
  onSliderRelease?(): void;
}

function getWrapperKey(element: BoardElement): string {
  return `${element.id}:${element.content.kind}`;
}

function ElementContent({ element }: { element: BoardElement }) {
  const { content } = element;
  if (content.kind === 'text' && !(content.handwritten && canWriteByHand(content.text))) return <p className="wrap-anywhere text-lead">{content.text}</p>;
  return null;
}

export function BoardView({ board, atMs, onElementDrawn, onMathRefused, onSliderMove, onSliderRelease }: BoardViewProps) {
  const seen = useRef(new Set<string>());
  const boardRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<SVGSVGElement>(null);
  const wrappers = useRef(new Map<string, HTMLElement>());
  const painting = useRef<ReturnType<typeof createBoardPainting> | null>(null);
  const isReducedMotion = useReducedMotion();
  const refusalListener = useRef(onMathRefused);
  const sliderMoveListener = useRef(onSliderMove);
  const sliderReleaseListener = useRef(onSliderRelease);

  useEffect(() => {
    void preloadMathFonts();
  }, []);

  useLayoutEffect(() => {
    refusalListener.current = onMathRefused;
    sliderMoveListener.current = onSliderMove;
    sliderReleaseListener.current = onSliderRelease;
    if (!boardRef.current || !overlayRef.current) return;
    painting.current ??= createBoardPainting({ boardElement: boardRef.current, overlay: overlayRef.current, getWrapper: (id) => wrappers.current.get(id), onMathRefused: (tex) => refusalListener.current?.(tex), onSliderMove: (move) => sliderMoveListener.current?.(move), onSliderRelease: () => sliderReleaseListener.current?.() });
    painting.current.paint({ board, atMs, isReducedMotion, canMoveSliders: onSliderMove !== undefined });
    for (const id of board.elements.keys()) {
      if (!seen.current.has(id)) {
        seen.current.add(id);
        onElementDrawn?.(id);
      }
    }
  });

  const placed = [...board.elements.values()].filter((element) => hasOwnPlace(element.content));
  return (
    <div ref={boardRef} data-testid="board" className="relative h-full min-h-[320px] overflow-hidden border border-line bg-panel text-board text-ink">
      {placed.map((element) => (
        <div
          key={getWrapperKey(element)}
          data-element={element.id}
          className="absolute top-0 left-0 w-max origin-top-left"
          ref={(wrapper) => {
            if (wrapper) wrappers.current.set(element.id, wrapper);
            else wrappers.current.delete(element.id);
          }}
        >
          <ElementContent element={element} />
        </div>
      ))}
      <svg ref={overlayRef} className="board-ink board-marks pointer-events-none absolute inset-0 h-full w-full" />
    </div>
  );
}
