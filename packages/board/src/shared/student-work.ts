import type { ElementId, ElementRef, LineReading, StudentAction, StudentWork, Task, WorkVerdict } from '@astra/contracts';
import { startMathLine } from '../math/math-line.ts';
import { moveOver } from '../player/motion.ts';
import type { BoardElement } from '../player/board-state.ts';
import { getLineTex } from './read-line.ts';

const MARK_DRAWS_MS = 240;
const LOOP_DRAWS_MS = 340;
const LINE_LANDS_MS = 180;

export interface StudentLineContent {
  kind: 'studentLine';
  id: ElementId;
  text: string;
  reading: LineReading;
  verdict: WorkVerdict;
  /** Written with the pen, so the strokes are the line and the reading sits beside it. */
  isInk: boolean;
}

/** What the student has done on a task so far. */
export interface TaskProgress {
  isOpen: boolean;
  /** The verdict on the latest work. */
  verdict: WorkVerdict | null;
  /** The student's last math line since this task opened. */
  lastLineTex: string | null;
  pickedRight: readonly string[];
  /** The item in each slot of a place task. */
  placed: readonly (string | null)[];
  /** Where the student's point is on a drag task. */
  pointX: number | null;
}

type Elements = Map<ElementId, BoardElement>;

export function startProgress(task: Task): TaskProgress {
  return { isOpen: true, verdict: null, lastLineTex: null, pickedRight: [], placed: task.way === 'place' ? task.slots.map(() => null) : [], pointX: null };
}

function setProgress(elements: Elements, id: ElementId, changes: Partial<TaskProgress>): void {
  const element = elements.get(id);
  if (element?.progress) element.progress = { ...element.progress, ...changes };
}

export function closeOpenTasks(elements: Elements): void {
  for (const element of elements.values()) {
    if (element.progress?.isOpen) element.progress = { ...element.progress, isOpen: false };
  }
}

export function moveTaskPoint(elements: Elements, task: ElementId, pointX: number): void {
  setProgress(elements, task, { pointX });
}

function makeElement(id: ElementId, content: BoardElement['content'], { atMs, overMs, math = null, isStudents = true }: { atMs: number; overMs: number; math?: BoardElement['math']; isStudents?: boolean }): BoardElement {
  return { id, content, entrance: moveOver({ from: 0, to: 1, atMs, overMs }), placedScene: null, revealedUpTo: null, math, morphFrom: null, isStudents };
}

function placeStudentLine(elements: Elements, work: StudentWork & { way: 'write' }, reading: LineReading, verdict: WorkVerdict, atMs: number): void {
  if (elements.has(work.id)) return;
  const tex = getLineTex(reading);
  const isInk = work.ink !== undefined;
  elements.set(work.id, makeElement(work.id, { kind: 'studentLine', id: work.id, text: work.text, reading, verdict, isInk }, { atMs, overMs: LINE_LANDS_MS, math: tex === null || isInk ? null : startMathLine(tex) }));
  if (work.task !== undefined && tex !== null) setProgress(elements, work.task, { lastLineTex: tex });
}

// Code's own check lands in the tutor's pen, because it speaks for the tutor before the tutor has a word.
function placeCodeCheck(elements: Elements, target: ElementId, atMs: number): void {
  const id = `${target}-checked` as ElementId;
  if (!elements.has(id)) elements.set(id, makeElement(id, { kind: 'annotate', id, target: target as string as ElementRef, mark: 'check' }, { atMs, overMs: MARK_DRAWS_MS, isStudents: false }));
}

function placeStudentRing(elements: Elements, taskId: ElementId, part: string, atMs: number): void {
  const task = elements.get(taskId);
  if (task?.content.kind !== 'task' || task.content.way !== 'pick') return;
  const { on } = task.content;
  const id = `${taskId}-${elements.size}` as ElementId;
  const isOnMath = elements.get(on)?.math != null;
  const content: BoardElement['content'] = isOnMath ? { kind: 'highlight', id, target: on as string as ElementRef, tex: part } : { kind: 'annotate', id, target: `${on}.${part}` as ElementRef, mark: 'circle' };
  elements.set(id, makeElement(id, content, { atMs, overMs: LOOP_DRAWS_MS }));
}

function applyWorkToTask(elements: Elements, work: Exclude<StudentWork, { way: 'write' }>, verdict: WorkVerdict, atMs: number): void {
  const progress = elements.get(work.task)?.progress;
  if (!progress) return;
  setProgress(elements, work.task, { verdict });
  if (work.way === 'pick') {
    placeStudentRing(elements, work.task, work.part, atMs);
    if (verdict.status === 'right') setProgress(elements, work.task, { pickedRight: [...progress.pickedRight, work.part] });
  }
  if (work.way === 'place') {
    setProgress(elements, work.task, { placed: work.placed });
    if (verdict.status === 'right') placeCodeCheck(elements, work.task, atMs);
  }
  if (work.way === 'drag') setProgress(elements, work.task, { pointX: work.x });
}

/** Puts a piece of the student's work on the board, the same way live and in a replay. */
export function applyWorked(elements: Elements, { work, reading, verdict, closesTask }: Extract<StudentAction, { action: 'worked' }>, atMs: number): void {
  if (work.way === 'write') {
    if (reading) placeStudentLine(elements, work, reading, verdict, atMs);
    if (verdict.status === 'right') placeCodeCheck(elements, work.id, atMs);
  } else {
    applyWorkToTask(elements, work, verdict, atMs);
  }
  if (closesTask !== undefined) setProgress(elements, closesTask, { isOpen: false });
}
