import type { BeatId, ElementId } from './ids.ts';
import type { SceneCommand } from './scene-command.ts';

/** A stream reader must close a beat before it passes these. */
export const BEAT_LIMITS = { words: 60, characters: 600, commands: 12 } as const;

const FEWEST_OVER_WORDS = 1;

/** One spoken phrase with its drawings written inside it. A command belongs to the word after it. */
export interface Beat {
  id: BeatId;
  script: (string | SceneCommand)[];
  /** The tutor then waits at least 8 seconds (PRD T5). */
  expectsReply: boolean;
}

export interface Cue {
  /** Counts from 0. */
  atWord: number;
  command: SceneCommand;
}

/** Where a cut left one element, which stays there until the board unfreezes. */
export type FrozenFrame = { target: ElementId } & (
  /** The simulation's own time at the frozen frame. */
  | { simulationSeconds: number }
  /** A `reveal` cut while `overWords` ran, in the same unit as `reveal.upTo`. */
  | { revealedUpTo: number }
  /** A drawing or anything else cut during its entrance, from 0 to 1. */
  | { drawnFraction: number }
);

export function getSpokenWords(text: string): string[] {
  return text.split(/\s+/).filter((word) => word !== '');
}

export function getScriptText(script: Beat['script']): string {
  return script.filter((part) => typeof part === 'string').join('');
}

export function getBeatText(beat: Beat): string {
  return getSpokenWords(getScriptText(beat.script)).join(' ');
}

/** A command belongs to the next word. Inside a word it belongs to that word, and at the end to the last word. */
export function getCues(beat: Beat): Cue[] {
  const text = getScriptText(beat.script);
  const lastWord = getSpokenWords(text).length - 1;
  const cues: Cue[] = [];
  let textSoFar = '';
  for (const part of beat.script) {
    if (typeof part === 'string') {
      textSoFar += part;
      continue;
    }
    const isInsideWord = /\S$/.test(textSoFar) && /^\S/.test(text.slice(textSoFar.length));
    const nextWord = getSpokenWords(textSoFar).length - (isInsideWord ? 1 : 0);
    cues.push({ atWord: Math.min(nextWord, lastWord), command: part });
  }
  return cues;
}

/** A late cue that never fired is not played, even if its word was. */
export function getPlayedCues(beat: Beat, firedCues: number): Cue[] {
  return getCues(beat).slice(0, firedCues);
}

function getWordOffset(text: string, word: number): number {
  return [...text.matchAll(/\S+/g)][word]?.index ?? text.length;
}

function mergeAdjacentText(script: Beat['script']): Beat['script'] {
  return script.reduce<Beat['script']>((merged, part) => {
    const last = merged.at(-1);
    if (typeof part === 'string' && typeof last === 'string') return [...merged.slice(0, -1), last + part];
    return [...merged, part];
  }, []);
}

export interface ScriptCut {
  fromWord: number;
  firedCues: number;
}

/** A command that fired never fires twice, and a late one still can. */
export function getScriptFromWord(beat: Beat, { fromWord, firedCues }: ScriptCut): Beat['script'] {
  const keptTextStart = getWordOffset(getScriptText(beat.script), fromWord);
  const rest: Beat['script'] = [];
  let textOffset = 0;
  let commandIndex = 0;
  for (const part of beat.script) {
    if (typeof part === 'string') {
      rest.push(part.slice(Math.max(keptTextStart - textOffset, 0)));
      textOffset += part.length;
    } else {
      if (commandIndex >= firedCues) rest.push(part);
      commandIndex += 1;
    }
  }
  return mergeAdjacentText(rest.filter((part) => part !== ''));
}

export interface ResumeCut extends ScriptCut {
  frozen: readonly FrozenFrame[];
}

// The words said since the cue have used up that much of its `overWords`.
function getRemainderOfCue({ atWord, command }: Cue, fromWord: number): SceneCommand {
  if (!('overWords' in command) || command.overWords === undefined) return command;
  const wordsSaid = Math.max(fromWord - atWord, 0);
  return { ...command, overWords: Math.max(command.overWords - wordsSaid, FEWEST_OVER_WORDS) };
}

function isPlayOf(command: SceneCommand, target: ElementId): boolean {
  return command.kind === 'runSimulation' && command.action === 'play' && command.target === target;
}

function isRevealOf(command: SceneCommand, target: ElementId): boolean {
  return command.kind === 'reveal' && command.target === target;
}

function getUnfreezeCommands(frame: FrozenFrame, { firedCues, fromWord }: { firedCues: Cue[]; fromWord: number }): SceneCommand[] {
  if ('drawnFraction' in frame) return [];
  const { target } = frame;
  const isMotion = 'simulationSeconds' in frame;
  const matches = firedCues.filter(({ command }) => (isMotion ? isPlayOf(command, target) : isRevealOf(command, target)));
  const lastCue = matches.at(-1);
  if (lastCue !== undefined) return [getRemainderOfCue(lastCue, fromWord)];
  return isMotion ? [{ kind: 'runSimulation', target, action: 'play' }] : [];
}

/** The rest of a cut beat, led by what sets its frozen elements moving again, because no later cue would. */
export function getResumeScript(beat: Beat, { fromWord, firedCues, frozen }: ResumeCut): Beat['script'] {
  const fired = getPlayedCues(beat, firedCues);
  const unfreezing = frozen.flatMap((frame) => getUnfreezeCommands(frame, { firedCues: fired, fromWord }));
  return [...unfreezing, ...getScriptFromWord(beat, { fromWord, firedCues })];
}
