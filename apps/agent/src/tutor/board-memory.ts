import { type BoardKinds, type ElementId, findMathSpans, getBoardAfter, isStudentLineId, type SceneCommand, type StudentWork, type Task, type WorkVerdict } from '@astra/contracts';
import { canRenderTex } from '@astra/board/tex-check';
import type { CommandVerdict } from './beat-text-reader.ts';
import { type CheckedWork, checkClaimedMath, checkStep, getLinearAnswer, getLineTex, isFinishedAnswer, type MathVerdict } from '@astra/board/shared';

export interface OpenTask {
  id: ElementId;
  way: Task['way'];
  on: string | null;
  problemTex: string | null;
  studentTurns: number;
}

export interface BoardMemory {
  kinds: BoardKinds;
  lines: ReadonlyMap<string, string>;
  /** Lines written only to look at, which no later line can follow from. */
  shownLines: ReadonlySet<string>;
  lastAssertedLine: string | null;
  verdicts: ReadonlyMap<string, WorkVerdict['status']>;
  openTask: OpenTask | null;
  doneTasks: ReadonlySet<string>;
  isLatestWorkWrong: boolean;
  /** Their last line was math code could not judge, so it may be another base or a route code cannot see. */
  isLatestMathUnjudged: boolean;
}

export const EMPTY_BOARD: BoardMemory = { kinds: new Map(), lines: new Map(), shownLines: new Set(), lastAssertedLine: null, verdicts: new Map(), openTask: null, doneTasks: new Set(), isLatestWorkWrong: false, isLatestMathUnjudged: false };

export const DRAWN_KINDS: ReadonlySet<SceneCommand['kind']> = new Set(['writeMath', 'transformMath', 'plot', 'markValue', 'highlight', 'text', 'hide', 'clearBoard', 'focus', 'simulate', 'runSimulation', 'vector', 'annotate', 'diagram', 'note', 'tangent', 'task', 'boardMode']);

const FEWEST_TURNS_BEFORE_THE_ANSWER = 2;
const PRAISE = /^\s*(yes|yep|yeah|right|correct|exactly|perfect|nice|great|good( job| work)?|well done|that'?s (right|correct|it)|spot on|you got it)\b/i;
const NUMBER_NAMES: readonly string[] = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];

/** A long run of combining marks can crash a Chrome tab, and passes both the parser and KaTeX. */
const TOO_MANY_MARKS = /\p{M}{5,}/u;
const hasTooManyMarksInARow = (text: string) => TOO_MANY_MARKS.test(text);

const ok: CommandVerdict = { ok: true };
const refuse = (problem: string): CommandVerdict => ({ ok: false, problem, isWrongMath: false });

function toVerdict(verdict: MathVerdict): CommandVerdict {
  return verdict.status === 'wrong' ? { ok: false, problem: verdict.why, isWrongMath: true } : ok;
}

function getMarkProblem(command: SceneCommand & { kind: 'annotate' }, { verdicts, kinds }: BoardMemory): string | null {
  if (!command.target.includes('.') && kinds.get(command.target.split('.')[0] as ElementId) === 'plot') return 'a mark would go around the whole plot, so use markValue for a place on the curve';
  if (command.mark !== 'check' && command.mark !== 'cross') return null;
  const status = verdicts.get(command.target.split('.')[0] as string);
  if (status === undefined) return null;
  if (command.mark === 'check' && status !== 'right') return `code says that work is ${status}, so it cannot get a check`;
  return command.mark === 'cross' && status !== 'wrong' ? `code says that work is ${status}, so it cannot get a cross` : null;
}

const CALLS_IT_WRONG = /^\s*(wrong|incorrect|not (right|quite)|nope?|oops|mistake|close|almost)\b/i;

