import { getMotionValue } from '@astra/board';
import { type BlockPainter, createCodePainter, createTablePainter, createTimelinePainter, writeStyle } from '@astra/board/drawing';
import type { CodeBlock, Table, Timeline } from '@astra/contracts';
import type { BoardItem, ItemContext } from './boardItems';

function getReachedStep({ element, atMs, progress }: ItemContext, stepCount: number): number {
  return element.revealedUpTo ? getMotionValue(element.revealedUpTo, atMs) : progress * stepCount;
}

function createBlockItem(wrapper: HTMLElement, painter: BlockPainter): BoardItem {
  return {
    prepare({ maxWidth }) {
      writeStyle(wrapper, 'maxWidth', `${maxWidth}px`);
      return { fit: 'line', size: { width: wrapper.offsetWidth, height: wrapper.offsetHeight }, fromSize: null };
    },
    paint: (context) => painter.paint(getReachedStep(context, painter.stepCount), context.isReducedMotion),
    // A header or a frame waits with the rows, so it cannot rise from below the board while the board makes room.
    getEntranceOpacity: ({ progress }) => (progress > 0 ? 1 : 0),
    getTermBoxes: (query) => painter.getTermBoxes(query),
    getTextPx: () => painter.getTextPx(),
    remove: () => painter.remove(),
  };
}

export const createTableItem = (wrapper: HTMLElement, content: Table) => createBlockItem(wrapper, createTablePainter(wrapper, content));

export const createTimelineItem = (wrapper: HTMLElement, content: Timeline) => createBlockItem(wrapper, createTimelinePainter(wrapper, content));

export const createCodeItem = (wrapper: HTMLElement, content: CodeBlock) => createBlockItem(wrapper, createCodePainter(wrapper, content));
