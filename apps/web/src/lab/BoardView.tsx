import { type BoardElement, type BoardState, getMotionValue, getSceneFrame, type ProjectileFrame } from '@astra/board';
import { canWriteByHand, preloadMathFonts } from '@astra/board/drawing';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { FIGURE_SIZE, hasOwnPlace } from '../board/boardItems';
import { type BoardProblem, createBoardPainting } from '../board/boardPainting';
import { useReducedMotion } from '../board/useReducedMotion';

const WORLD = { left: -1, right: 9, top: 6, bottom: -0.5 };
const PATH_STEPS = 40;
const VECTOR_LENGTHS = { short: 0.8, medium: 1.3, long: 1.9 };
const STROKE = 0.04;
const BALL_RADIUS = 0.14;

const toX = (metres: number) => metres - WORLD.left;
const toY = (metres: number) => WORLD.top - metres;

interface BoardViewProps {
  board: BoardState;
  atMs: number;
  onElementDrawn?(id: string): void;
  onMathRefused?(tex: string): void;
  onBoardProblem?(problem: BoardProblem): void;
}

function getBallFrame(board: BoardState, atMs: number): ProjectileFrame | null {
  for (const element of board.elements.values()) {
    if (element.content.kind === 'simulate') return getSceneFrame(element, atMs) as ProjectileFrame;
  }
  return null;
}

function ScenePath({ element }: { element: BoardElement }) {
  const scene = element.placedScene?.scene;
  if (!scene) return null;
  const points = Array.from({ length: PATH_STEPS + 1 }, (_, step) => (scene.getFrame((step / PATH_STEPS) * scene.durationSeconds) as ProjectileFrame).ball);
  return <polyline points={points.map(({ x, y }) => `${toX(x)},${toY(y)}`).join(' ')} fill="none" stroke="var(--color-line)" strokeWidth={STROKE} />;
}

const isOnScene = (target: string) => target.endsWith('.ball');

function WorldMarks({ board, atMs }: { board: BoardState; atMs: number }) {
  const ball = getBallFrame(board, atMs);
  if (!ball) return null;
  const { x, y } = ball.ball;
  return (
    <>
      {[...board.elements.values()].map((element) => {
        const { content } = element;
        const drawn = getMotionValue(element.entrance, atMs);
        if (content.kind === 'simulate') return <ScenePath key={element.id} element={element} />;
        if (content.kind === 'vector') {
          const angle = (content.angleDegrees * Math.PI) / 180;
          const length = VECTOR_LENGTHS[content.length] * drawn;
          return <line key={element.id} x1={toX(x)} y1={toY(y)} x2={toX(x) + Math.cos(angle) * length} y2={toY(y) - Math.sin(angle) * length} stroke="var(--color-ink)" strokeWidth={STROKE} />;
        }
        if (content.kind === 'annotate' && isOnScene(content.target)) return <circle key={element.id} cx={toX(x)} cy={toY(y)} r={BALL_RADIUS * 3 * drawn} fill="none" stroke="var(--color-ink)" strokeWidth={STROKE} />;
        return null;
      })}
      <circle cx={toX(x)} cy={toY(y)} r={BALL_RADIUS} fill="var(--color-ink)" />
      {board.focus?.endsWith('.ball') ? <circle cx={toX(x)} cy={toY(y) - 0.4} r={BALL_RADIUS / 2} fill="var(--color-ink-2)" /> : null}
    </>
  );
}

function SceneStage({ board, atMs }: { board: BoardState; atMs: number }) {
  return (
    <svg data-testid="scene" viewBox={`0 0 ${WORLD.right - WORLD.left} ${WORLD.top - WORLD.bottom}`} width={FIGURE_SIZE.width} height={FIGURE_SIZE.height}>
      <line x1={0} y1={toY(0)} x2={WORLD.right - WORLD.left} y2={toY(0)} stroke="var(--color-line)" strokeWidth={STROKE} />
      <WorldMarks board={board} atMs={atMs} />
    </svg>
  );
}

function getWrapperKey(element: BoardElement): string {
  return `${element.id}:${element.content.kind}`;
}

function ElementContent({ element, board, atMs }: { element: BoardElement; board: BoardState; atMs: number }) {
  const { content } = element;
  if (content.kind === 'simulate') return <SceneStage board={board} atMs={atMs} />;
  if (content.kind === 'text' && !(content.handwritten && canWriteByHand(content.text))) return <p className="wrap-anywhere text-lead">{content.text}</p>;
  return null;
}

export function BoardView({ board, atMs, onElementDrawn, onMathRefused, onBoardProblem }: BoardViewProps) {
  const seen = useRef(new Set<string>());
  const boardRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<SVGSVGElement>(null);
  const wrappers = useRef(new Map<string, HTMLElement>());
  const painting = useRef<ReturnType<typeof createBoardPainting> | null>(null);
  const isReducedMotion = useReducedMotion();
  const refusalListener = useRef(onMathRefused);
  const problemListener = useRef(onBoardProblem);

  useEffect(() => {
    void preloadMathFonts();
  }, []);

  useLayoutEffect(() => {
    refusalListener.current = onMathRefused;
    problemListener.current = onBoardProblem;
    if (!boardRef.current || !overlayRef.current) return;
    painting.current ??= createBoardPainting({ boardElement: boardRef.current, overlay: overlayRef.current, getWrapper: (id) => wrappers.current.get(id), onMathRefused: (tex) => refusalListener.current?.(tex), onBoardProblem: (problem) => problemListener.current?.(problem) });
    painting.current.paint({ board, atMs, isReducedMotion });
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
          <ElementContent element={element} board={board} atMs={atMs} />
        </div>
      ))}
      <svg ref={overlayRef} aria-hidden="true" className="board-ink board-marks pointer-events-none absolute inset-0 h-full w-full" />
    </div>
  );
}
