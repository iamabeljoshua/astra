import { type BoardElement, type BoardState, type QualityTier, type SliderMove } from '@astra/board';
import { canWriteByHand, preloadMathFonts } from '@astra/board/drawing';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { hasOwnPlace } from '../board/boardItems';
import { type BoardProblem, createBoardPainting } from '../board/boardPainting';
import { useReducedMotion } from '../board/useReducedMotion';

interface BoardViewProps {
  board: BoardState;
  atMs: number;
  onElementDrawn?(id: string): void;
  onMathRefused?(tex: string): void;
  canMoveSliders?: boolean;
  onSliderMove?(move: SliderMove): void;
  onSliderRelease?(): void;
  onBoardProblem?(problem: BoardProblem): void;
  qualityTier?: QualityTier;
  onQualityTier?(tier: QualityTier): void;
}

function getWrapperKey(element: BoardElement): string {
  return `${element.id}:${element.content.kind}`;
}

function ElementContent({ element }: { element: BoardElement }) {
  const { content } = element;
  if (content.kind === 'text' && !(content.handwritten && canWriteByHand(content.text))) return <p dir="auto" className="wrap-anywhere text-lead">{content.text}</p>;
  return null;
}

export function BoardView({ board, atMs, onElementDrawn, onMathRefused, onBoardProblem, canMoveSliders = false, onSliderMove, onSliderRelease, qualityTier, onQualityTier }: BoardViewProps) {
  const seen = useRef(new Set<string>());
  const boardRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<SVGSVGElement>(null);
  const wrappers = useRef(new Map<string, HTMLElement>());
  const painting = useRef<ReturnType<typeof createBoardPainting> | null>(null);
  const isReducedMotion = useReducedMotion();
  const refusalListener = useRef(onMathRefused);
  const problemListener = useRef(onBoardProblem);
  const sliderMoveListener = useRef(onSliderMove);
  const sliderReleaseListener = useRef(onSliderRelease);
  const tierListener = useRef(onQualityTier);

  useEffect(() => {
    void preloadMathFonts();
  }, []);

  useLayoutEffect(() => {
    refusalListener.current = onMathRefused;
    problemListener.current = onBoardProblem;
    sliderMoveListener.current = onSliderMove;
    sliderReleaseListener.current = onSliderRelease;
    tierListener.current = onQualityTier;
    if (!boardRef.current || !overlayRef.current) return;
    painting.current ??= createBoardPainting({ boardElement: boardRef.current, overlay: overlayRef.current, getWrapper: (id) => wrappers.current.get(id), onMathRefused: (tex) => refusalListener.current?.(tex), onBoardProblem: (problem) => problemListener.current?.(problem), onSliderMove: (move) => sliderMoveListener.current?.(move), onSliderRelease: () => sliderReleaseListener.current?.(), onQualityTier: (tier) => tierListener.current?.(tier) });
    painting.current.paint({ board, atMs, isReducedMotion, canMoveSliders, fixedTier: qualityTier });
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
      <svg ref={overlayRef} aria-hidden="true" className="board-ink board-marks pointer-events-none absolute inset-0 h-full w-full" />
    </div>
  );
}
