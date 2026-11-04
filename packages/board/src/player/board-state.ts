import type { BoardModeName, ElementId, ElementRef, FrozenFrame, InkPoint, SceneCommand, SimulationPoint } from '@astra/contracts';
import { type MathLine, startMathLine, transformMathLine } from '../math/math-line.ts';
import { applyWorked, closeOpenTasks, moveTaskPoint, startProgress, type StudentLineContent, type TaskProgress } from '../shared/student-work.ts';
import type { BoardOperation } from './board-operations.ts';
import { getMotionValue, holdMotion, isMoving, type Motion, moveOver } from './motion.ts';
import { PLANNED_SCENES } from './projectile-scene.ts';
import type { Scene, SceneCatalog, SceneParameters } from './scene.ts';

const ENTRANCE_MS = 400;
const REARRANGE_MS = 800;
/** A pen's loop or tick, drawn fast enough to land on its word. */
const MARK_DRAWS_MS = 340;
const WRITING_MS_PER_CHARACTER = 35;
const LONGEST_WRITING_MS = 1600;
const MS_PER_SECOND = 1000;

type PlacingCommand = Extract<SceneCommand, { id: ElementId }>;

const BRINGS_THE_BOARD: ReadonlySet<SceneCommand['kind']> = new Set(['writeMath', 'text', 'plot', 'numberLine', 'geometry', 'simulate', 'drawing', 'diagram', 'table', 'timeline', 'code', 'image', 'task']);

export interface InkContent {
  kind: 'ink';
  points: readonly InkPoint[];
}

export interface PlacedScene {
  scene: Scene;
  parameterChanges: SceneParameters;
  /** In seconds on the scene's own timeline. */
  playhead: Motion;
}

export interface BoardElement {
  id: ElementId;
  /** When this use of the id began. A freeze leaves it alone, and the same id placed again gets a new one. */
  placedAtMs: number;
  content: PlacingCommand | InkContent | StudentLineContent;
  /** From 0 to 1, how much of its entrance or its latest rearrangement has drawn. */
  entrance: Motion;
  placedScene: PlacedScene | null;
  revealedUpTo: Motion | null;
  math: MathLine | null;
  /** The equation it is rearranging from, while `entrance` runs. */
  morphFrom: MathLine | null;
  /** Set on a task, for what the student has done on it so far. */
  progress?: TaskProgress;
  /** A mark the student made rather than the tutor, so it takes the student's ink and not the tutor's pen. */
  isStudents?: boolean;
}

/** What the right side is for, and since when, so the move reads from the clock. */
export interface BoardStage {
  mode: BoardModeName;
  sinceMs: number;
}

export interface BoardState {
  readonly elements: ReadonlyMap<ElementId, BoardElement>;
  readonly focus: ElementRef | null;
  /** Null until the tutor first writes or names a mode. */
  readonly stage: BoardStage | null;
}

interface BoardDraft {
  elements: Map<ElementId, BoardElement>;
  focus: ElementRef | null;
  stage: BoardStage | null;
  isFrozen: boolean;
}

function holdAll(board: BoardDraft, atMs: number): void {
  for (const element of board.elements.values()) {
    element.entrance = holdMotion(getMotionValue(element.entrance, atMs), atMs);
    if (element.placedScene) element.placedScene.playhead = holdMotion(getMotionValue(element.placedScene.playhead, atMs), atMs);
    if (element.revealedUpTo) element.revealedUpTo = holdMotion(getMotionValue(element.revealedUpTo, atMs), atMs);
  }
}

function applyFrozenFrame(board: BoardDraft, frame: FrozenFrame, atMs: number): void {
  const element = board.elements.get(frame.target);
  if (!element) return;
  if ('simulationSeconds' in frame && element.placedScene) element.placedScene.playhead = holdMotion(frame.simulationSeconds, atMs);
  if ('revealedUpTo' in frame) element.revealedUpTo = holdMotion(frame.revealedUpTo, atMs);
  if ('drawnFraction' in frame) element.entrance = holdMotion(frame.drawnFraction, atMs);
}

function freeze(board: BoardDraft, frames: readonly FrozenFrame[], atMs: number): void {
  holdAll(board, atMs);
  frames.forEach((frame) => applyFrozenFrame(board, frame, atMs));
  board.isFrozen = true;
}

// A drawing cut during its entrance finishes when the board unfreezes, because no later cue would finish it.
function unfreeze(board: BoardDraft, atMs: number): void {
  if (!board.isFrozen) return;
  board.isFrozen = false;
  for (const element of board.elements.values()) {
    const drawn = getMotionValue(element.entrance, atMs);
    if (drawn < 1) element.entrance = moveOver({ from: drawn, to: 1, atMs, overMs: (1 - drawn) * ENTRANCE_MS });
  }
}

function getScenePoint(point: SimulationPoint | undefined, scene: Scene): number {
  if (typeof point === 'number') return Math.min(point, scene.durationSeconds);
  return point === undefined ? scene.durationSeconds : (scene.moments[point] ?? scene.durationSeconds);
}

