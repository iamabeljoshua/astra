import { type BoardKinds, type ElementId, findMathSpans, getBoardAfter, isStudentLineId, type SceneCommand, type StudentWork, type Task, type WorkVerdict } from '@astra/contracts';
import { canRenderTex } from '@astra/board/tex-check';
import type { CommandVerdict } from './beat-text-reader.ts';
import { type CheckedWork, checkClaimedMath, checkStep, checkTickedLine, getLinearAnswer, getLineTex, isFinishedAnswer, type MathVerdict } from '@astra/board/shared';

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
  /** Lines out of step with the problem code guessed they were on. Code stays out of it, so the tutor may cross one. */
  offProblemLines: ReadonlySet<string>;
  isLatestLineOffProblem: boolean;
  /** The page reloaded and brought the board back, so for this one reply nothing on it needs clearing. */
  hasComeBack: boolean;
  sketchOf: ReadonlyMap<string, string>;
}

/** A change of subject never needs another session, and the real limits have spoken lines of their own, which this does not read. */
const SENDS_THEM_AWAY = /\b(?:new|fresh|another|separate|different)\s+(?:session|chat|lesson|conversation)\b/i;
const STAY_IN_THIS_SESSION = 'Never send them to another session. Anything they ask for belongs in this one. Follow what they just asked, right here.';

export const EMPTY_BOARD: BoardMemory = { kinds: new Map(), lines: new Map(), shownLines: new Set(), lastAssertedLine: null, verdicts: new Map(), openTask: null, doneTasks: new Set(), isLatestWorkWrong: false, isLatestMathUnjudged: false, offProblemLines: new Set(), isLatestLineOffProblem: false, hasComeBack: false, sketchOf: new Map() };

export const DRAWN_KINDS: ReadonlySet<SceneCommand['kind']> = new Set(['writeMath', 'transformMath', 'plot', 'markValue', 'highlight', 'text', 'hide', 'clearBoard', 'focus', 'simulate', 'runSimulation', 'vector', 'annotate', 'diagram', 'note', 'tangent', 'task', 'boardMode', 'table', 'timeline', 'code', 'image', 'drawing', 'numberLine', 'shadeArea', 'geometry', 'construct', 'setParameter', 'trackVector', 'readout', 'ghostPath', 'reveal', 'sketch', 'drawShape', 'animate']);

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

function getMarkProblem(command: SceneCommand & { kind: 'annotate' }, { verdicts, kinds, offProblemLines }: BoardMemory): string | null {
  if (!command.target.includes('.') && kinds.get(command.target.split('.')[0] as ElementId) === 'plot') return 'a mark would go around the whole plot, so use markValue for a place on the curve';
  if (command.mark !== 'check' && command.mark !== 'cross') return null;
  const status = verdicts.get(command.target.split('.')[0] as string);
  if (status === undefined) return null;
  if (command.mark === 'check' && status !== 'right') return `code says that work is ${status}, so it cannot get a check`;
  return command.mark === 'cross' && status !== 'wrong' && !offProblemLines.has(command.target) ? `code says that work is ${status}, so it cannot get a cross` : null;
}

const CALLS_IT_WRONG = /^\s*(?:(?:h+m+|u+m+|u+h+|o+h+)[,.\s]+)*(wrong|incorrect|not (right|quite)|nope?|oops|mistake|close|almost)\b/i;

// A note beside a line is a mark in words, so it cannot say more than code knows.
function getNoteProblem(command: SceneCommand & { kind: 'note' }, { verdicts, offProblemLines }: BoardMemory): string | null {
  const status = verdicts.get(command.target.split('.')[0] as string);
  if (status === undefined) return null;
  if (PRAISE.test(command.text) && status !== 'right') return `code says that work is ${status}, so a note cannot praise it`;
  return CALLS_IT_WRONG.test(command.text) && status !== 'wrong' && !offProblemLines.has(command.target) ? `code says that work is ${status}, so a note cannot call it wrong` : null;
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

const CAME_BACK_WHOLE = "nothing needs clearing, hiding, or writing again, because the student's page came back with every line and mark still on it";

const MATH_WORDS = /\\text\{[^}]*\}|\\(?:times|div|cdot|frac|left|right|,|;|!)/g;

