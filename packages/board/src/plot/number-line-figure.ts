import type { MarkValue, NumberLine } from '@astra/contracts';
import { type FigureFrame, getAttachedElements, getDrawnShare, getPartMark, keepNewestOnFigure } from '../figure/figure-input.ts';
import { addLabel, createFigureDraft, type FigureDraft, finishFigure } from '../figure/figure-draft.ts';
import { type FigureMark, getLeadingShare, type Point } from '../figure/figure-marks.ts';
import type { BoardElement } from '../player/board-state.ts';
import { formatNumber, formatTick, getTickValues } from './axis-ticks.ts';

export const NUMBER_LINE_HEIGHT = 74;

const LINE = { margin: 18, y: 38, tickLength: 5, tickSpacing: 56, dotRadius: 5, labelGap: 8 };

function addValueMark(draft: FigureDraft, mark: BoardElement & { content: MarkValue }, { at, frame }: { at: Point; frame: FigureFrame }): void {
  const share = getDrawnShare(mark, frame);
  draft.marks.push({ kind: 'dot', key: `mark-${mark.id}`, at, radius: LINE.dotRadius * share, tone: 'ink' });
  if (share < 1) return;
  const value = formatNumber(mark.content.at, 4);
  addLabel(draft, { key: `label-${mark.id}`, text: mark.content.label ? `${mark.content.label} ${value}` : value, anchor: at, gap: LINE.labelGap, sides: ['above', 'above-right', 'above-left', 'right', 'left'] });
}

export function getNumberLineMarks(frame: FigureFrame): FigureMark[] {
  const { element, width, height } = frame;
  const { domain } = element.content as NumberLine;
  const draft = createFigureDraft(width, height);
  const share = getDrawnShare(element, frame);
  const left = LINE.margin;
  const right = width - LINE.margin;
  const toX = (value: number) => left + ((value - domain[0]) / (domain[1] - domain[0])) * (right - left);
  draft.marks.push({ kind: 'path', key: 'line', tone: 'ink', weight: 'thin', branches: [getLeadingShare([{ x: left, y: LINE.y }, { x: right, y: LINE.y }], share)] });
  const tickCount = Math.max(2, Math.floor((right - left) / LINE.tickSpacing));
  const ticks = getTickValues(domain, tickCount);
  draft.marks.push({ kind: 'path', key: 'x-ticks', tone: 'ink-2', weight: 'hair', branches: share < 1 ? [] : ticks.map((value) => [{ x: toX(value), y: LINE.y - LINE.tickLength }, { x: toX(value), y: LINE.y + LINE.tickLength }]) });
  if (share >= 1) for (const value of ticks) draft.ticks.push({ key: `tick-x-${value}`, text: formatTick(value, domain, tickCount), anchor: { x: toX(value), y: LINE.y + LINE.tickLength }, gap: 2, sides: ['below'], tone: 'ink-2', isOptional: true, isFixed: true });
  const toPoint = (at: number) => ({ x: toX(at), y: LINE.y });
  for (const mark of keepNewestOnFigure(getAttachedElements(frame.board, element.id))) {
    if (getPartMark(mark)) frame.onMarkWithoutPart?.(mark);
    if (mark.content.kind !== 'markValue') continue;
    if (mark.content.at < domain[0] || mark.content.at > domain[1]) {
      frame.onMarkWithoutPart?.(mark);
      continue;
    }
    frame.onMarkDrawn?.(mark);
    addValueMark(draft, mark as BoardElement & { content: MarkValue }, { at: toPoint(mark.content.at), frame });
  }
  return finishFigure(draft, frame.onLabelWithoutRoom);
}
