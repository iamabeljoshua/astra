import { type ElementId, type ElementRef, type FrozenFrame, getOverlappingSlider, type InkPoint, type SceneCommand, type SimulationPoint, type Slider } from '@astra/contracts';
import { type MathLine, startMathLine, transformMathLine } from '../math/math-line.ts';
import { getChangesInPairOf } from '../motion/projectile-scene.ts';
import type { BoardOperation } from './board-operations.ts';
import { getMotionEndMs, getMotionValue, holdMotion, isMoving, type Motion, moveOver, retimeMotion } from './motion.ts';
import { PLANNED_SCENES } from './planned-scenes.ts';
import type { Scene, SceneCatalog, SceneParameters } from './scene.ts';

const ENTRANCE_MS = 400;
const REARRANGE_MS = 800;
const RESHAPE_MS = 600;
const CURVE_DRAWING_MS = 900;
const HANDOVER_MS = 120;
const WRITING_MS_PER_CHARACTER = 35;
const LONGEST_WRITING_MS = 1600;
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
  /** The values a curve is reshaping from, while `entrance` runs. */
  reshapingFrom: SceneParameters | null;
}

export interface BoardElement {
  id: ElementId;
  /** When this use of the id began. A freeze leaves it alone, and the same id placed again gets a new one. */
  placedAtMs: number;
  content: PlacingCommand | InkContent;
  /** From 0 to 1, how much of its entrance or its latest rearrangement has drawn. */
  entrance: Motion;
  placedScene: PlacedScene | null;
  revealedUpTo: Motion | null;
  math: MathLine | null;
  /** The equation it is rearranging from, while `entrance` runs. */
  morphFrom: MathLine | null;
  ghostScene: Scene | null;
  targetSecondsWhenPlaced: number | null;
}

export interface BoardState {
  readonly elements: ReadonlyMap<ElementId, BoardElement>;
  readonly focus: ElementRef | null;
  /** Sliders refused because they set a speed in the other pair from a live slider on the same flight. */
  readonly refusedSliders: readonly Slider[];
}

interface PendingMove {
  command: SceneCommand & { kind: 'transformMath' };
  landsAtMs: number | null;
}