function runScene(element: BoardElement, command: SceneCommand & { kind: 'runSimulation' }, { atMs, overMs }: { atMs: number; overMs: number | null }): void {
  const placed = element.placedScene;
  if (!placed) return;
  const now = getMotionValue(placed.playhead, atMs);
  const { scene } = placed;
  switch (command.action) {
    case 'play': {
      const to = getScenePoint(command.until, scene);
      placed.playhead = moveOver({ from: now, to, atMs, overMs: overMs ?? Math.abs(to - now) * MS_PER_SECOND });
      return;
    }
    case 'pause':
      placed.playhead = holdMotion(now, atMs);
      return;
    case 'restart':
      placed.playhead = moveOver({ from: 0, to: scene.durationSeconds, atMs, overMs: scene.durationSeconds * MS_PER_SECOND });
      return;
    case 'seek':
      placed.playhead = holdMotion(getScenePoint(command.to, scene), atMs);
  }
}

function setSceneParameter(element: BoardElement, { parameter, value, atMs, keepsMoving, catalog }: { parameter: string; value: number; atMs: number; keepsMoving: boolean; catalog: SceneCatalog }): void {
  const placed = element.placedScene;
  if (!placed || element.content.kind === 'ink' || element.content.kind === 'studentLine') return;
  const parameterChanges = { ...placed.parameterChanges, [parameter]: value };
  const scene = catalog(element.content, parameterChanges) ?? placed.scene;
  const playhead = keepsMoving ? moveOver({ from: 0, to: scene.durationSeconds, atMs, overMs: scene.durationSeconds * MS_PER_SECOND }) : holdMotion(0, atMs);
  element.placedScene = { scene, parameterChanges, playhead };
}

function getWritingMs(command: PlacingCommand): number {
  if (command.kind === 'highlight' || command.kind === 'annotate') return MARK_DRAWS_MS;
  const written = command.kind === 'writeMath' ? command.tex.length : command.kind === 'text' && command.handwritten ? command.text.length : 0;
  return Math.min(LONGEST_WRITING_MS, Math.max(ENTRANCE_MS, written * WRITING_MS_PER_CHARACTER));
}

function place(board: BoardDraft, command: PlacingCommand, { atMs, overMs, catalog }: { atMs: number; overMs: number | null; catalog: SceneCatalog }): void {
  const scene = catalog(command, {});
  if (command.kind === 'task') closeOpenTasks(board.elements);
  // Anything new written or asked for needs the board, so it comes in, even if the tutor never said so.
  if (BRINGS_THE_BOARD.has(command.kind) && board.stage?.mode !== 'handsOn') board.stage = { mode: 'handsOn', sinceMs: atMs };
  board.elements.set(command.id, {
    id: command.id,
    placedAtMs: atMs,
    content: command,
    entrance: moveOver({ from: 0, to: 1, atMs, overMs: overMs ?? getWritingMs(command) }),
    placedScene: scene && { scene, parameterChanges: {}, playhead: holdMotion(0, atMs) },
    revealedUpTo: 'startsEmpty' in command && command.startsEmpty ? holdMotion(0, atMs) : null,
    math: command.kind === 'writeMath' ? startMathLine(command.tex) : null,
    morphFrom: null,
    ...(command.kind === 'task' ? { progress: startProgress(command) } : {}),
  });
}

function rearrange(element: BoardElement, command: SceneCommand & { kind: 'transformMath' }, { atMs, overMs }: { atMs: number; overMs: number | null }): void {
  if (element.content.kind !== 'writeMath' || !element.math) return;
  element.morphFrom = element.math;
  element.math = transformMathLine(element.math, command.tex);
  element.content = { ...element.content, tex: command.tex };
  element.entrance = moveOver({ from: 0, to: 1, atMs, overMs: overMs ?? REARRANGE_MS });
}

function applyCommand(board: BoardDraft, command: SceneCommand, { atMs, overMs, catalog }: { atMs: number; overMs: number | null; catalog: SceneCatalog }): void {
  switch (command.kind) {
    case 'clearBoard':
      board.elements.clear();
      board.focus = null;
      return;
    case 'hide':
      board.elements.delete(command.target);
      return;
    case 'focus':
      board.focus = command.target;
      return;
    case 'boardMode':
      if (board.stage?.mode !== command.mode) board.stage = { mode: command.mode, sinceMs: atMs };
      if (command.mode === 'teach') closeOpenTasks(board.elements);
      return;
    case 'transformMath': {
      const element = board.elements.get(command.target);
      if (element) rearrange(element, command, { atMs, overMs });
      return;
    }
    case 'runSimulation': {
      const element = board.elements.get(command.target);
      if (element) runScene(element, command, { atMs, overMs });
      return;
    }
    case 'setParameter': {
      const element = board.elements.get(command.target);
      if (element?.placedScene) setSceneParameter(element, { parameter: command.parameter, value: command.value, atMs, keepsMoving: isMoving(element.placedScene.playhead, atMs), catalog });
      return;
    }
    case 'reveal': {
      const element = board.elements.get(command.target);
      if (element) element.revealedUpTo = moveOver({ from: element.revealedUpTo ? getMotionValue(element.revealedUpTo, atMs) : 0, to: command.upTo, atMs, overMs: overMs ?? 0 });
      return;
    }
    default:
      place(board, command, { atMs, overMs, catalog });
  }
}

