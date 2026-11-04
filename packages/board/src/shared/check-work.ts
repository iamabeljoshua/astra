import { evaluatePlotExpression, type ElementId, type LineReading, parsePlotExpression, type StudentWork, type Task, type WorkVerdict } from '@astra/contracts';
import { checkStep, isFinishedAnswer } from './check-step.ts';
import { getLineTex, readLine } from './read-line.ts';

export interface CheckedWork {
  reading?: LineReading;
  verdict: WorkVerdict;
  closesTask?: ElementId;
}

export interface WorkContext {
  task: Task | null;
  getLineTex(id: ElementId): string | null;
  getCurve(id: ElementId): { value(x: number): number; within: number } | null;
  previousTex: string | null;
  pickedRight: readonly string[];
  /** The tutor's latest equation on the board, which a line answers even before a task has landed. */
  problemTex?: string | null;
}

const UNKNOWN: WorkVerdict = { status: 'unknown' };
const RIGHT: WorkVerdict = { status: 'right' };
/** Never finer than a point can move, or a student could not land on the answer. */
export const FEWEST_WITHIN_X = 0.1;
const SLOPE_STEP = 1e-4;

const closes = (task: Task | null, isDone: boolean) => (task && isDone ? { closesTask: task.id } : {});

const toKey = (text: string) => text.toLowerCase().replace(/\s+/g, '').replace(/[?!.,;:]+$/, '');

const toPartKey = (part: string) => part.replace(/\s/g, '').replace(/^\+/, '');

const BARE_NUMBER = /^-?\d*\.?\d+$/;
const PLEASANTRY = String.raw`(?:(?:ok|okay|so|actually|um|please|can we|could we|can you|could you|let'?s|lets|i want to|i'?d rather|i'?d like to|i wanna)[,\s]+)*`;
const WANTS_SOMETHING_ELSE = new RegExp(String.raw`^\s*${PLEASANTRY}(?:teach me|learn(?: about)?|talk about|switch to|move on to|go back to|do something else|change (?:the )?(?:topic|subject)|new topic|another topic|different topic|something else|forget (?:this|that|it)|stop(?: here| now| this| that| it)|quit(?: this| that| it)?|move on|done with (?:this|that|it))\b(?!\s+(?:this|that|it|how to (?:do|solve) (?:this|that|it))\b)`, 'i');

export const wantsSomethingElse = (text: string) => WANTS_SOMETHING_ELSE.test(text);

const THINKING_ALOUD = /^(h+m+|u+m+|u+h+|e+r+|m+|mhm|o+k+|okay|alright|right|yeah|yep|wait|hold on|one sec(ond)?|sec|thinking|let me think|let me see|ah+|oh+|hm+ ok(ay)?)[\s.!,…]*$/i;

export const isThinkingAloud = (text: string) => THINKING_ALOUD.test(text.trim());

function checkAccepted(text: string, accepts: readonly string[]): WorkVerdict | null {
  const typed = toKey(text);
  if (accepts.some((accepted) => toKey(accepted) === typed)) return RIGHT;
  const isNumberAgainstNumbers = BARE_NUMBER.test(typed) && accepts.every((accepted) => BARE_NUMBER.test(toKey(accepted)));
  if (!isNumberAgainstNumbers) return null;
  return accepts.some((accepted) => Number(toKey(accepted)) === Number(typed)) ? RIGHT : { status: 'wrong', why: `${typed} is not the answer the tutor set` };
}

const getProblemLine = (task: Task | null) => (task?.way === 'write' || task?.way === 'pick' ? task.on : undefined);

function checkMathLineOfWork(tex: string, { task, getLineTex: getTex, previousTex, problemTex: boardProblemTex = null }: WorkContext): CheckedWork {
  const problemLine = getProblemLine(task);
  const problemTex = problemLine === undefined ? boardProblemTex : getTex(problemLine);
  const verdict = checkStep({ tex, problemTex, previousTex });
  const answered = task?.way === 'write' || task?.way === 'pick' ? task : null;
  return { verdict, ...closes(answered, verdict.status === 'right' && problemTex !== null && isFinishedAnswer(tex)) };
}

// An old words question must not hold later math as words, and a line that is only math is math.
function readWorkLine(text: string, task: (Task & { way: 'write' }) | null): LineReading {
  if (task?.reads !== 'words') return readLine(text, task?.reads);
  const plain = readLine(text);
  return plain.kind === 'math' ? plain : readLine(text, 'words');
}

const isOpenQuestion = (task: (Task & { way: 'write' }) | null) => task !== null && task.reads !== 'code' && task.on === undefined && task.accepts === undefined;

function getReaderLineReading(text: string, tex: string | undefined): LineReading {
  return tex === undefined ? { kind: 'words', parts: [{ type: 'words', text }], isAsking: /\?\s*$/.test(text) } : { kind: 'math', parts: [{ type: 'math', text, tex }], isAsking: false };
}

