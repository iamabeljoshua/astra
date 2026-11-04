import type { AgentMessage, BrowserMessage, RichScene, SceneCommand, SessionEvent } from '@astra/contracts';
import { parseSessionEvent } from '@astra/contracts';
import { describe, expect, it } from 'vitest';
import { getBoardAt, getFrozenFrames, getSceneFrame } from '../src/player/board-state.ts';
import type { BoardOperation } from '../src/player/board-operations.ts';
import { PLANNED_SCENES } from '../src/player/planned-scenes.ts';
import { rebuildBoard } from '../src/player/rebuild-board.ts';
import { guardSceneCatalog, type Scene } from '../src/player/scene.ts';
import { createTakeScene, type TakeFrame } from '../src/player/take-scene.ts';
import { beatId, createFakeAudio, elementId, THREE_WORDS, turnId } from './fake-audio.ts';

const SCENE = { kind: 'richScene', id: elementId('slope'), engine: 'manimgx', sceneId: 'slope-1a2b', moments: { secant: 4, tangent: 10 }, parts: ['curve'], durationSeconds: 20 } as const satisfies RichScene;
const place = (atMs: number): BoardOperation => ({ kind: 'command', atMs, command: SCENE, overMs: null });
const play = (atMs: number, until: string | number | undefined, overMs: number): BoardOperation => ({ kind: 'command', atMs, command: { kind: 'runSimulation', target: elementId('slope'), action: 'play', ...(until === undefined ? {} : { until }) }, overMs });

const getTakeSeconds = (operations: BoardOperation[], atMs: number) => {
  const element = getBoardAt(operations, atMs).elements.get(elementId('slope'));
  return (element && (getSceneFrame(element, atMs) as TakeFrame).takeSeconds) ?? null;
};

describe('a stored take as a scene', () => {
  it('gives the same frame at any seek point, in any order', () => {
    const scene = createTakeScene(SCENE);
    const seeks = [7.5, 0, 19.25, 7.5, 3, 7.5];
    expect(seeks.map((seconds) => scene.getFrame(seconds).takeSeconds)).toEqual(seeks);
  });

  it('holds its first and last frame past either end', () => {
    const scene = createTakeScene(SCENE);
    expect(scene.getFrame(-1).takeSeconds).toBe(0);
    expect(scene.getFrame(99).takeSeconds).toBe(20);
  });
});

describe('a stored take on the board clock', () => {
  it('starts paused on its first frame, then reaches each moment on its word', () => {
    const operations = [place(0), play(1000, 'secant', 2000), play(3000, 'tangent', 3000)];
    expect(getTakeSeconds(operations, 500)).toBe(0);
    expect(getTakeSeconds(operations, 3000)).toBe(4);
    expect(getTakeSeconds(operations, 6000)).toBe(10);
  });

  it('holds where it is on a moment it does not own, and never reads the prototype', () => {
    const operations = [place(0), play(0, 'secant', 1000), play(1000, 'constructor', 1000), play(2000, 'not-a-moment', 1000)];
    expect(getTakeSeconds(operations, 3000)).toBe(4);
  });

  it('starts over on a play to a moment it has passed, because time does not run backward', () => {
    const operations = [place(0), play(0, 'tangent', 1000), play(2000, 'secant', 2000)];
    expect(getTakeSeconds(operations, 2000)).toBe(0);
    expect(getTakeSeconds(operations, 4000)).toBe(4);
  });

  it('plays to its end when no moment is named', () => {
    expect(getTakeSeconds([place(0), play(0, undefined, 2000)], 2000)).toBe(20);
  });

  it('freezes on a stop and reports that second, so a replay holds the same frame', () => {
    const operations = [place(0), play(0, 'secant', 2000)];
    const frames = getFrozenFrames(getBoardAt(operations, 1000), 1000);
    expect(frames).toContainEqual({ target: 'slope', simulationSeconds: 2 });
    const frozen: BoardOperation[] = [...operations, { kind: 'freeze', atMs: 1000, frames }];
    expect(getTakeSeconds(frozen, 1000)).toBe(2);
    expect(getTakeSeconds(frozen, 9000)).toBe(2);
  });
});

describe('the catalog boundary', () => {
  const FLIGHT: SceneCommand = { kind: 'simulate', id: elementId('shot'), simulation: { model: 'projectile', parameters: { horizontalSpeed: 1, upwardSpeed: 1, releaseHeight: 1, gravity: 9.8 } } };

  it('makes a scene once per command, because the board rebuilds every frame', () => {
    let made = 0;
    const catalog = guardSceneCatalog((command) => {
      made += 1;
      return command.kind === 'richScene' ? createTakeScene(command) : null;
    });
    const operations = [place(0), play(0, 'tangent', 5000)];
    for (let atMs = 0; atMs < 600; atMs += 16) getBoardAt(operations, atMs, catalog);
    expect(made).toBe(1);
  });

  it('keeps only the last values of a long drag, because a curve holds every sample it drew', () => {
    let made = 0;
    const catalog = guardSceneCatalog(() => {
      made += 1;
      return createTakeScene({ kind: 'richScene', id: elementId('slope'), engine: 'manimgx', sceneId: 'a' as never, moments: {}, parts: [], durationSeconds: 1 });
    });
    for (let value = 0; value <= 48; value += 1) catalog(FLIGHT, { speed: value });
    const madeInTheDrag = made;
    catalog(FLIGHT, { speed: 48 });
    expect(made).toBe(madeInTheDrag);
    catalog(FLIGHT, { speed: 0 });
    expect(made).toBe(madeInTheDrag + 1);
  });

  it('makes a new scene when a parameter changes', () => {
    let made = 0;
    const catalog = guardSceneCatalog((command, changes) => {
      made += 1;
      return PLANNED_SCENES(command, changes);
    });
    catalog(FLIGHT, {});
    catalog(FLIGHT, {});
    catalog(FLIGHT, { gravity: 1.6 });
    expect(made).toBe(2);
  });

  it('leaves the element still when a catalog throws, even during a stop', () => {
    const catalog = guardSceneCatalog(() => {
      throw new Error('a bad scene');
    });
    const board = getBoardAt([place(0), play(0, 'tangent', 5000)], 1000, catalog);
    expect(board.elements.get(elementId('slope'))?.placedScene).toBeNull();
    expect(getFrozenFrames(board, 1000)).toEqual([]);
  });

  it.each([
    ['a NaN length', { parts: [], moments: {}, durationSeconds: Number.NaN, getFrame: () => null }],
    ['an endless length', { parts: [], moments: {}, durationSeconds: Number.POSITIVE_INFINITY, getFrame: () => null }],
    ['a NaN moment', { parts: [], moments: { a: Number.NaN }, durationSeconds: 3, getFrame: () => null }],
  ] satisfies [string, Scene][])('refuses a scene with %s', (_name, scene) => {
    expect(guardSceneCatalog(() => scene)(SCENE, {})).toBeNull();
  });
});