/** "100 - 30 = 70" has nothing left to work out, and "2x + 3 = 11" and "100 - 30" do. */
export function showsItsAnswer(tex: string): boolean {
  const sides = tex.replace(MATH_WORDS, ' ').split(/=|\\approx/);
  const [left = '', right = ''] = sides;
  return sides.length === 2 && !/[a-zA-Z\\]/.test(left + right) && /\d\D+\d/.test(left.trim()) && /^\s*-?[\d.,]+\s*$/.test(right);
}

export const getAnswerShownProblem = (line: string) => `${line} shows the answer to the exercise. Put only the problem on the board, with no answer, and set the task on that.`;

/** A task on an old worked example is fine when it brings its own problem, so a line only counts here if it names it or this reply just wrote it. */
export function getGivenAwayProblem(command: SceneCommand, { lines, lastAssertedLine }: BoardMemory, atTurnStart: BoardMemory): string | null {
  if (command.kind !== 'task' || command.way !== 'write') return null;
  const lineId = command.on ?? (lastAssertedLine !== null && !atTurnStart.lines.has(lastAssertedLine) ? lastAssertedLine : null);
  const line = lineId === null ? undefined : lines.get(lineId);
  return line !== undefined && showsItsAnswer(line) ? getAnswerShownProblem(line) : null;
}

const isProblemOnTheBoard = (command: SceneCommand & { kind: 'task'; way: 'write' }, { lines, lastAssertedLine }: BoardMemory, atTurnStart: BoardMemory) => {
  const lineId = command.on ?? (lastAssertedLine !== null && !atTurnStart.lines.has(lastAssertedLine) ? lastAssertedLine : null);
  return command.reads !== 'words' && /\d/.test((lineId !== null && lines.get(lineId)) || '');
};

export const isWrittenWordsTask = (command: SceneCommand & { kind: 'task' }, memory: BoardMemory, atTurnStart: BoardMemory) => command.way === 'write' && !isProblemOnTheBoard(command, memory, atTurnStart);

/** Code decides what a step's exercise must be, because a rule in the prompt gave 8 number problems in one run and 1 in the next. */
export function getExerciseProblem(command: SceneCommand & { kind: 'task' }, wanted: 'problem' | 'board', wasLastWrittenWords: boolean, memory: BoardMemory, atTurnStart: BoardMemory): string | null {
  const isProblem = command.way === 'pick' || (command.way === 'write' && isProblemOnTheBoard(command, memory, atTurnStart));
  if (wanted === 'problem' && !isProblem) return 'This idea has numbers or working, so its exercise is a real problem, and the student did not hear what you were about to set. Write the problem with its numbers using writeMath, with no answer on the line, then set a write task on that line. A pick on a part of what is drawn also does.';
  if (wanted === 'board' && command.way === 'write' && isProblem) return 'This idea has nothing to calculate, so its exercise is a quiz on the board, and the student did not hear what you were about to set. Set a pick on a part of a diagram, things to put in order or match with a place task, or a sentence with a blank.';
  return wanted === 'board' && wasLastWrittenWords && isWrittenWordsTask(command, memory, atTurnStart) ? 'The last exercise was written words too, and the student did not hear what you were about to set. Set something on the board this time: a pick on a part of a diagram, things to put in order with a place task, or a sentence with a blank.' : null;
}

const toWordsOfALine = (text: string) => new Set(text.toLowerCase().match(/\p{L}{3,}/gu) ?? []);
const FEWEST_WORDS_THAT_MAKE_A_LINE = 3;
const SHARE_THAT_IS_THE_SAME_LINE = 0.75;

export function getRepeatedLineProblem(command: SceneCommand, saidRecently: string): string | null {
  if (command.kind !== 'text' || !command.text.includes('___')) return null;
  const line = toWordsOfALine(command.text);
  const said = toWordsOfALine(saidRecently);
  const shared = [...line].filter((word) => said.has(word)).length;
  return line.size >= FEWEST_WORDS_THAT_MAKE_A_LINE && shared / line.size >= SHARE_THAT_IS_THE_SAME_LINE ? 'That blank is nearly word for word what you just told them, so it only tests memory, and they did not hear you set it. Set one that makes them use the idea on a new case, or join it to an earlier idea.' : null;
}