// A note beside a line is a mark in words, so it cannot say more than code knows.
function getNoteProblem(command: SceneCommand & { kind: 'note' }, { verdicts }: BoardMemory): string | null {
  const status = verdicts.get(command.target.split('.')[0] as string);
  if (status === undefined) return null;
  if (PRAISE.test(command.text) && status !== 'right') return `code says that work is ${status}, so a note cannot praise it`;
  return CALLS_IT_WRONG.test(command.text) && status !== 'wrong' ? `code says that work is ${status}, so a note cannot call it wrong` : null;
}

function getTaskProblem(command: SceneCommand & { kind: 'task' }, { lines }: BoardMemory): string | null {
  if (command.way === 'write' && command.on !== undefined && !lines.has(command.on)) return `${command.on} holds no math to work from`;
  if (command.way !== 'pick' || command.answer === undefined) return null;
  const line = lines.get(command.on);
  const missing = line === undefined ? undefined : command.answer.find((part) => findMathSpans(line, part.replace(/^\+/, '')).length === 0);
  return missing === undefined ? null : `${missing} is not on line ${command.on}`;
}

function isAnswerTooEarly(tex: string, { openTask }: BoardMemory): boolean {
  if (!openTask?.problemTex || openTask.studentTurns >= FEWEST_TURNS_BEFORE_THE_ANSWER || !isFinishedAnswer(tex.replace(/\s/g, ''))) return false;
  return checkStep({ tex, problemTex: openTask.problemTex, previousTex: null }).status === 'right';
}

const getLineBefore = (command: SceneCommand & { kind: 'writeMath' | 'transformMath' }, { lines, shownLines, lastAssertedLine }: BoardMemory) => {
  if (command.kind === 'writeMath') return lastAssertedLine === null ? undefined : lines.get(lastAssertedLine);
  return shownLines.has(command.target) ? undefined : lines.get(command.target);
};

export function checkAgainstBoard(command: SceneCommand, memory: BoardMemory): CommandVerdict {
  const { lines } = memory;
  if (hasTooManyMarksInARow(JSON.stringify(command))) return refuse('too many combining marks in a row');
  if (!DRAWN_KINDS.has(command.kind)) return refuse(`the board cannot draw ${command.kind} yet`);
  if ('id' in command && isStudentLineId(command.id)) return refuse(`${command.id} is a name kept for the student's lines`);
  const markProblem = command.kind === 'annotate' ? getMarkProblem(command, memory) : null;
  // The words after a mark lean on it, so a refused tick or cross stops them too, and the student never hears about a mark that was not drawn.
  if (markProblem !== null) return { ok: false, problem: markProblem, isWrongMath: command.kind === 'annotate' && (command.mark === 'check' || command.mark === 'cross') };
  const noteProblem = command.kind === 'note' ? getNoteProblem(command, memory) : null;
  if (noteProblem !== null) return refuse(noteProblem);
  if (command.kind === 'markValue' && memory.openTask?.way === 'drag' && memory.openTask.on === command.target) return refuse('a dot on the curve could give the place away while the student is dragging on it');
  const taskProblem = command.kind === 'task' ? getTaskProblem(command, memory) : null;
  if (taskProblem !== null) return refuse(taskProblem);
  if (command.kind === 'writeMath' || command.kind === 'transformMath') {
    if (!canRenderTex(command.tex)) return refuse(`the math cannot be set: ${command.tex}`);
    if (isAnswerTooEarly(command.tex, memory)) return refuse('the student has not had a real try yet, so the answer stays theirs to write');
    return toVerdict(checkClaimedMath(command.claim, getLineBefore(command, memory), command.tex));
  }
  if (command.kind === 'highlight' && command.tex !== undefined) {
    const line = lines.get(command.target);
    if (line !== undefined && findMathSpans(line, command.tex).length === 0) return refuse(`${command.tex} is not on line ${command.target}`);
  }
  return ok;
}

