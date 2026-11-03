import { type BoardElement, type BoardState, getMotionValue, getSceneFrame, type ProjectileFrame } from '@astra/board';
import { useLayoutEffect, useRef } from 'react';

const WORLD = { left: -1, right: 9, top: 6, bottom: -0.5 };
const PATH_STEPS = 40;
const VECTOR_LENGTHS = { short: 0.8, medium: 1.3, long: 1.9 };
const STROKE = 0.04;
const BALL_RADIUS = 0.14;

/** Metres, up from the ground, to the drawing's own units. A camera would make this a function of the clock. */
const toX = (metres: number) => metres - WORLD.left;
const toY = (metres: number) => WORLD.top - metres;

interface BoardViewProps {
  board: BoardState;
  atMs: number;
  onElementDrawn?(id: string): void;
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
        if (content.kind === 'annotate') return <circle key={element.id} cx={toX(x)} cy={toY(y)} r={BALL_RADIUS * 3 * drawn} fill="none" stroke="var(--color-ink)" strokeWidth={STROKE} />;
        return null;
      })}
      <circle cx={toX(x)} cy={toY(y)} r={BALL_RADIUS} fill="var(--color-ink)" />
      {board.focus?.endsWith('.ball') ? <circle cx={toX(x)} cy={toY(y) - 0.4} r={BALL_RADIUS / 2} fill="var(--color-ink-2)" /> : null}
    </>
  );
}

const LINE_KINDS = new Set(['text', 'writeMath', 'highlight']);

function getLineText(element: BoardElement): string {
  const { content } = element;
  if (content.kind === 'writeMath') return content.tex;
  if (content.kind === 'text') return content.text;
  if (content.kind === 'highlight') return content.tex ?? '';
  return '';
}

// A plain stand-in for the renderers M3.3 to M3.5 own. Every value it draws is read from the board at this moment, so it holds no state of its own.
export function BoardView({ board, atMs, onElementDrawn }: BoardViewProps) {
  const seen = useRef(new Set<string>());
  useLayoutEffect(() => {
    for (const id of board.elements.keys()) {
      if (!seen.current.has(id)) {
        seen.current.add(id);
        onElementDrawn?.(id);
      }
    }
  });
  const lines = [...board.elements.values()].filter((element) => LINE_KINDS.has(element.content.kind));
  return (
    <div data-testid="board" className="relative h-full min-h-[320px] overflow-hidden rounded border border-line bg-panel">
      <div className="absolute top-4 left-4 flex flex-col gap-1 text-lead text-ink">
        {lines.map((element) => (
          <p key={element.id} data-element={element.id} style={{ opacity: getMotionValue(element.entrance, atMs) }} className={element.content.kind === 'writeMath' ? 'font-voice' : undefined}>
            {getLineText(element)}
          </p>
        ))}
      </div>
      <svg data-testid="scene" viewBox={`0 0 ${WORLD.right - WORLD.left} ${WORLD.top - WORLD.bottom}`} className="absolute inset-0 h-full w-full">
        <line x1={0} y1={toY(0)} x2={WORLD.right - WORLD.left} y2={toY(0)} stroke="var(--color-line)" strokeWidth={STROKE} />
        <WorldMarks board={board} atMs={atMs} />
      </svg>
    </div>
  );
}
