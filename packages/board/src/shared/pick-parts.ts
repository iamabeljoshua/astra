import { getMathParts } from '@astra/contracts';
import type { TermQuery } from '../math/math-painter.ts';
import type { BoardElement } from '../player/board-state.ts';

export interface PickPart {
  part: string;
  query: TermQuery;
}

function getMathPickParts(tex: string): PickPart[] {
  const seen = new Map<string, number>();
  return getMathParts(tex).flatMap((mathPart) => {
    if (mathPart.role !== 'term') return [];
    const part = mathPart.tex.replace(/\s/g, '');
    const occurrence = seen.get(part) ?? 0;
    seen.set(part, occurrence + 1);
    return [{ part, query: { tex: part, occurrence } }];
  });
}

/** What a student can pick on an element: the terms of a math line, or the nodes of a diagram. */
export function getPickParts(element: BoardElement | undefined): PickPart[] {
  if (element?.math) return getMathPickParts(element.math.tex);
  if (element?.content.kind !== 'diagram') return [];
  return element.content.nodes.map(({ name }) => ({ part: name, query: { termId: name } }));
}
