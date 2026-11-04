import type { AnnotationMark, ReadoutQuantity, SimulationParameter } from '@astra/contracts';
import { type BoardElement, type BoardState, getAttachedElementId } from '../player/board-state.ts';
import { getMotionValue, type Motion } from '../player/motion.ts';

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
  onLabelWithoutRoom?(text: string): void;
  onMarkWithoutPart?(mark: BoardElement): void;
}

/** A mark's mark and label, whichever command made it, for a figure that draws marks on its parts. */
export function getPartMark(element: BoardElement): { mark: AnnotationMark; label?: string } | null {
  const { content } = element;
  if (content.kind === 'annotate' && content.target.includes('.')) return { mark: content.mark, label: content.label };
  return content.kind === 'highlight' && content.target.includes('.') ? { mark: 'circle' } : null;
}

export function getShownValue(motion: Motion, { atMs, isReducedMotion }: Pick<FigureFrame, 'atMs' | 'isReducedMotion'>): number {
  return isReducedMotion ? motion.to : getMotionValue(motion, atMs);
}

export function getDrawnShare(element: BoardElement, frame: Pick<FigureFrame, 'atMs' | 'isReducedMotion'>): number {
  const drawn = getMotionValue(element.entrance, frame.atMs);
  return frame.isReducedMotion && drawn > 0 ? 1 : drawn;
}

export const FIGURE_LIMITS = { attachments: 64, curves: 8, readoutShareOfHeight: 0.3 };

export function keepNewestOnFigure<Item>(attached: readonly Item[]): readonly Item[] {
  return attached.slice(-FIGURE_LIMITS.attachments);
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