function checkWrite({ text, ink, heard, keyed }: StudentWork & { way: 'write' }, context: WorkContext): CheckedWork {
  const read = ink ?? heard ?? keyed;
  const { task } = context;
  const writeTask = task?.way === 'write' ? task : null;
  const reading = read ? getReaderLineReading(text, read.tex) : readWorkLine(text, writeTask);
  if (read?.isUnsure) return { reading, verdict: UNKNOWN };
  if (task && reading.kind === 'words' && wantsSomethingElse(text)) return { reading, verdict: UNKNOWN, closesTask: task.id };
  const accepted = writeTask?.accepts ? checkAccepted(text, writeTask.accepts) : null;
  if (reading.isAsking) return { reading, verdict: UNKNOWN };
  if (accepted) return { reading, verdict: accepted, ...closes(task, accepted.status === 'right') };
  const answersQuestion = isOpenQuestion(writeTask) && !isThinkingAloud(text) ? closes(task, true) : {};
  const tex = getLineTex(reading);
  return tex === null ? { reading, verdict: UNKNOWN, ...answersQuestion } : { reading, ...checkMathLineOfWork(tex, context), ...answersQuestion };
}

function checkPick(part: string, { task, pickedRight }: WorkContext): CheckedWork {
  if (task?.way !== 'pick') return { verdict: UNKNOWN };
  if (!task.answer) return { verdict: UNKNOWN, ...closes(task, true) };
  const answers = task.answer.map(toPartKey);
  if (!answers.includes(toPartKey(part))) return { verdict: { status: 'wrong', why: `${part} is not the part the tutor asked for` }, ...closes(task, new Set(answers).size === 1) };
  const picked = new Set([...pickedRight.map(toPartKey), toPartKey(part)]);
  return { verdict: RIGHT, ...closes(task, answers.every((answer) => picked.has(answer))) };
}

function getWrongSlots(task: Task & { way: 'place' }, placed: readonly (string | null)[]): string[] {
  return task.slots.flatMap((slot, index) => (placed[index] === task.answer?.[index] ? [] : [`${slot} holds ${placed[index] ?? 'nothing'}`]));
}

function checkPlace(placed: readonly (string | null)[], { task }: WorkContext): CheckedWork {
  if (task?.way !== 'place' || !task.answer || placed.length !== task.slots.length || placed.includes(null)) return { verdict: UNKNOWN };
  const wrongSlots = getWrongSlots(task, placed);
  if (wrongSlots.length === 0) return { verdict: RIGHT, ...closes(task, true) };
  return { verdict: { status: 'wrong', why: wrongSlots.join(', ') } };
}

const getSlopeAt = (curve: (x: number) => number, x: number) => (curve(x + SLOPE_STEP) - curve(x - SLOPE_STEP)) / (2 * SLOPE_STEP);

const crossesZeroNear = (value: (x: number) => number, x: number, within: number) => {
  const [before, at, after] = [value(x - within), value(x), value(x + within)];
  return Math.abs(at) < 1e-9 || before * after <= 0;
};

export interface PointFacts {
  x: number;
  y: number;
  slope: number;
}

const roundFact = (value: number) => Number(value.toFixed(3));

export function getPointFacts(curve: (x: number) => number, x: number): PointFacts {
  return { x: roundFact(x), y: roundFact(curve(x)), slope: roundFact(getSlopeAt(curve, x)) };
}

function checkDrag(x: number, { task, getCurve }: WorkContext): CheckedWork {
  if (task?.way !== 'drag' || task.seek === undefined) return { verdict: UNKNOWN };
  const curve = getCurve(task.on);
  if (!curve) return { verdict: UNKNOWN };
  const isThere = crossesZeroNear(task.seek === 'flat' ? (at) => getSlopeAt(curve.value, at) : curve.value, x, curve.within);
  if (isThere) return { verdict: RIGHT, ...closes(task, true) };
  const { y, slope } = getPointFacts(curve.value, x);
  return { verdict: { status: 'wrong', why: task.seek === 'flat' ? `the slope at x = ${roundFact(x)} is ${slope}` : `the curve is at ${y} at x = ${roundFact(x)}` } };
}

export function getCurveOf(expression: string, constants: ReadonlyMap<string, number> = new Map()): ((x: number) => number) | null {
  const node = parsePlotExpression(expression, new Set(constants.keys()));
  return node && ((x) => evaluatePlotExpression(node, x, constants));
}

export const NODS = { doubt: 'Hm.', agree: 'Mm-hm.' } as const;
export type Nod = (typeof NODS)[keyof typeof NODS];

export function getNod(work: StudentWork, { verdict }: CheckedWork): Nod | null {
  if (verdict.status === 'wrong') return NODS.doubt;
  return verdict.status === 'right' && work.way !== 'write' ? NODS.agree : null;
}

export function checkWork(work: StudentWork, context: WorkContext): CheckedWork {
  switch (work.way) {
    case 'write':
      return checkWrite(work, context);
    case 'pick':
      return checkPick(work.part, context);
    case 'place':
      return checkPlace(work.placed, context);
    case 'drag':
      return checkDrag(work.x, context);
    case 'leave':
      return { verdict: UNKNOWN, ...closes(context.task, true) };
  }
}
