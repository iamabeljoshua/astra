import { type BoardKinds, findMathSpans, getBoardAfter, type SceneCommand } from '@astra/contracts';
import { canRenderTex } from '@astra/board/tex-check';
import type { CommandVerdict } from './beat-text-reader.ts';
import { checkClaimedMath, type MathVerdict } from './check-math.ts';

export interface BoardMemory {
  kinds: BoardKinds;
  lines: ReadonlyMap<string, string>;
  /** Lines written only to look at, which no later line can follow from. */
  shownLines: ReadonlySet<string>;
  lastAssertedLine: string | null;
}

export const EMPTY_BOARD: BoardMemory = { kinds: new Map(), lines: new Map(), shownLines: new Set(), lastAssertedLine: null };

export const DRAWN_KINDS: ReadonlySet<SceneCommand['kind']> = new Set(['writeMath', 'transformMath', 'highlight', 'text', 'hide', 'clearBoard', 'focus', 'simulate', 'runSimulation', 'vector', 'annotate']);

/** A long run of combining marks can crash a Chrome tab, and passes both the parser and KaTeX. */
const TOO_MANY_MARKS = /\p{M}{5,}/u;
const hasTooManyMarksInARow = (text: string) => TOO_MANY_MARKS.test(text);

const ok: CommandVerdict = { ok: true };
const refuse = (problem: string): CommandVerdict => ({ ok: false, problem, isWrongMath: false });

function toVerdict(verdict: MathVerdict): CommandVerdict {
  return verdict.status === 'wrong' ? { ok: false, problem: verdict.why, isWrongMath: true } : ok;
}

const getLineBefore = (command: SceneCommand & { kind: 'writeMath' | 'transformMath' }, { lines, shownLines, lastAssertedLine }: BoardMemory) => {
  if (command.kind === 'writeMath') return lastAssertedLine === null ? undefined : lines.get(lastAssertedLine);
  return shownLines.has(command.target) ? undefined : lines.get(command.target);
};

export function checkAgainstBoard(command: SceneCommand, memory: BoardMemory): CommandVerdict {
  const { lines } = memory;
  if (hasTooManyMarksInARow(JSON.stringify(command))) return refuse('too many combining marks in a row');
  if (!DRAWN_KINDS.has(command.kind)) return refuse(`the board cannot draw ${command.kind} yet`);
  if (command.kind === 'writeMath' || command.kind === 'transformMath') {
    if (!canRenderTex(command.tex)) return refuse(`the math cannot be set: ${command.tex}`);
    return toVerdict(checkClaimedMath(command.claim, getLineBefore(command, memory), command.tex));
  }
  // A tick says the line is right, whatever claim it was written with.
  if (command.kind === 'annotate' && command.mark === 'check') {
    const line = lines.get(command.target);
    const verdict = line === undefined ? null : checkClaimedMath('new', undefined, line);
    if (verdict?.status === 'wrong') return { ok: false, problem: `a tick on ${line}, which is false: ${verdict.why}`, isWrongMath: true };
  }
  if (command.kind === 'highlight' && command.tex !== undefined) {
    const line = lines.get(command.target);
    if (line !== undefined && findMathSpans(line, command.tex).length === 0) return refuse(`${command.tex} is not on line ${command.target}`);
  }
  return ok;
}

export function getMemoryAfter(command: SceneCommand, memory: BoardMemory): BoardMemory {
  const kinds = getBoardAfter(command, memory.kinds);
  if (command.kind === 'clearBoard') return { ...EMPTY_BOARD, kinds };
  const lines = new Map(memory.lines);
  const shownLines = new Set(memory.shownLines);
  let { lastAssertedLine } = memory;
  if (command.kind === 'hide') {
    lines.delete(command.target);
    shownLines.delete(command.target);
  }
  if (command.kind === 'writeMath' || command.kind === 'transformMath') {
    const lineId = command.kind === 'writeMath' ? command.id : command.target;
    lines.set(lineId, command.tex);
    if (command.claim === 'shown') {
      shownLines.add(lineId);
    } else {
      shownLines.delete(lineId);
      lastAssertedLine = lineId;
    }
  }
  return { kinds, lines, shownLines, lastAssertedLine };
}
