import type { BoardElement, BoardState } from '@astra/board';
import { getInkLineId } from '@astra/contracts';
import { hasOwnPlace } from './boardItems';

export interface BoardRow {
  element: BoardElement;
  marks: readonly BoardElement[];
  notes: readonly BoardElement[];
  isStruck: boolean;
  inks: readonly BoardElement[];
  isBeingRead: boolean;
}

const getRoot = (target: string) => target.split('.')[0] as string;

const isGutterMark = ({ content }: BoardElement) => content.kind === 'annotate' && (content.mark === 'check' || content.mark === 'cross') && !content.target.includes('.');

export const isInGutter = (element: BoardElement) => isGutterMark(element) || element.content.kind === 'note';

const getTargetOf = ({ content }: BoardElement) => ('target' in content ? getRoot(content.target) : '');

const getMarkName = ({ content }: BoardElement) => (content.kind === 'annotate' ? content.mark : null);

const isCross = ({ content }: BoardElement) => content.kind === 'annotate' && content.mark === 'cross';

const isRightLine = ({ content }: BoardElement) => content.kind === 'studentLine' && content.verdict.status === 'right';

export function getBoardRows(board: BoardState): BoardRow[] {
  const elements = [...board.elements.values()];
  const inGutter = elements.filter(isInGutter);
  const placed = elements.filter((element) => hasOwnPlace(element.content));
  const inks = elements.filter(({ content }) => content.kind === 'ink');
  const rows = placed.map((element, index): BoardRow => {
    const beside = inGutter.filter((item) => getTargetOf(item) === element.id);
    const marks = beside.filter(isGutterMark).filter((mark, markIndex, all) => all.findIndex((other) => getMarkName(other) === getMarkName(mark)) === markIndex);
    return { element, marks, notes: beside.filter(({ content }) => content.kind === 'note'), isStruck: marks.some(isCross) && placed.slice(index + 1).some(isRightLine), inks: inks.filter((ink) => getInkLineId(ink.id) === element.id), isBeingRead: false };
  });
  return [...rows, ...getRowsBeingRead(inks, new Set(placed.map((element) => element.id as string)))];
}

function getRowsBeingRead(inks: readonly BoardElement[], lineIds: ReadonlySet<string>): BoardRow[] {
  const waiting = new Map<string, BoardElement[]>();
  for (const ink of inks) {
    const lineId = getInkLineId(ink.id);
    if (lineId && !lineIds.has(lineId)) waiting.set(lineId, [...(waiting.get(lineId) ?? []), ink]);
  }
  return [...waiting.values()].map((group) => ({ element: group[0] as BoardElement, marks: [], notes: [], isStruck: false, inks: group, isBeingRead: true }));
}