interface BoardDraft {
  elements: Map<ElementId, BoardElement>;
  focus: ElementRef | null;
  isFrozen: boolean;
  pendingMoves: Map<ElementId, PendingMove>;
  refusedSliders: Slider[];
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

// A scene's moments come from a model, so a name it does not own holds the scene where it is.
function getScenePoint(point: SimulationPoint | undefined, scene: Scene, nowSeconds: number): number {
  if (typeof point === 'number') return Math.min(point, scene.durationSeconds);
  if (point === undefined) return scene.durationSeconds;
  return Object.hasOwn(scene.moments, point) ? (scene.moments[point] as number) : nowSeconds;
}

// Time does not run backward, so a play to a moment already passed starts over.
const getPlayStart = (now: number, to: number) => (to < now ? 0 : now);

function runScene(element: BoardElement, command: SceneCommand & { kind: 'runSimulation' }, { atMs, overMs }: { atMs: number; overMs: number | null }): void {
  const placed = element.placedScene;
  if (!placed) return;
  const now = getMotionValue(placed.playhead, atMs);
  const { scene } = placed;
  switch (command.action) {
    case 'play': {
      const to = getScenePoint(command.until, scene, now);
      const from = getPlayStart(now, to);
      placed.playhead = moveOver({ from, to, atMs, overMs: overMs ?? ((to - from) * MS_PER_SECOND) / (command.rate ?? 1) });
      return;
    }
    case 'pause':
      placed.playhead = holdMotion(now, atMs);
      return;
    case 'restart':
      placed.playhead = moveOver({ from: 0, to: scene.durationSeconds, atMs, overMs: scene.durationSeconds * MS_PER_SECOND });
      return;
    case 'seek':
      placed.playhead = holdMotion(getScenePoint(command.to, scene, now), atMs);
  }
}

function setSceneParameter(element: BoardElement, { parameter, value, atMs, keepsMoving, catalog }: { parameter: string; value: number; atMs: number; keepsMoving: boolean; catalog: SceneCatalog }): void {
  const placed = element.placedScene;
  if (!placed || element.content.kind === 'ink') return;
  // Keep speed changes in one pair, so an older change cannot replay against this one and move a number nobody touched.
  const parameterChanges = { ...getChangesInPairOf(parameter, placed.parameterChanges, placed.scene.values), [parameter]: value };
  const scene = catalog(element.content, parameterChanges) ?? placed.scene;
  const playhead = keepsMoving ? moveOver({ from: 0, to: scene.durationSeconds, atMs, overMs: scene.durationSeconds * MS_PER_SECOND }) : holdMotion(0, atMs);
  element.placedScene = { scene, parameterChanges, playhead, reshapingFrom: null };
}

export function getReshapedValues(element: BoardElement, atMs: number): SceneParameters {
  const placed = element.placedScene;
  if (!placed) return {};
  const share = getMotionValue(element.entrance, atMs);
  const target = placed.scene.values ?? {};
  if (!placed.reshapingFrom || share >= 1) return target;
  const from = placed.reshapingFrom;
  return Object.fromEntries(Object.entries(target).map(([name, value]) => [name, (from[name] ?? value) + (value - (from[name] ?? value)) * share]));
}

function reshapeCurve(element: BoardElement, { constant, value, atMs, overMs, catalog }: { constant: string; value: number; atMs: number; overMs: number | null; catalog: SceneCatalog }): void {
  const placed = element.placedScene;
  if (!placed || element.content.kind !== 'plot') return;
  const reshapingFrom = getReshapedValues(element, atMs);
  const parameterChanges = { ...placed.parameterChanges, [constant]: value };
  element.placedScene = { scene: catalog(element.content, parameterChanges) ?? placed.scene, parameterChanges, playhead: placed.playhead, reshapingFrom };
  element.entrance = moveOver({ from: 0, to: 1, atMs, overMs: overMs ?? RESHAPE_MS });
}

function getWritingMs(command: PlacingCommand): number {
  if (command.kind === 'plot') return CURVE_DRAWING_MS;
  const written = command.kind === 'writeMath' ? command.tex.length : command.kind === 'text' && command.handwritten ? command.text.length : 0;
  return Math.min(LONGEST_WRITING_MS, Math.max(ENTRANCE_MS, written * WRITING_MS_PER_CHARACTER));
}

function getRevealStart(content: BoardElement['content']): number {
  return content.kind === 'plot' ? content.domain[0] : 0;
}

function getGhostScene(board: BoardDraft, command: PlacingCommand): Scene | null {
  return command.kind === 'ghostPath' ? (board.elements.get(command.target)?.placedScene?.scene ?? null) : null;
}

function getTargetSecondsNow(board: BoardDraft, command: PlacingCommand, atMs: number): number | null {
  if (command.kind !== 'annotate' && command.kind !== 'highlight') return null;
  const playhead = board.elements.get(command.target.split('.')[0] as ElementId)?.placedScene?.playhead;
  return playhead ? getMotionValue(playhead, atMs) : null;
}

const isSameCommand = (first: BoardElement['content'], second: PlacingCommand) => JSON.stringify(first) === JSON.stringify(second);

function place(board: BoardDraft, command: PlacingCommand, { atMs, overMs, catalog }: { atMs: number; overMs: number | null; catalog: SceneCatalog }): void {
  const scene = catalog(command, {});
  board.pendingMoves.delete(command.id);
  const placedBefore = board.elements.get(command.id);
  if (placedBefore && !isSameCommand(placedBefore.content, command)) removeAttached(board, command.id);
  board.elements.set(command.id, {
    id: command.id,
    placedAtMs: atMs,
    content: command,
    entrance: moveOver({ from: 0, to: 1, atMs, overMs: overMs ?? getWritingMs(command) }),
    placedScene: scene && { scene, parameterChanges: {}, playhead: holdMotion(0, atMs), reshapingFrom: null },
    revealedUpTo: 'startsEmpty' in command && command.startsEmpty ? holdMotion(getRevealStart(command), atMs) : null,
    math: command.kind === 'writeMath' ? startMathLine(command.tex) : null,
    morphFrom: null,
    ghostScene: getGhostScene(board, command),
    targetSecondsWhenPlaced: getTargetSecondsNow(board, command, atMs),
  });
}

function startMove(element: BoardElement, command: PendingMove['command'], { atMs, overMs }: { atMs: number; overMs: number | null }): void {
  element.morphFrom = element.math;
  element.math = transformMathLine(element.math as MathLine, command.tex);
  element.content = { ...(element.content as PlacingCommand & { kind: 'writeMath' }), tex: command.tex };
  element.entrance = moveOver({ from: 0, to: 1, atMs, overMs: overMs ?? REARRANGE_MS });
}

// A move that lands on a running one lets it hurry to its end first, so every glyph starts the new move from where it really is.
function rearrange(board: BoardDraft, element: BoardElement, command: PendingMove['command'], { atMs, overMs }: { atMs: number; overMs: number | null }): void {
  if (element.content.kind !== 'writeMath' || !element.math) return;
  if (!isMoving(element.entrance, atMs)) {
    startMove(element, command, { atMs, overMs });
    return;
  }
  element.entrance = retimeMotion(element.entrance, atMs, Math.min(getMotionEndMs(element.entrance), atMs + HANDOVER_MS));
  board.pendingMoves.set(element.id, { command, landsAtMs: overMs === null ? null : atMs + overMs });
}

function startPendingMoves(board: BoardDraft, upToMs: number): void {
  if (board.isFrozen) return;
  for (const [id, { command, landsAtMs }] of board.pendingMoves) {
    const element = board.elements.get(id);
    const startMs = element ? getMotionEndMs(element.entrance) : upToMs;
    if (startMs > upToMs) continue;
    board.pendingMoves.delete(id);
    if (element) startMove(element, command, { atMs: startMs, overMs: landsAtMs === null ? null : Math.max(landsAtMs - startMs, HANDOVER_MS) });
  }
}

function getAttachedTarget(content: BoardElement['content']): string | null {
  if ('target' in content) return content.target.split('.')[0] as string;
  if ('on' in content) return content.on.split('.')[0] as string;
  return 'over' in content && content.over !== undefined && content.kind === 'plot' ? content.over : null;
}

export function getAttachedElementId(element: BoardElement): ElementId | null {
  return getAttachedTarget(element.content) as ElementId | null;
}

// Attached elements describe what their target showed, so they go when it is removed or replaced by a different command.
function removeAttached(board: BoardDraft, id: ElementId): void {
  for (const element of [...board.elements.values()]) if (element.id !== id && getAttachedTarget(element.content) === id) removeWithAttached(board, element.id);
}

function removeWithAttached(board: BoardDraft, id: ElementId): void {
  board.elements.delete(id);
  board.pendingMoves.delete(id);
  if (board.focus?.split('.')[0] === id) board.focus = null;
  removeAttached(board, id);
}

function getLiveSliders(board: BoardDraft): Slider[] {
  return [...board.elements.values()].flatMap(({ content }) => (content.kind === 'slider' ? [content] : []));
}

// A slider on a constant its curve does not use is refused too, so the tutor hears about it.
function isConstantInCurve(board: BoardDraft, slider: Slider): boolean {
  const curve = board.elements.get(slider.target)?.content;
  if (!('constant' in slider) || curve?.kind !== 'plot') return true;
  const isDeclared = curve.constants?.some(({ name }) => name === slider.constant) === true;
  return isDeclared && new RegExp(`\\b${slider.constant}\\b`).test(curve.expression);
}

function applyCommand(board: BoardDraft, command: SceneCommand, { atMs, overMs, catalog }: { atMs: number; overMs: number | null; catalog: SceneCatalog }): void {
  switch (command.kind) {
    case 'clearBoard':
      board.elements.clear();
      board.pendingMoves.clear();
      board.focus = null;
      board.refusedSliders = [];
      return;
    case 'hide':
      removeWithAttached(board, command.target);
      return;
    case 'focus':
      board.focus = command.target;
      return;
    case 'transformMath': {
      const element = board.elements.get(command.target);
      if (element) rearrange(board, element, command, { atMs, overMs });
      return;
    }
    case 'runSimulation': {
      const element = board.elements.get(command.target);
      if (element) runScene(element, command, { atMs, overMs });
      return;
    }
    case 'setParameter': {
      const element = board.elements.get(command.target);
      if (element && 'constant' in command) reshapeCurve(element, { constant: command.constant, value: command.value, atMs, overMs, catalog });
      else if (element?.placedScene && 'parameter' in command) setSceneParameter(element, { parameter: command.parameter, value: command.value, atMs, keepsMoving: isMoving(element.placedScene.playhead, atMs), catalog });
      return;
    }
    case 'reveal': {
      const element = board.elements.get(command.target);
      if (!element) return;
      const from = element.revealedUpTo ? getMotionValue(element.revealedUpTo, atMs) : getRevealStart(element.content);
      const isCurve = element.content.kind === 'plot';
      const to = isCurve ? Math.min(command.upTo, (element.content as PlacingCommand & { kind: 'plot' }).domain[1]) : command.upTo;
      element.revealedUpTo = moveOver({ from, to, atMs, overMs: overMs ?? (isCurve ? CURVE_DRAWING_MS : 0) });
      return;
    }
    case 'slider':
      if (getOverlappingSlider(command, getLiveSliders(board)) || !isConstantInCurve(board, command)) board.refusedSliders.push(command);
      else place(board, command, { atMs, overMs, catalog });
      return;
    default:
      place(board, command, { atMs, overMs, catalog });
  }
}

function reaimCommand(board: BoardDraft, { atMs, command, landsAtMs }: BoardOperation & { kind: 'reaim' }): void {
  const targetId = 'id' in command ? command.id : 'target' in command ? (command.target as ElementId) : null;
  const element = targetId === null ? undefined : board.elements.get(targetId);
  if (!element) return;
  const pending = board.pendingMoves.get(element.id);
  if (pending?.command === command) {
    pending.landsAtMs = landsAtMs;
    return;
  }
  if (command.kind === 'runSimulation' && element.placedScene) element.placedScene.playhead = retimeMotion(element.placedScene.playhead, atMs, landsAtMs);
  else if (command.kind === 'reveal' && element.revealedUpTo) element.revealedUpTo = retimeMotion(element.revealedUpTo, atMs, landsAtMs);
  else if (command.kind !== 'runSimulation' && command.kind !== 'reveal') element.entrance = retimeMotion(element.entrance, atMs, landsAtMs);
}

function addInk(board: BoardDraft, operation: BoardOperation & { kind: 'inkStroke' }): void {
  const existing = board.elements.get(operation.id);
  if (existing && existing.content.kind !== 'ink') return;
  const points = existing?.content.kind === 'ink' ? [...existing.content.points, ...operation.points] : operation.points;
  board.elements.set(operation.id, { id: operation.id, placedAtMs: existing?.placedAtMs ?? operation.atMs, content: { kind: 'ink', points }, entrance: holdMotion(1, operation.atMs), placedScene: null, revealedUpTo: null, math: null, morphFrom: null, ghostScene: null, targetSecondsWhenPlaced: null });
}

interface ReduceContext {
  operations: readonly BoardOperation[];
  catalog: SceneCatalog;
}

function applyOperation(board: BoardDraft, operation: BoardOperation, { operations, catalog }: ReduceContext): void {
  const { atMs } = operation;
  startPendingMoves(board, atMs);
  switch (operation.kind) {
    case 'beatStarted':
      unfreeze(board, atMs);
      return;
    case 'command':
      applyCommand(board, operation.command, { atMs, overMs: operation.overMs, catalog });
      return;
    case 'reaim':
      reaimCommand(board, operation);
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
      board.pendingMoves = before.pendingMoves;
      board.refusedSliders = before.refusedSliders;
      freeze(board, [], operation.toMs);
    }
  }
}

