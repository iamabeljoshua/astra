import type { BoardElement, BoardState } from '@astra/board';
import { hasOwnPlace } from './boardItems';

/** One row of the shared board: what was written, and what sits beside it in the gutter. */
export interface BoardRow {
  element: BoardElement;
  marks: readonly BoardElement[];
  notes: readonly BoardElement[];
  /** A crossed line the student has since put right, which stays to look back at. */
  isStruck: boolean;
}

const getRoot = (target: string) => target.split('.')[0] as string;

const isGutterMark = ({ content }: BoardElement) => content.kind === 'annotate' && (content.mark === 'check' || content.mark === 'cross') && !content.target.includes('.');

export const isInGutter = (element: BoardElement) => isGutterMark(element) || element.content.kind === 'note';

const getTargetOf = ({ content }: BoardElement) => ('target' in content ? getRoot(content.target) : '');

const isCross = ({ content }: BoardElement) => content.kind === 'annotate' && content.mark === 'cross';

const isRightLine = ({ content }: BoardElement) => content.kind === 'studentLine' && content.verdict.status === 'right';

/** Reads the rows from the board, so a live board and a replay cannot disagree. */
export function getBoardRows(board: BoardState): BoardRow[] {
  const elements = [...board.elements.values()];
  const inGutter = elements.filter(isInGutter);
  const placed = elements.filter((element) => hasOwnPlace(element.content));
  return placed.map((element, index) => {
    const beside = inGutter.filter((item) => getTargetOf(item) === element.id);
    const marks = beside.filter(isGutterMark);
    return { element, marks, notes: beside.filter(({ content }) => content.kind === 'note'), isStruck: marks.some(isCross) && placed.slice(index + 1).some(isRightLine) };
  });
}