function addInk(board: BoardDraft, operation: BoardOperation & { kind: 'inkStroke' }): void {
  const existing = board.elements.get(operation.id);
  if (existing && existing.content.kind !== 'ink') return;
  const points = existing?.content.kind === 'ink' ? [...existing.content.points, ...operation.points] : operation.points;
  board.elements.set(operation.id, { id: operation.id, placedAtMs: existing?.placedAtMs ?? operation.atMs, content: { kind: 'ink', points }, entrance: holdMotion(1, operation.atMs), placedScene: null, revealedUpTo: null, math: null, morphFrom: null });
}

interface ReduceContext {
  operations: readonly BoardOperation[];
  catalog: SceneCatalog;
}

function applyOperation(board: BoardDraft, operation: BoardOperation, { operations, catalog }: ReduceContext): void {
  const { atMs } = operation;
  switch (operation.kind) {
    case 'beatStarted':
      unfreeze(board, atMs);
      return;
    case 'command':
      applyCommand(board, operation.command, { atMs, overMs: operation.overMs, catalog });
      return;
    case 'freeze':
      freeze(board, operation.frames, atMs);
      return;
    case 'parameterSample': {
      const element = board.elements.get(operation.target);
      if (element) setSceneParameter(element, { parameter: operation.parameter, value: operation.value, atMs, keepsMoving: true, catalog });
      return;
    }
    case 'inkStroke':
      addInk(board, operation);
      return;
    case 'inkErased':
      if (board.elements.get(operation.target)?.content.kind === 'ink') board.elements.delete(operation.target);
      return;
    case 'worked':
      board.stage ??= { mode: 'handsOn', sinceMs: atMs };
      applyWorked(board.elements, operation.action, atMs);
      return;
    case 'pointMoved':
      moveTaskPoint(board.elements, operation.task, operation.x);
      return;
    case 'rewound': {
      const before = reduce(operations.filter((other) => other.atMs < operation.toMs), { operations, catalog }, operation.toMs);
      board.elements = before.elements;
      board.focus = before.focus;
      board.stage = before.stage;
      freeze(board, [], operation.toMs);
    }
  }
}

function reduce(operations: readonly BoardOperation[], context: ReduceContext, atMs: number): BoardDraft {
  const board: BoardDraft = { elements: new Map(), focus: null, stage: null, isFrozen: false };
  for (const operation of operations) {
    if (operation.atMs > atMs) break;
    applyOperation(board, operation, context);
  }
  return board;
}

/** Takes operations in time order. A live board and a replay differ only in where those came from. */
export function getBoardAt(operations: readonly BoardOperation[], atMs: number, catalog: SceneCatalog = PLANNED_SCENES): BoardState {
  return reduce(operations, { operations, catalog }, atMs);
}

export function getSceneFrame(element: BoardElement, atMs: number): unknown {
  return element.placedScene && element.placedScene.scene.getFrame(getMotionValue(element.placedScene.playhead, atMs));
}

/** Where everything still moving has reached, as the report a cut sends. */
export function getFrozenFrames(board: BoardState, atMs: number): FrozenFrame[] {
  return [...board.elements.values()].flatMap((element): FrozenFrame[] => {
    const frames: FrozenFrame[] = [];
    if (isMoving(element.entrance, atMs)) frames.push({ target: element.id, drawnFraction: getMotionValue(element.entrance, atMs) });
    if (element.placedScene && isMoving(element.placedScene.playhead, atMs)) frames.push({ target: element.id, simulationSeconds: getMotionValue(element.placedScene.playhead, atMs) });
    if (element.revealedUpTo && isMoving(element.revealedUpTo, atMs)) frames.push({ target: element.id, revealedUpTo: getMotionValue(element.revealedUpTo, atMs) });
    return frames;
  });
}

const DESCRIBED_DECIMALS = 3;

/** A plain copy of what the student sees at this moment, for comparing a live board with a replay. */
export function describeBoard(board: BoardState, atMs: number) {
  const round = (value: number) => Number(value.toFixed(DESCRIBED_DECIMALS));
  return {
    focus: board.focus,
    stage: board.stage,
    elements: [...board.elements.values()].map((element) => ({
      id: element.id,
      kind: element.content.kind,
      tex: 'tex' in element.content ? element.content.tex : undefined,
      terms: element.math?.terms.map((term) => `${term.id}:${term.tex}`),
      morphFrom: element.morphFrom?.tex,
      drawn: round(getMotionValue(element.entrance, atMs)),
      sceneSeconds: element.placedScene ? round(getMotionValue(element.placedScene.playhead, atMs)) : undefined,
      revealedUpTo: element.revealedUpTo ? round(getMotionValue(element.revealedUpTo, atMs)) : undefined,
      verdict: element.content.kind === 'studentLine' ? element.content.verdict.status : undefined,
      progress: element.progress,
    })),
  };
}
