import { type SceneCommand, SIMULATION_MOMENTS } from './scene-command.ts';
import type { StudentAction } from './session-event.ts';

export type BoardElementKind = SceneCommand['kind'] | 'ink';

/** A Map, so a name can never reach Object.prototype. */
export type BoardKinds = ReadonlyMap<string, BoardElementKind>;

const REQUIRED_KINDS: Partial<Record<SceneCommand['kind'], readonly BoardElementKind[]>> = {
  transformMath: ['writeMath'],
  markValue: ['plot', 'numberLine'],
  shadeArea: ['plot'],
  construct: ['geometry'],
  runSimulation: ['simulate', 'richScene'],
  setParameter: ['simulate'],
  trackVector: ['simulate'],
  ghostPath: ['simulate'],
  reveal: ['plot', 'diagram', 'table', 'timeline', 'code'],
  plot: ['plot'],
  simulate: ['drawing'],
};

function getReferencedElement(command: SceneCommand): string | undefined {
  if ('target' in command) return command.target.split('.')[0];
  if ('on' in command) return command.on.split('.')[0];
  return 'over' in command ? command.over : undefined;
}

function isBadRevealCount(command: SceneCommand, elementKind: BoardElementKind): boolean {
  return command.kind === 'reveal' && elementKind !== 'plot' && (!Number.isInteger(command.upTo) || command.upTo < 0);
}

function getRequiredKinds(command: SceneCommand): readonly BoardElementKind[] | undefined {
  if (command.kind === 'slider') return 'constant' in command ? ['plot'] : ['simulate'];
  if (command.kind === 'highlight' && command.tex !== undefined) return ['writeMath'];
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

export function getBoardProblem(command: SceneCommand, board: BoardKinds): string | null {
  const element = getReferencedElement(command);
  if (element === undefined) return null;
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
  return after;
}
