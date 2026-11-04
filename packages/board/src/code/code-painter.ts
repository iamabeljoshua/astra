/// <reference lib="dom" />
import type { CodeBlock } from '@astra/contracts';
import { type BlockPainter, getPartBoxes, paintSteps } from '../block/block-steps.ts';

const makeSpan = (className: string, text: string) => {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
};

function makeLine(source: string, number: number): HTMLElement {
  const line = document.createElement('div');
  line.className = 'board-code-line';
  const shownNumber = makeSpan('board-code-number', String(number));
  shownNumber.setAttribute('aria-hidden', 'true');
  const text = makeSpan('board-code-source', source === '' ? ' ' : source);
  text.dir = 'ltr';
  line.append(shownNumber, text);
  return line;
}

export function createCodePainter(root: HTMLElement, { language, source }: Pick<CodeBlock, 'language' | 'source'>): BlockPainter {
  const figure = document.createElement('figure');
  figure.className = 'board-code';
  const caption = document.createElement('figcaption');
  caption.textContent = language;
  const lines = source.replace(/\n$/, '').split('\n').map((text, index) => makeLine(text, index + 1));
  const body = document.createElement('div');
  body.className = 'board-code-body';
  body.append(...lines);
  figure.append(caption, body);
  root.append(figure);
  const parts = new Map(lines.map((line, index) => [`line-${index + 1}`, line]));
  return {
    stepCount: lines.length,
    paint: (reached, isReducedMotion) => paintSteps(lines, reached, isReducedMotion),
    getTermBoxes: (query) => getPartBoxes(root, parts, query),
    getTextPx: () => Number.parseFloat(getComputedStyle(caption).fontSize),
    remove: () => figure.remove(),
  };
}