describe('a stored take through the player', () => {
  const TURN = turnId('turn-1');
  const BEAT = beatId('beat-1');
  const cue = (atWord: number, command: SceneCommand): AgentMessage => ({ type: 'cue', turnId: TURN, beatId: BEAT, atWord, command });

  it('plays live, stops on a stop, and rebuilds from the log to the same second', () => {
    const audio = createFakeAudio();
    audio.receive({ type: 'turnStarted', turnId: TURN }, cue(0, SCENE), cue(0, { kind: 'runSimulation', target: elementId('slope'), action: 'play', until: 'secant', overWords: 2 }), { type: 'words', turnId: TURN, beatId: BEAT, firstWord: 0, words: THREE_WORDS }, { type: 'beatClosed', turnId: TURN, beatId: BEAT, wordCount: 3, expectsReply: false });
    audio.startSound();
    audio.advance(250);
    audio.receive({ type: 'stop', turnId: TURN });
    const stoppedAtMs = audio.getNowMs();
    const live = audio.player.getBoard(stoppedAtMs + 2000).elements.get(elementId('slope'));
    const liveSeconds = (getSceneFrame(live as NonNullable<typeof live>, stoppedAtMs + 2000) as TakeFrame).takeSeconds;
    expect(liveSeconds).toBeGreaterThan(0);
    expect(liveSeconds).toBeLessThan(4);
    const report = audio.sent.find((message): message is BrowserMessage & { type: 'played' } => message.type === 'played');
    const event = parseSessionEvent({ seq: 0, atMs: stoppedAtMs - (report?.durationMs ?? 0), kind: 'beatPlayed', reportedBy: 'browser', turnId: TURN, beat: { id: BEAT, script: [SCENE, { kind: 'runSimulation', target: 'slope', action: 'play', until: 'secant', overWords: 2 }, 'One two three.'], expectsReply: false }, wordStartsMs: report?.wordStartsMs, durationMs: report?.durationMs, playedWords: report?.playedWords, firedCueMs: report?.firedCueMs, ending: report?.ending, frozen: report?.frozen });
    expect(event.ok).toBe(true);
    const replay = rebuildBoard([(event as { value: SessionEvent }).value], stoppedAtMs + 2000).elements.get(elementId('slope'));
    expect((getSceneFrame(replay as NonNullable<typeof replay>, stoppedAtMs + 2000) as TakeFrame).takeSeconds).toBeCloseTo(liveSeconds, 3);
  });
});

describe('clearing the board with a scene on it', () => {
  const command = (atMs: number, sceneCommand: SceneCommand): BoardOperation => ({ kind: 'command', atMs, command: sceneCommand, overMs: null });
  const CLEAR = { kind: 'clearBoard' } as SceneCommand;
  const TEACH = { kind: 'boardMode', mode: 'teach' } as SceneCommand;
  const NOTE = { kind: 'text', id: elementId('note'), text: 'n' } as SceneCommand;

  it('sends the working away and keeps the scene, in the corner', () => {
    const board = getBoardAt([place(0), command(100, NOTE), command(200, CLEAR)], 300);
    expect([...board.elements.keys()]).toEqual([elementId('slope')]);
    expect(board.stage).toEqual({ mode: 'handsOn', sinceMs: 100 });
    expect(getBoardAt([place(0), command(200, CLEAR)], 300).stage).toEqual({ mode: 'handsOn', sinceMs: 200 });
  });

  it('never brings that scene back big, because the tutor may have moved to another topic', () => {
    const board = getBoardAt([place(0), command(200, CLEAR), command(300, TEACH)], 400);
    expect(board.stage?.mode).toBe('handsOn');
  });

  it('lets a new scene come big, and rebuilds the same from the log', () => {
    const NEXT = { ...SCENE, id: elementId('next'), sceneId: 'next-1a2b' } as SceneCommand;
    const board = getBoardAt([place(0), command(200, CLEAR), command(300, NEXT), command(300, TEACH)], 400);
    expect(board.stage).toEqual({ mode: 'teach', sinceMs: 300 });
    expect(getBoardAt([place(0), command(200, CLEAR), command(300, NEXT), command(300, TEACH)], 400).stage).toEqual(board.stage);
  });

  it('clears as before with no scene', () => {
    const board = getBoardAt([command(100, NOTE), command(200, CLEAR), command(300, TEACH)], 400);
    expect(board.elements.size).toBe(0);
    expect(board.stage?.mode).toBe('teach');
  });
});
