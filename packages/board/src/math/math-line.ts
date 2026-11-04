import { getMathParts, getTexTokens, type MathPart } from '@astra/contracts';

/** A top-level part of an equation. Its id stays with it through every rearrangement, so later commands and a student's click can name it. */
export interface MathTerm extends MathPart {
  id: string;
}

export interface MathLine {
  tex: string;
  terms: readonly MathTerm[];
  /** The next id to hand out, so an id is never reused within an element. */
  nextTermNumber: number;
}

const getTermKey = (tex: string) => getTexTokens(tex).map((token) => token.text).join(' ');

const makeTermId = (number: number) => `t${number}`;

export function startMathLine(tex: string): MathLine {
  const terms = getMathParts(tex).map((part, index) => ({ ...part, id: makeTermId(index + 1) }));
  return { tex, terms, nextTermNumber: terms.length + 1 };
}

function getLongestCommonRun(before: readonly string[], after: readonly string[]): number[][] {
  const lengths = Array.from({ length: before.length + 1 }, () => new Array<number>(after.length + 1).fill(0));
  for (let row = before.length - 1; row >= 0; row -= 1) {
    for (let column = after.length - 1; column >= 0; column -= 1) {
      const lengthsAbove = lengths[row + 1] as number[];
      const here = lengths[row] as number[];
      here[column] = before[row] === after[column] ? (lengthsAbove[column + 1] as number) + 1 : Math.max(lengthsAbove[column] as number, here[column + 1] as number);
    }
  }
  return lengths;
}

function matchInOrder(before: readonly string[], after: readonly string[]): Map<number, number> {
  const lengths = getLongestCommonRun(before, after);
  const matches = new Map<number, number>();
  let row = 0;
  let column = 0;
  while (row < before.length && column < after.length) {
    if (before[row] === after[column]) {
      matches.set(column, row);
      row += 1;
      column += 1;
    } else if ((lengths[row + 1]?.[column] as number) >= (lengths[row]?.[column + 1] as number)) {
      row += 1;
    } else {
      column += 1;
    }
  }
  return matches;
}

function matchMoved(before: readonly string[], after: readonly string[], matches: Map<number, number>): void {
  const taken = new Set(matches.values());
  after.forEach((key, column) => {
    if (matches.has(column)) return;
    const row = before.findIndex((beforeKey, index) => beforeKey === key && !taken.has(index));
    if (row === -1) return;
    matches.set(column, row);
    taken.add(row);
  });
}

// Terms that keep their order match first, then a term that crossed the equals sign, so "3" in "2x + 3 = 11" is the same "3" in "2x = 11 - 3".
export function transformMathLine(before: MathLine, tex: string): MathLine {
  const parts = getMathParts(tex);
  const beforeKeys = before.terms.map((term) => getTermKey(term.tex));
  const afterKeys = parts.map((part) => getTermKey(part.tex));
  const matches = matchInOrder(beforeKeys, afterKeys);
  matchMoved(beforeKeys, afterKeys, matches);
  let { nextTermNumber } = before;
  const terms = parts.map((part, column): MathTerm => {
    const row = matches.get(column);
    const kept = row === undefined ? undefined : before.terms[row];
    return { ...part, id: kept?.id ?? makeTermId(nextTermNumber++) };
  });
  return { tex, terms, nextTermNumber };
}

/** Terms that left their order, which are the ones that must travel past others. */
export function getMovedTermIds(before: MathLine, after: MathLine): ReadonlySet<string> {
  const afterIds = new Set(after.terms.map((term) => term.id));
  const beforeIds = before.terms.map((term) => term.id).filter((id) => afterIds.has(id));
  const beforeSet = new Set(beforeIds);
  const stayingAfter = after.terms.map((term) => term.id).filter((id) => beforeSet.has(id));
  const inOrder = new Set(matchInOrder(beforeIds, stayingAfter).keys());
  return new Set(stayingAfter.filter((_, column) => !inOrder.has(column)));
}
