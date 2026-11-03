import type { SceneCommand } from './scene-command.ts';

export type BoardElementKind = SceneCommand['kind'] | 'ink';

/** A Map, so a name can never reach Object.prototype. */
export type BoardKinds = ReadonlyMap<string, BoardElementKind>;

const REQUIRED_KINDS: Partial<Record<SceneCommand['kind'], readonly BoardElementKind[]>> = {
  transformMath: ['writeMath'],
  markValue: ['plot', 'numberLine'],
  construct: ['geometry'],
  runSimulation: ['simulate'],
  setParameter: ['simulate'],
  trackVector: ['simulate'],
  slider: ['simulate'],
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

export function getBoardProblem(command: SceneCommand, board: BoardKinds): string | null {
  const element = getReferencedElement(command);
  if (element === undefined) return null;
  const elementKind = board.get(element);
  if (elementKind === undefined) return `${command.kind} names ${element}, which is not on the board`;
  const requiredKinds = REQUIRED_KINDS[command.kind];
  if (requiredKinds === undefined || requiredKinds.includes(elementKind)) return null;
  return `${command.kind} needs ${requiredKinds.join(' or ')}, but ${element} is a ${elementKind}`;
}

/** Reusing a live id replaces that element in place. */
export function getBoardAfter(command: SceneCommand, board: BoardKinds): BoardKinds {
  if (command.kind === 'clearBoard') return new Map();
  const after = new Map(board);
  if (command.kind === 'hide') after.delete(command.target);
  if ('id' in command) after.set(command.id, command.kind);
  return after;
}
