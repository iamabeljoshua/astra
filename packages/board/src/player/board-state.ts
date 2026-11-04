import type { ElementId, ElementRef, FrozenFrame, InkPoint, SceneCommand, SimulationPoint } from '@astra/contracts';
import type { BoardOperation } from './board-operations.ts';
import { getMotionValue, holdMotion, isMoving, type Motion, moveOver } from './motion.ts';
import { PLANNED_SCENES } from './projectile-scene.ts';
import type { Scene, SceneCatalog, SceneParameters } from './scene.ts';

const ENTRANCE_MS = 400;
const MS_PER_SECOND = 1000;

type PlacingCommand = Extract<SceneCommand, { id: ElementId }>;

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
  content: PlacingCommand | InkContent;
  /** From 0 to 1, how much of its entrance has drawn. */
  entrance: Motion;
  placedScene: PlacedScene | null;
  revealedUpTo: Motion | null;
}

export interface BoardState {
  readonly elements: ReadonlyMap<ElementId, BoardElement>;
  readonly focus: ElementRef | null;
}

interface BoardDraft {
  elements: Map<ElementId, BoardElement>;
  focus: ElementRef | null;
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
  if (!placed || element.content.kind === 'ink') return;
  const parameterChanges = { ...placed.parameterChanges, [parameter]: value };
  const scene = catalog(element.content, parameterChanges) ?? placed.scene;
  const playhead = keepsMoving ? moveOver({ from: 0, to: scene.durationSeconds, atMs, overMs: scene.durationSeconds * MS_PER_SECOND }) : holdMotion(0, atMs);
  element.placedScene = { scene, parameterChanges, playhead };
}

function place(board: BoardDraft, command: PlacingCommand, { atMs, catalog }: { atMs: number; catalog: SceneCatalog }): void {
  const scene = catalog(command, {});
  board.elements.set(command.id, {
    id: command.id,
    content: command,
    entrance: moveOver({ from: 0, to: 1, atMs, overMs: ENTRANCE_MS }),
    placedScene: scene && { scene, parameterChanges: {}, playhead: holdMotion(0, atMs) },
    revealedUpTo: 'startsEmpty' in command && command.startsEmpty ? holdMotion(0, atMs) : null,
  });
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
    case 'transformMath': {
      const element = board.elements.get(command.target);
      if (element?.content.kind === 'writeMath') element.content = { ...element.content, tex: command.tex };
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
      place(board, command, { atMs, catalog });
  }
}

function addInk(board: BoardDraft, operation: BoardOperation & { kind: 'inkStroke' }): void {
  const existing = board.elements.get(operation.id);
  if (existing && existing.content.kind !== 'ink') return;
  const points = existing?.content.kind === 'ink' ? [...existing.content.points, ...operation.points] : operation.points;
  board.elements.set(operation.id, { id: operation.id, content: { kind: 'ink', points }, entrance: holdMotion(1, operation.atMs), placedScene: null, revealedUpTo: null });
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
    case 'rewound': {
      const before = reduce(operations.filter((other) => other.atMs < operation.toMs), { operations, catalog }, operation.toMs);
      board.elements = before.elements;
      board.focus = before.focus;
      holdAll(board, atMs);
    }
  }
}

function reduce(operations: readonly BoardOperation[], context: ReduceContext, atMs: number): BoardDraft {
  const board: BoardDraft = { elements: new Map(), focus: null, isFrozen: false };
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
    elements: [...board.elements.values()].map((element) => ({
      id: element.id,
      kind: element.content.kind,
      tex: 'tex' in element.content ? element.content.tex : undefined,
      drawn: round(getMotionValue(element.entrance, atMs)),
      sceneSeconds: element.placedScene ? round(getMotionValue(element.placedScene.playhead, atMs)) : undefined,
      revealedUpTo: element.revealedUpTo ? round(getMotionValue(element.revealedUpTo, atMs)) : undefined,
    })),
  };
}
