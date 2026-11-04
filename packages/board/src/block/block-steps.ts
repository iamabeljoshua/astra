/// <reference lib="dom" />
import type { TermBoxes, TermQuery } from '../math/math-painter.ts';
import { writeStyle } from '../style-writer.ts';

/** A block of real HTML text that fills in steps: a table's rows, a timeline's events, or a code block's lines. */
export interface BlockPainter {
  stepCount: number;
  fitTo?(maxWidth: number): void;
  paint(reached: number, isReducedMotion: boolean): void;
  getTermBoxes(query: TermQuery): TermBoxes;
  getTextPx(): number;
  remove(): void;
}

const NO_OFFSET = { x: 0, y: 0 };

export function paintSteps(steps: readonly HTMLElement[], reached: number, isReducedMotion: boolean): void {
  steps.forEach((step, index) => {
    const drawn = Math.min(1, Math.max(0, reached - index));
    const shown = isReducedMotion && drawn > 0 ? 1 : drawn;
    writeStyle(step, 'visibility', shown === 0 ? 'hidden' : '');
    writeStyle(step, 'opacity', shown > 0 && shown < 1 ? shown.toFixed(3) : '');
  });
}

function getBoxInside(root: HTMLElement, element: Element) {
  const rootBox = root.getBoundingClientRect();
  const box = element.getBoundingClientRect();
  const scale = root.offsetWidth > 0 ? rootBox.width / root.offsetWidth : 1;
  return { x: (box.left - rootBox.left) / scale, y: (box.top - rootBox.top) / scale, width: box.width / scale, height: box.height / scale };
}

export function getPartBoxes(root: HTMLElement, parts: ReadonlyMap<string, Element>, query: TermQuery): TermBoxes {
  const part = query !== null && 'termId' in query ? parts.get(query.termId) : undefined;
  if (query === null) return { from: null, to: getBoxInside(root, root), flightOffset: NO_OFFSET };
  return { from: null, to: part ? getBoxInside(root, part) : null, flightOffset: NO_OFFSET };
}

export function makeTextElement<Tag extends keyof HTMLElementTagNameMap>(tag: Tag, className: string, text: string): HTMLElementTagNameMap[Tag] {
  const element = document.createElement(tag);
  element.className = className;
  element.dir = 'auto';
  element.textContent = text;
  return element;
}
