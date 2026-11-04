import { getBoardAfter, getBoardProblem, parseSceneCommand, type BoardKinds, type SceneCommand } from '@astra/contracts';
import type { BoardOperation } from '../src/player/board-operations.ts';

export const SUBJECTS = ['math', 'physics', 'language', 'history', 'biology', 'code', 'music', 'mixed', 'hostile'] as const;
export type Subject = (typeof SUBJECTS)[number];

/** One scripted board. Commands stay raw, so each one goes through the tutor's parser. */
export interface DeckScene {
  name: string;
  subject: Subject;
  commands: readonly unknown[];
  expectedProblems?: readonly string[];
  msBetweenCommands?: number;
}

const MS_BETWEEN_COMMANDS = 700;
const MS_TO_REST = 4000;
const MOMENTS_AFTER_EACH_COMMAND = [40, 180, 400];

const refuse = (scene: DeckScene, index: number, problem: string) => new Error(`deck scene ${scene.name}, command ${index}: ${problem}`);

export function getSceneCommands(scene: DeckScene): SceneCommand[] {
  let board: BoardKinds = new Map();
  return scene.commands.map((raw, index) => {
    const parsed = parseSceneCommand(raw);
    if (!parsed.ok) throw refuse(scene, index, parsed.problem);
    const problem = getBoardProblem(parsed.value, board);
    if (problem !== null) throw refuse(scene, index, problem);
    board = getBoardAfter(parsed.value, board);
    return parsed.value;
  });
}

const getSpacing = ({ msBetweenCommands = MS_BETWEEN_COMMANDS }: DeckScene) => msBetweenCommands;

export function getSceneOperations(scene: DeckScene): BoardOperation[] {
  return getSceneCommands(scene).map((command, index) => ({ kind: 'command', atMs: index * getSpacing(scene), overMs: null, command }));
}

export const getSceneRestMs = (scene: DeckScene) => (scene.commands.length - 1) * getSpacing(scene) + MS_TO_REST;

export function getSceneMoments(scene: DeckScene): number[] {
  return [...scene.commands.flatMap((_, index) => MOMENTS_AFTER_EACH_COMMAND.map((after) => index * getSpacing(scene) + after)), getSceneRestMs(scene)];
}