function isReplacedByNext(operation: BoardOperation, next: BoardOperation | undefined, atMs: number): boolean {
  return operation.kind === 'parameterSample' && next?.kind === 'parameterSample' && next.atMs <= atMs && next.target === operation.target && next.parameter === operation.parameter;
}

function reduce(operations: readonly BoardOperation[], context: ReduceContext, atMs: number): BoardDraft {
  const board: BoardDraft = { elements: new Map(), focus: null, isFrozen: false, pendingMoves: new Map(), refusedSliders: [] };
  for (const [index, operation] of operations.entries()) {
    if (operation.atMs > atMs) break;
    if (!isReplacedByNext(operation, operations[index + 1], atMs)) applyOperation(board, operation, context);
  }
  startPendingMoves(board, atMs);
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
      terms: element.math?.terms.map((term) => `${term.id}:${term.tex}`),
      morphFrom: element.morphFrom?.tex,
      drawn: round(getMotionValue(element.entrance, atMs)),
      sceneSeconds: element.placedScene ? round(getMotionValue(element.placedScene.playhead, atMs)) : undefined,
      sceneValues: element.placedScene?.parameterChanges,
      revealedUpTo: element.revealedUpTo ? round(getMotionValue(element.revealedUpTo, atMs)) : undefined,
    })),
  };
}