export function checkAgainstBoard(command: SceneCommand, memory: BoardMemory): CommandVerdict {
  const { lines } = memory;
  // The words after a clear lean on it, as "fresh start" does, so a refused one stops them too.
  if (memory.hasComeBack && (command.kind === 'clearBoard' || command.kind === 'hide')) return { ok: false, problem: CAME_BACK_WHOLE, isWrongMath: true };
  if (hasTooManyMarksInARow(JSON.stringify(command))) return refuse('too many combining marks in a row');
  if (!DRAWN_KINDS.has(command.kind)) return refuse(`the board cannot draw ${command.kind} yet`);
  if ('id' in command && isStudentLineId(command.id)) return refuse(`${command.id} is a name kept for the student's lines, so draw it again under a word, as in poem`);
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
  // A tick says the line is right, whatever claim it was written with.
  if (command.kind === 'annotate' && command.mark === 'check') {
    const line = lines.get(command.target);
    if (memory.shownLines.has(command.target)) return { ok: false, problem: `a tick on ${line}, a line you wrote only to look at. If it is true, write it again with the claim new and tick that. If it is not, leave the tick off`, isWrongMath: true };
    const verdict = line === undefined ? null : checkTickedLine(line);
    if (verdict?.status === 'wrong') return { ok: false, problem: `a tick on ${line}, which is false: ${verdict.why}`, isWrongMath: true };
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
  if (command.kind === 'clearBoard') return { ...EMPTY_BOARD, kinds, doneTasks: memory.doneTasks, hasComeBack: memory.hasComeBack };
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
  const sketchOf = new Map(memory.sketchOf);
  if (command.kind === 'drawShape') sketchOf.set(command.id, command.target);
  if (command.kind === 'hide') sketchOf.delete(command.target);
  return { ...memory, kinds, lines, shownLines, lastAssertedLine, openTask: getOpenTaskAfter(command, memory), sketchOf };
}

export function getBoardTheStudentSees({ kinds, lines, sketchOf }: BoardMemory): Record<string, string> {
  const drawnIn = new Set([...sketchOf].filter(([piece]) => kinds.get(piece) === 'drawShape').map(([, sketch]) => sketch));
  return Object.fromEntries([...kinds].filter(([id, kind]) => kind !== 'sketch' || drawnIn.has(id)).map(([id, kind]) => [id, lines.get(id) ?? kind]));
}

export function getMemoryOnComingBack(memory: BoardMemory): BoardMemory {
  return { ...memory, hasComeBack: true };
}

/** Their own words beat holding the answer back, so asking for it once is enough. */
const ASKS_FOR_THE_ANSWER = /\bshow\s+me\b|\bi\s*(?:do\s*n[o'’]?t|dont)\s*know\s+how\b|\b(?:just|please)\s+(?:tell|give)\s+me\b|\b(?:tell|give|show)\s+me\s+the\s+answer\b|\bwhat(?:'?s|\s+is)\s+the\s+answer\b|\bjust\s+the\s+answer\b/i;

export function getMemoryOnNewTurn(memory: BoardMemory, studentText: string): BoardMemory {
  if (!memory.openTask) return memory;
  const studentTurns = ASKS_FOR_THE_ANSWER.test(studentText) ? FEWEST_TURNS_BEFORE_THE_ANSWER : memory.openTask.studentTurns + 1;
  return { ...memory, openTask: { ...memory.openTask, studentTurns } };
}

export function getMemoryAfterAnswering(memory: BoardMemory): BoardMemory {
  return { ...memory, isLatestWorkWrong: false, isLatestMathUnjudged: false, isLatestLineOffProblem: false };
}

export function getMemoryAfterWork(work: StudentWork, { reading, verdict, closesTask }: CheckedWork, memory: BoardMemory): BoardMemory {
  if (work.way === 'leave') return { ...memory, openTask: null, doneTasks: work.task === undefined ? memory.doneTasks : new Set([...memory.doneTasks, work.task]) };
  const id = work.way === 'write' ? work.id : work.task;
  const isOffProblem = verdict.status === 'unknown' && verdict.offProblem !== undefined;
  const tex = reading ? getLineTex(reading) : null;
  return {
    ...memory,
    kinds: work.way === 'write' ? new Map([...memory.kinds, [id, 'studentLine']]) : memory.kinds,
    lines: work.way === 'write' && tex !== null ? new Map([...memory.lines, [id, tex]]) : memory.lines,
    verdicts: new Map([...memory.verdicts, [id, verdict.status]]),
    openTask: closesTask === memory.openTask?.id ? null : memory.openTask,
    doneTasks: closesTask === undefined ? memory.doneTasks : new Set([...memory.doneTasks, closesTask]),
    isLatestWorkWrong: verdict.status === 'wrong',
    isLatestMathUnjudged: verdict.status === 'unknown' && reading?.kind === 'math' && !isOffProblem,
    offProblemLines: isOffProblem ? new Set([...memory.offProblemLines, id]) : memory.offProblemLines,
    isLatestLineOffProblem: isOffProblem,
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
  new RegExp(`\\b${PICTURE}\\b[^.?!]*\\b(coming(?! up)|loading|on (its|the) way|in a (moment|sec|second|bit)|being (made|drawn)|ready soon|almost ready)\\b`, 'i'),
  /\b(picture|animation|video|clip)\b[^.?!]*\b(pop up|show up|appear)\b/i,
  new RegExp(`\\b(let me|let's|i'll|i will|i'm going to|i am going to|i'm gonna|going to)\\s+(show|pull up|bring up|put up|load|make|get|see|watch|look at)\\s+(you\\s+)?(a|an|the|this|that|up a)?\\s*${PICTURE}\\b`, 'i'),
  new RegExp(`\\b(look at|watch|see|check out)\\s+(the|this|that)\\s+${PICTURE}\\b`, 'i'),
];
const NO_PICTURE_YET = 'You spoke as if a picture were on screen or on its way, and none is. Say nothing about a picture, and teach on with your voice and the board.';

export const getPictureProblem = (text: string, { kinds }: BoardMemory): string | null => (COUNTS_ON_A_PICTURE.some((pattern) => pattern.test(text)) && ![...kinds.values()].includes('richScene') ? NO_PICTURE_YET : null);

/** The prompt's own list of what the tutor may never claim, held here too, because the model still says "I'm glad you told me" to a student in crisis. */
const CLAIMS_A_FEELING = /\bI(?:'m| am)\s+(?:(?:really|so|very|truly|just)\s+)?(?:glad|happy|sorry|worried|proud)\b|\bI\s+(?:really\s+|do\s+)?care\b|\bmatters?\s+(?:more\s+)?to\s+me\b/i;
const SAY_WHAT_IS_TRUE = 'You are an AI, so you were about to claim a feeling you do not have, and the student did not hear it. Say what is true instead, such as "that sounds serious" or "you did the right thing telling me". Keep everything else you were going to say.';

export function getClaimProblem(text: string): string | null {
  return CLAIMS_A_FEELING.test(text) ? SAY_WHAT_IS_TRUE : null;
}

export function getWordsProblem(text: string, { isLatestWorkWrong, isLatestMathUnjudged, isLatestLineOffProblem, openTask }: BoardMemory, isFirstBeat: boolean): string | null {
  if (SENDS_THEM_AWAY.test(text)) return STAY_IN_THIS_SESSION;
  if (isFirstBeat && isLatestLineOffProblem && PRAISE.test(text)) return "Code says the student's last line does not follow from the problem on the board, and your words sounded like praise. Do not praise it. Ask whether it is a problem of their own, or point at where it went off.";
  if (isFirstBeat && isLatestMathUnjudged && CALLS_IT_WRONG.test(text)) return "Code cannot tell whether the student's last line is wrong, and your words called it wrong. It may be another base or a route of their own. Do not say it is right or wrong. Ask what they did.";
  if (isFirstBeat && isLatestWorkWrong && PRAISE.test(text)) return "Code says the student's last work is wrong, and your words sounded like praise. Do not praise it. Point at where it went wrong, in a few words.";
  if (!openTask?.problemTex || openTask.studentTurns >= FEWEST_TURNS_BEFORE_THE_ANSWER) return null;
  return getAnswerWords(openTask.problemTex)?.test(text) ? 'You gave the student the answer before they had a real try. Say nothing about what it comes to. Give one small pointer instead.' : null;
}
