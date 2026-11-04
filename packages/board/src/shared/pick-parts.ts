import { findMathSpans, getMathParts } from '@astra/contracts';
import type { TermQuery } from '../math/math-painter.ts';
import type { BoardElement } from '../player/board-state.ts';

export interface PickPart {
  part: string;
  query: TermQuery;
}

const SIGNS: ReadonlySet<string> = new Set(['+', '-']);

// A term carries its sign, as the prototype's do, so `+3` is one thing to click and to ring.
export function getMathPickParts(tex: string): PickPart[] {
  const mathParts = getMathParts(tex);
  return mathParts.flatMap((mathPart, index) => {
    if (mathPart.role !== 'term') return [];
    const before = mathParts[index - 1];
    const start = before && SIGNS.has(before.tex) ? before.start : mathPart.start;
    const source = tex.slice(start, mathPart.end);
    const occurrence = findMathSpans(tex, source).findIndex((span) => span.start === start);
    return [{ part: source.replace(/\s/g, ''), query: { tex: source, occurrence: Math.max(0, occurrence) } }];
  });
}

export function getPickParts(element: BoardElement | undefined): PickPart[] {
  if (element?.math) return getMathPickParts(element.math.tex);
  if (element?.content.kind !== 'diagram') return [];
  return element.content.nodes.map(({ name }) => ({ part: name, query: { termId: name } }));
}
