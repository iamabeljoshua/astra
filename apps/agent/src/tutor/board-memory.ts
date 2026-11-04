import { type BoardKinds, type ElementId, findMathSpans, getBoardAfter, isStudentLineId, type SceneCommand, type StudentWork, type WorkVerdict } from '@astra/contracts';
import { canRenderTex } from '@astra/board/tex-check';
import type { CommandVerdict } from './beat-text-reader.ts';
import { type CheckedWork, checkClaimedMath, checkStep, getLinearAnswer, getLineTex, isFinishedAnswer, type MathVerdict } from '@astra/board/shared';

export interface OpenTask {
  id: ElementId;
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
}

export const EMPTY_BOARD: BoardMemory = { kinds: new Map(), lines: new Map(), shownLines: new Set(), lastAssertedLine: null, verdicts: new Map(), openTask: null, doneTasks: new Set(), isLatestWorkWrong: false };

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
  if (markProblem !== null) return refuse(markProblem);
  if (command.kind === 'markValue' && memory.openTask !== null) return refuse('a dot on the curve could give the place away while a task is open');
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
  return { id: command.id, problemTex: command.way === 'write' && command.on !== undefined ? (lines.get(command.on) ?? null) : null, studentTurns: 0 };
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
  return { ...memory, isLatestWorkWrong: false };
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

const PICTURE = '(picture|scene|animation|video|clip)';
/** A scene may never come, so words that count on one are false until it is on screen. Drawing on the board is always true, so "I'll draw it" stays allowed. */
const COUNTS_ON_A_PICTURE = [
  new RegExp(`\\b${PICTURE}\\b[^.?!]*\\b(coming|loading|on (its|the) way|in a (moment|sec|second|bit)|being (made|drawn)|ready soon|almost ready|pop up|show up|appear)\\b`, 'i'),
  new RegExp(`\\b(let me|let's|i'll|i will|i'm going to|i am going to|i'm gonna|going to)\\s+(show|pull up|bring up|put up|load|make|get|see|watch|look at)\\s+(you\\s+)?(a|an|the|this|that|up a)?\\s*${PICTURE}\\b`, 'i'),
  new RegExp(`\\b(look at|watch|see|check out)\\s+(the|this|that)\\s+${PICTURE}\\b`, 'i'),
];
const NO_PICTURE_YET = 'You spoke as if a picture were on screen or on its way, and none is. Say nothing about a picture, and teach on with your voice and the board.';

export function getWordsProblem(text: string, { isLatestWorkWrong, openTask, kinds }: BoardMemory, isFirstBeat: boolean): string | null {
  if (COUNTS_ON_A_PICTURE.some((pattern) => pattern.test(text)) && ![...kinds.values()].includes('richScene')) return NO_PICTURE_YET;
  if (isFirstBeat && isLatestWorkWrong && PRAISE.test(text)) return "Code says the student's last work is wrong, and your words sounded like praise. Do not praise it. Point at where it went wrong, in a few words.";
  if (!openTask?.problemTex || openTask.studentTurns >= FEWEST_TURNS_BEFORE_THE_ANSWER) return null;
  return getAnswerWords(openTask.problemTex)?.test(text) ? 'You gave the student the answer before they had a real try. Say nothing about what it comes to. Give one small pointer instead.' : null;
}
