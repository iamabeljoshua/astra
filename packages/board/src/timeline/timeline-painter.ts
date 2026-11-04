/// <reference lib="dom" />
import type { Timeline } from '@astra/contracts';
import { type BlockPainter, getPartBoxes, makeTextElement, paintSteps } from '../block/block-steps.ts';

export function createTimelinePainter(root: HTMLElement, { events }: Pick<Timeline, 'events'>): BlockPainter {
  const list = document.createElement('ol');
  list.className = 'board-timeline';
  const parts = new Map<string, Element>();
  const eventElements = events.map(({ when, label }, index) => {
    const event = document.createElement('li');
    event.className = 'board-timeline-event';
    event.append(makeTextElement('span', 'board-timeline-when', when), makeTextElement('span', 'board-timeline-label', label));
    parts.set(`event-${index + 1}`, event);
    return event;
  });
  list.append(...eventElements);
  root.append(list);
  return {
    stepCount: events.length,
    paint: (reached, isReducedMotion) => paintSteps(eventElements, reached, isReducedMotion),
    getTermBoxes: (query) => getPartBoxes(root, parts, query),
    getTextPx: () => Number.parseFloat(getComputedStyle(list).fontSize),
    remove: () => list.remove(),
  };
}
