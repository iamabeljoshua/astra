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
  getCurve(id: ElementId): ((x: number) => number) | null;
  previousTex: string | null;
  pickedRight: readonly string[];
}

const UNKNOWN: WorkVerdict = { status: 'unknown' };
const RIGHT: WorkVerdict = { status: 'right' };
const WITHIN_X = 0.1;
const SLOPE_STEP = 1e-4;

const closes = (task: Task | null, isDone: boolean) => (task && isDone ? { closesTask: task.id } : {});

const toKey = (text: string) => text.toLowerCase().replace(/\s+/g, '').replace(/[?!.,;:]+$/, '');

const toPartKey = (part: string) => part.replace(/\s/g, '').replace(/^\+/, '');

const BARE_NUMBER = /^-?\d*\.?\d+$/;

// A number can be told from a number, so 54 is not 56, and words are left for the tutor to read.
function checkAccepted(text: string, accepts: readonly string[]): WorkVerdict | null {
  const typed = toKey(text);
  if (accepts.some((accepted) => toKey(accepted) === typed)) return RIGHT;
  const isNumberAgainstNumbers = BARE_NUMBER.test(typed) && accepts.every((accepted) => BARE_NUMBER.test(toKey(accepted)));
  if (!isNumberAgainstNumbers) return null;
  return accepts.some((accepted) => Number(toKey(accepted)) === Number(typed)) ? RIGHT : { status: 'wrong', why: `${typed} is not the answer the tutor set` };
}

function checkMathLineOfWork(tex: string, { task, getLineTex: getTex, previousTex }: WorkContext): CheckedWork {
  const problemTex = task?.way === 'write' && task.on !== undefined ? getTex(task.on) : null;
  const verdict = checkStep({ tex, problemTex, previousTex });
  return { verdict, ...closes(task, verdict.status === 'right' && problemTex !== null && isFinishedAnswer(tex)) };
}

function getInkLineReading(text: string, tex: string | undefined): LineReading {
  return tex === undefined ? { kind: 'words', parts: [{ type: 'words', text }], isAsking: /\?\s*$/.test(text) } : { kind: 'math', parts: [{ type: 'math', text, tex }], isAsking: false };
}

function checkWrite({ text, ink }: StudentWork & { way: 'write' }, context: WorkContext): CheckedWork {
  const { task } = context;
  const writeTask = task?.way === 'write' ? task : null;
  const reading = ink ? getInkLineReading(text, ink.tex) : readLine(text, writeTask?.reads);
  if (ink?.isUnsure) return { reading, verdict: UNKNOWN };
  const accepted = writeTask?.accepts ? checkAccepted(text, writeTask.accepts) : null;
  if (reading.isAsking) return { reading, verdict: UNKNOWN };
  if (accepted) return { reading, verdict: accepted, ...closes(task, accepted.status === 'right') };
  const tex = getLineTex(reading);
  return tex === null ? { reading, verdict: UNKNOWN } : { reading, ...checkMathLineOfWork(tex, context) };
}

function checkPick(part: string, { task, pickedRight }: WorkContext): CheckedWork {
  if (task?.way !== 'pick' || !task.answer) return { verdict: UNKNOWN };
  const answers = task.answer.map(toPartKey);
  if (!answers.includes(toPartKey(part))) return { verdict: { status: 'wrong', why: `${part} is not the part the tutor asked for` } };
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

const crossesZeroNear = (value: (x: number) => number, x: number) => {
  const [before, at, after] = [value(x - WITHIN_X), value(x), value(x + WITHIN_X)];
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
  const isThere = crossesZeroNear(task.seek === 'flat' ? (at) => getSlopeAt(curve, at) : curve, x);
  if (isThere) return { verdict: RIGHT, ...closes(task, true) };
  const { y, slope } = getPointFacts(curve, x);
  return { verdict: { status: 'wrong', why: task.seek === 'flat' ? `the slope at x = ${roundFact(x)} is ${slope}` : `the curve is at ${y} at x = ${roundFact(x)}` } };
}

export function getCurveOf(expression: string, constants: ReadonlyMap<string, number> = new Map()): ((x: number) => number) | null {
  const node = parsePlotExpression(expression, new Set(constants.keys()));
  return node && ((x) => evaluatePlotExpression(node, x, constants));
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
  }
}
