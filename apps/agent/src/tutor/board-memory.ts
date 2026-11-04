import { type BoardKinds, findMathSpans, getBoardAfter, type SceneCommand } from '@astra/contracts';
import { canRenderTex } from '@astra/board/tex-check';
import type { CommandVerdict } from './beat-text-reader.ts';
import { checkMathLine, checkMathStep, type MathVerdict } from '@astra/board/shared';

export interface BoardMemory {
  kinds: BoardKinds;
  lines: ReadonlyMap<string, string>;
}

export const EMPTY_BOARD: BoardMemory = { kinds: new Map(), lines: new Map() };

export const DRAWN_KINDS: ReadonlySet<SceneCommand['kind']> = new Set(['writeMath', 'transformMath', 'highlight', 'text', 'hide', 'clearBoard', 'focus', 'simulate', 'runSimulation', 'vector', 'annotate']);

/** A long run of combining marks can crash a Chrome tab, and passes both the parser and KaTeX. */
const TOO_MANY_MARKS = /\p{M}{5,}/u;
const hasTooManyMarksInARow = (text: string) => TOO_MANY_MARKS.test(text);

const ok: CommandVerdict = { ok: true };
const refuse = (problem: string): CommandVerdict => ({ ok: false, problem, isWrongMath: false });

function toVerdict(verdict: MathVerdict): CommandVerdict {
  return verdict.status === 'wrong' ? { ok: false, problem: verdict.why, isWrongMath: true } : ok;
}

export function checkAgainstBoard(command: SceneCommand, { lines }: BoardMemory): CommandVerdict {
  if (hasTooManyMarksInARow(JSON.stringify(command))) return refuse('too many combining marks in a row');
  if (!DRAWN_KINDS.has(command.kind)) return refuse(`the board cannot draw ${command.kind} yet`);
  if (command.kind === 'writeMath' || command.kind === 'transformMath') {
    if (!canRenderTex(command.tex)) return refuse(`the math cannot be set: ${command.tex}`);
    const before = command.kind === 'transformMath' ? lines.get(command.target) : undefined;
    return toVerdict(before === undefined ? checkMathLine(command.tex) : checkMathStep(before, command.tex));
  }
  if (command.kind === 'highlight' && command.tex !== undefined) {
    const line = lines.get(command.target);
    if (line !== undefined && findMathSpans(line, command.tex).length === 0) return refuse(`${command.tex} is not on line ${command.target}`);
  }
  return ok;
}

function getLinesAfter(command: SceneCommand, lines: ReadonlyMap<string, string>): ReadonlyMap<string, string> {
  if (command.kind === 'clearBoard') return new Map();
  const after = new Map(lines);
  if (command.kind === 'hide') after.delete(command.target);
  if (command.kind === 'writeMath') after.set(command.id, command.tex);
  if (command.kind === 'transformMath') after.set(command.target, command.tex);
  return after;
}

export function getMemoryAfter(command: SceneCommand, memory: BoardMemory): BoardMemory {
  return { kinds: getBoardAfter(command, memory.kinds), lines: getLinesAfter(command, memory.lines) };
}