function getOpenTaskAfter(command: SceneCommand, { openTask, lines, doneTasks }: BoardMemory): OpenTask | null {
  if (command.kind === 'clearBoard' || (command.kind === 'hide' && command.target === openTask?.id) || (command.kind === 'boardMode' && command.mode === 'teach')) return null;
  if (command.kind !== 'task') return openTask;
  if (doneTasks.has(command.id)) return null;
  return { id: command.id, way: command.way, on: 'on' in command ? (command.on ?? null) : null, problemTex: command.way === 'write' && command.on !== undefined ? (lines.get(command.on) ?? null) : null, studentTurns: 0 };
}

export function getMemoryAfter(command: SceneCommand, memory: BoardMemory): BoardMemory {
  const kinds = getBoardAfter(command, memory.kinds);
  if (command.kind === 'clearBoard') return { ...EMPTY_BOARD, kinds, doneTasks: memory.doneTasks };
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
  return { ...memory, kinds, lines, shownLines, lastAssertedLine, openTask: getOpenTaskAfter(command, memory) };
}

export function getMemoryOnNewTurn(memory: BoardMemory): BoardMemory {
  return memory.openTask ? { ...memory, openTask: { ...memory.openTask, studentTurns: memory.openTask.studentTurns + 1 } } : memory;
}

export function getMemoryAfterAnswering(memory: BoardMemory): BoardMemory {
  return { ...memory, isLatestWorkWrong: false, isLatestMathUnjudged: false };
}

export function getMemoryAfterWork(work: StudentWork, { reading, verdict, closesTask }: CheckedWork, memory: BoardMemory): BoardMemory {
  const id = work.way === 'write' ? work.id : work.task;
  if (work.way === 'leave') return { ...memory, openTask: null, doneTasks: new Set([...memory.doneTasks, work.task]) };
  const tex = reading ? getLineTex(reading) : null;
  return {
    ...memory,
    kinds: work.way === 'write' ? new Map([...memory.kinds, [id, 'studentLine']]) : memory.kinds,
    lines: work.way === 'write' && tex !== null ? new Map([...memory.lines, [id, tex]]) : memory.lines,
    verdicts: new Map([...memory.verdicts, [id, verdict.status]]),
    openTask: closesTask === memory.openTask?.id ? null : memory.openTask,
    doneTasks: closesTask === undefined ? memory.doneTasks : new Set([...memory.doneTasks, closesTask]),
    isLatestWorkWrong: verdict.status === 'wrong',
    isLatestMathUnjudged: verdict.status === 'unknown' && reading?.kind === 'math',
  };
}

function getAnswerWords(tex: string): RegExp | null {
  const answer = getLinearAnswer(tex);
  if (!answer || !Number.isInteger(answer.value)) return null;
  const size = Math.abs(answer.value);
  const name = NUMBER_NAMES[size];
  const said = name === undefined ? String(size) : `(?:${size}|${name})`;
  const value = answer.value < 0 ? `(?:minus |negative |-)${said}` : said;
  return new RegExp(`\\b(?:${answer.letter}\\s+(?:is|equals|=|must be|has to be|comes to)|the answer is|answer's|it's|it is)\\s+${value}\\b`, 'i');
}

export function getWordsProblem(text: string, { isLatestWorkWrong, isLatestMathUnjudged, openTask }: BoardMemory, isFirstBeat: boolean): string | null {
  if (isFirstBeat && isLatestMathUnjudged && CALLS_IT_WRONG.test(text)) return "Code cannot tell whether the student's last line is wrong, and your words called it wrong. It may be another base or a route of their own. Do not say it is right or wrong. Ask what they did.";
  if (isFirstBeat && isLatestWorkWrong && PRAISE.test(text)) return "Code says the student's last work is wrong, and your words sounded like praise. Do not praise it. Point at where it went wrong, in a few words.";
  if (!openTask?.problemTex || openTask.studentTurns >= FEWEST_TURNS_BEFORE_THE_ANSWER) return null;
  return getAnswerWords(openTask.problemTex)?.test(text) ? 'You gave the student the answer before they had a real try. Say nothing about what it comes to. Give one small pointer instead.' : null;
}
