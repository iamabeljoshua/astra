import type { ReadoutQuantity, SimulationParameter } from '@astra/contracts';
import { type BoardElement, type BoardState, getAttachedElementId } from '../player/board-state.ts';
import { getMotionValue, type Motion } from '../player/motion.ts';

/** Words a figure shows, which the app keeps with its other strings. */
export interface FigureWords {
  readouts: Record<ReadoutQuantity, { label: string; unit: string }>;
  parameters: Record<SimulationParameter, { label: string; unit: string }>;
  metres: string;
  degrees: string;
}

export interface FigureFrame {
  board: BoardState;
  element: BoardElement;
  atMs: number;
  width: number;
  height: number;
  isReducedMotion: boolean;
  words: FigureWords;
}

/** How far a motion shows. With reduced motion it is at its end from its first moment, so everything shows at once. */
export function getShownValue(motion: Motion, { atMs, isReducedMotion }: Pick<FigureFrame, 'atMs' | 'isReducedMotion'>): number {
  return isReducedMotion ? motion.to : getMotionValue(motion, atMs);
}

export function getDrawnShare(element: BoardElement, frame: Pick<FigureFrame, 'atMs' | 'isReducedMotion'>): number {
  const drawn = getMotionValue(element.entrance, frame.atMs);
  return frame.isReducedMotion && drawn > 0 ? 1 : drawn;
}

/** Everything drawn on a figure, in the order it arrived, including what hangs on those. */
export function getAttachedElements(board: BoardState, rootId: string): BoardElement[] {
  const family = new Set([rootId]);
  const attached: BoardElement[] = [];
  for (const element of board.elements.values()) {
    const parent = getAttachedElementId(element);
    if (parent !== null && family.has(parent)) {
      family.add(element.id);
      attached.push(element);
    }
  }
  return attached;
}
