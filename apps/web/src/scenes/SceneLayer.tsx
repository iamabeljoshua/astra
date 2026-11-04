import { type BoardElement, type BoardState, getMotionValue, getSceneFrame, type TakeFrame } from '@astra/board';
import { useLayoutEffect } from 'react';
import { SCENE_LABELS } from '../strings';
import type { SceneStage } from './sceneStage';

const TAKE_ASPECT_RATIO = 16 / 9;
// The engine's paused controls leave a hairline on the box's first and last rows.
const EDGE_ROWS_CLIP = 'inset(2px 0 2px 0)';

function findScene(board: BoardState): BoardElement | null {
  return [...board.elements.values()].filter((element) => element.content.kind === 'richScene').at(-1) ?? null;
}

interface SceneLayerProps {
  board: BoardState;
  atMs: number;
  stage: SceneStage | null;
  onContainer(container: HTMLElement | null): void;
}

// The stage stays mounted while hidden, because a take is prepared before it shows.
export function SceneLayer({ board, atMs, stage, onContainer }: SceneLayerProps) {
  const element = findScene(board);
  const placed = element ? (getSceneFrame(element, atMs) as TakeFrame | null) : null;
  const frame = placed && stage?.canDraw(placed.sceneId) ? placed : null;
  const opacity = element && frame ? getMotionValue(element.entrance, atMs) : 0;

  useLayoutEffect(() => {
    if (frame) stage?.draw(frame.sceneId, frame.takeSeconds);
  });

  return (
    <div data-testid="scene-layer" data-scene={frame?.sceneId} data-seconds={frame?.takeSeconds.toFixed(3)} aria-hidden={!frame} style={{ opacity }} className={`absolute inset-0 flex flex-col bg-panel ${frame ? '' : 'pointer-events-none'}`}>
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div ref={onContainer} data-testid="scene-take" style={{ aspectRatio: TAKE_ASPECT_RATIO, clipPath: EDGE_ROWS_CLIP }} className="relative max-h-full w-full overflow-hidden" />
      </div>
      <p className="label border-t border-line px-3 py-1.75 text-ink-2">{SCENE_LABELS.notCheckedByPerson}</p>
    </div>
  );
}
