import { getSpeedPairs, type SceneCommand, SIMULATION_MOMENTS, SKETCH_SPOTS, type Slider, type Task } from './scene-command.ts';
import type { StudentAction } from './session-event.ts';

export type BoardElementKind = SceneCommand['kind'] | 'ink' | 'studentLine';

/** A Map, so a name can never reach Object.prototype. */
export type BoardKinds = ReadonlyMap<string, BoardElementKind>;

const REQUIRED_KINDS: Partial<Record<SceneCommand['kind'], readonly BoardElementKind[]>> = {
  transformMath: ['writeMath'],
  markValue: ['plot', 'numberLine'],
  shadeArea: ['plot'],
  construct: ['geometry'],
  drawShape: ['sketch'],
  animate: ['drawShape'],
  runSimulation: ['simulate', 'richScene'],
  trackVector: ['simulate'],
  readout: ['simulate'],
  ghostPath: ['simulate'],
  reveal: ['plot', 'diagram', 'table', 'timeline', 'code'],
  plot: ['plot'],
  simulate: ['drawing'],
  tangent: ['plot'],
};

const TASK_TARGET_KINDS: Readonly<Record<Task['way'], readonly BoardElementKind[]>> = {
  write: ['writeMath', 'studentLine'],
  pick: ['writeMath', 'studentLine', 'diagram'],
  place: [],
  drag: ['plot'],
};

function getReferencedElement(command: SceneCommand): string | undefined {
  if ('target' in command) return command.target.split('.')[0];
  if ('on' in command) return command.on?.split('.')[0];
  return 'over' in command ? command.over : undefined;
}

function isBadRevealCount(command: SceneCommand, elementKind: BoardElementKind): boolean {
  return command.kind === 'reveal' && elementKind !== 'plot' && (!Number.isInteger(command.upTo) || command.upTo < 0);
}

function getRequiredKinds(command: SceneCommand): readonly BoardElementKind[] | undefined {
  if (command.kind === 'slider' || command.kind === 'setParameter') return 'constant' in command ? ['plot'] : ['simulate'];
  if (command.kind === 'task') return TASK_TARGET_KINDS[command.way];
  if (command.kind === 'highlight' && command.tex !== undefined) return ['writeMath', 'studentLine'];
  return REQUIRED_KINDS[command.kind];
}

function getNamedMoment(command: SceneCommand): string | null {
  if (command.kind !== 'runSimulation') return null;
  const point = command.action === 'play' ? command.until : command.action === 'seek' ? command.to : undefined;
  return typeof point === 'string' ? point : null;
}

function isUnknownSimulationMoment(command: SceneCommand, elementKind: BoardElementKind): boolean {
  const moment = getNamedMoment(command);
  return moment !== null && elementKind === 'simulate' && !(SIMULATION_MOMENTS as readonly string[]).includes(moment);
}

const MOTION_ANCHOR_FIELDS: ReadonlySet<string> = new Set(['path', 'around']);
const END_FIELDS: ReadonlySet<string> = new Set(['from', 'to', 'through']);
const SPOTS: ReadonlySet<string> = new Set(SKETCH_SPOTS);

function getLeanedOnPieces(command: SceneCommand): { field: string; piece: string }[] {
  if (command.kind !== 'drawShape' && command.kind !== 'animate') return [];
  return Object.entries(command).flatMap(([field, value]) => {
    if (MOTION_ANCHOR_FIELDS.has(field) && typeof value === 'string') return [{ field, piece: value }];
    if (!END_FIELDS.has(field)) return [];
    return [value].flat().flatMap((end) => (typeof end === 'string' && !SPOTS.has(end) ? [{ field, piece: end.split('.')[0] as string }] : []));
  });
}

function getSketchProblem(command: SceneCommand, board: BoardKinds): string | null {
  const missing = getLeanedOnPieces(command).find(({ piece }) => board.get(piece) !== 'drawShape');
  if (missing === undefined) return null;
  if (board.get(missing.piece) === 'sketch') return `${missing.field} names ${missing.piece}, the sketch itself, so put the piece at a spot instead, as in "at":"left"`;
  return `${command.kind} leans on ${missing.piece}, which is not a piece of a sketch on the board`;
}

export function getBoardProblem(command: SceneCommand, board: BoardKinds): string | null {
  const element = getReferencedElement(command);
  if (element === undefined) return null;
  const sketchProblem = getSketchProblem(command, board);
  if (sketchProblem !== null) return sketchProblem;
  const elementKind = board.get(element);
  if (elementKind === undefined) return `${command.kind} names ${element}, which is not on the board`;
  const requiredKinds = getRequiredKinds(command);
  if (requiredKinds !== undefined && !requiredKinds.includes(elementKind)) return `${command.kind} needs ${requiredKinds.join(' or ')}, but ${element} is a ${elementKind}`;
  if (isUnknownSimulationMoment(command, elementKind)) return `${element} is a simulation with the moments ${SIMULATION_MOMENTS.join(', ')}`;
  return isBadRevealCount(command, elementKind) ? `reveal needs a whole count on a ${elementKind}` : null;
}

/** Reusing a live id replaces that element in place. */
export function getBoardAfter(command: SceneCommand, board: BoardKinds): BoardKinds {
  if (command.kind === 'clearBoard') return new Map();
  const after = new Map(board);
  if (command.kind === 'hide') after.delete(command.target);
  if ('id' in command) after.set(command.id, command.kind);
  return after;
}

/** A student adds and removes only their own ink, so a stroke or an erase naming a tutor's element leaves it alone. */
export function getBoardAfterAction(action: StudentAction, board: BoardKinds): BoardKinds {
  const after = new Map(board);
  if (action.action === 'inkStroke' && !board.has(action.id)) after.set(action.id, 'ink');
  if (action.action === 'inkErased' && board.get(action.target) === 'ink') after.delete(action.target);
  if (action.action === 'worked' && action.work.way === 'write' && !board.has(action.work.id)) after.set(action.work.id, 'studentLine');
  return after;
}

/** The live slider on the same flight that sets this slider's speed in the other pair, if any. */
export function getOverlappingSlider(slider: Slider, live: readonly Slider[]): Slider | null {
  if (!('parameter' in slider)) return null;
  const other = getSpeedPairs(slider.parameter)?.other ?? [];
  return live.find((each) => each.id !== slider.id && each.target === slider.target && 'parameter' in each && other.includes(each.parameter)) ?? null;
}
