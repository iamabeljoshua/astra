import { type Beat, type BeatPlayed, getBeatText, getSpokenWords, parseBeat, parseSessionEvent, type SessionEvent, type SessionEventBody } from '@astra/contracts';
import { describe, expect, it } from 'vitest';
import type { FigureWords } from '../src/figure/figure-input.ts';
import { getFigureMarks } from '../src/figure/get-figure-marks.ts';
import type { BoardOperation } from '../src/player/board-operations.ts';
import { type BoardState, getBoardAt, getFrozenFrames } from '../src/player/board-state.ts';
import { rebuildBoard } from '../src/player/rebuild-board.ts';
import { getAnchorPoint } from '../src/sketch/sketch-layout.ts';
import { getPiecePose, getStrokePoints } from '../src/sketch/sketch-pieces.ts';

const WORD_MS = 300;
const WORDS = { readouts: {}, parameters: {}, metres: 'm', degrees: '°', tooFine: '', slope: '' } as unknown as FigureWords;
const piece = (id: string, target: string, fields: Record<string, unknown>) => ({ kind: 'drawShape', id, target, ...fields });
const command = (atMs: number, value: object, overMs: number | null = null) => ({ kind: 'command', atMs, command: value, overMs }) as unknown as BoardOperation;

const TABLE = [
  command(0, { kind: 'sketch', id: 'desk' }),
  command(100, piece('floor', 'desk', { shape: 'ground' })),
  command(200, piece('table', 'desk', { shape: 'table', on: 'floor', side: 'left' })),
  command(300, piece('ball', 'desk', { shape: 'ball', size: 'small', on: 'table', side: 'left' })),
];
const ROLL_AT_MS = 1000;
const ROLL_OVER_MS = 2000;
const ROLLING = [...TABLE, command(ROLL_AT_MS, { kind: 'animate', target: 'ball', motion: 'rollOff' }, ROLL_OVER_MS)];

const poseAt = (operations: BoardOperation[], id: string, atMs: number) => getPiecePose(getBoardAt(operations, atMs).elements, id as never, atMs);
const boxOf = (board: BoardState, id: string) => board.elements.get(id as never)?.piece?.box;

describe('placing pieces of a sketch', () => {
  it('sits a ball on the table top and the table on the floor', () => {
    const board = getBoardAt(TABLE, 5000);
    const [table, ball] = [boxOf(board, 'table'), boxOf(board, 'ball')];
    expect((table?.y ?? 0) + (table?.height ?? 0) / 2).toBeCloseTo(7.4, 9);
    expect((ball?.y ?? 0) + (ball?.height ?? 0) / 2).toBeGreaterThan((table?.y ?? 0) - (table?.height ?? 0) / 2 - 0.05);
    expect((ball?.y ?? 0) + (ball?.height ?? 0) / 2).toBeLessThan((table?.y ?? 0) - (table?.height ?? 0) / 2 + 0.25);
  });

  it('never moves a piece already drawn when later pieces arrive, or when one it sits on is hidden', () => {
    const before = boxOf(getBoardAt(TABLE, 5000), 'ball');
    const later = [...TABLE, command(400, piece('lamp', 'desk', { shape: 'box', rightOf: 'table' })), command(500, piece('sun', 'desk', { shape: 'sun', at: 'top-right' })), command(600, { kind: 'hide', target: 'table' })];
    expect(boxOf(getBoardAt(later, 5000), 'ball')).toEqual(before);
  });

  it('keeps every piece inside the sketch, wherever the model points it', () => {
    const crowded = [command(0, { kind: 'sketch', id: 'desk' }), ...Array.from({ length: 10 }, (_, index) => command(index + 1, piece(`b${index}`, 'desk', { shape: 'box', size: 'large', ...(index === 0 ? {} : { rightOf: `b${index - 1}`, gap: 'far' }) })))];
    const board = getBoardAt(crowded, 5000);
    for (let index = 0; index < 10; index += 1) {
      const box = boxOf(board, `b${index}`);
      expect((box?.x ?? 0) - (box?.width ?? 0) / 2).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? 0) + (box?.width ?? 0) / 2).toBeLessThanOrEqual(12);
    }
  });
});

describe('a ball rolling off a table', () => {
  it('lands on its word: still before the cue, at rest on the floor past the table when the words run out', () => {
    const start = poseAt(ROLLING, 'ball', ROLL_AT_MS - 1);
    const landed = poseAt(ROLLING, 'ball', ROLL_AT_MS + ROLL_OVER_MS);
    const table = boxOf(getBoardAt(ROLLING, 5000), 'table');
    expect(start?.at).toEqual(poseAt(TABLE, 'ball', 5000)?.at);
    expect(landed?.at.x).toBeGreaterThan((table?.x ?? 0) + (table?.width ?? 0) / 2);
    expect(landed?.at.y).toBeCloseTo(7.4 - 0.3, 6);
    expect(poseAt(ROLLING, 'ball', ROLL_AT_MS + ROLL_OVER_MS + 5000)?.at).toEqual(landed?.at);
  });

  it('falls on one parabola once it leaves the edge, however the words stretch it', () => {
    const table = boxOf(getBoardAt(ROLLING, 5000), 'table');
    const edgeX = (table?.x ?? 0) + (table?.width ?? 0) / 2;
    const flying = Array.from({ length: 60 }, (_, step) => poseAt(ROLLING, 'ball', ROLL_AT_MS + (step / 59) * ROLL_OVER_MS)?.at).filter((at) => at && at.x > edgeX + 0.01) as { x: number; y: number }[];
    const top = poseAt(ROLLING, 'ball', ROLL_AT_MS)?.at.y ?? 0;
    const curvature = flying.map(({ x, y }) => (y - top) / (x - edgeX) ** 2);
    expect(flying.length).toBeGreaterThan(10);
    for (const each of curvature) expect(each).toBeCloseTo(curvature[0] as number, 6);
  });

  it('holds where a cut froze it, in the live board and in a replay of the log', () => {
    const cutAtMs = ROLL_AT_MS + ROLL_OVER_MS / 2;
    const live = getBoardAt([...ROLLING, { kind: 'freeze', atMs: cutAtMs, frames: getFrozenFrames(getBoardAt(ROLLING, cutAtMs), cutAtMs) } as BoardOperation], cutAtMs + 4000);
    expect(getPiecePose(live.elements, 'ball' as never, cutAtMs + 4000)?.at).toEqual(poseAt(ROLLING, 'ball', cutAtMs)?.at);
  });
});

function makeBeat(id: string, script: unknown[]): Beat {
  const parsed = parseBeat({ id, script, expectsReply: false });
  if (!parsed.ok) throw new Error(parsed.problem);
  return parsed.value;
}

function played(beat: Beat, atMs: number): BeatPlayed & { atMs: number } {
  const wordCount = getSpokenWords(getBeatText(beat)).length;
  const wordStartsMs = Array.from({ length: wordCount }, (_, index) => index * WORD_MS);
  const cueWords = beat.script.reduce<{ words: number; cues: number[] }>((sum, part) => (typeof part === 'string' ? { ...sum, words: sum.words + getSpokenWords(part).length } : { ...sum, cues: [...sum.cues, sum.words * WORD_MS] }), { words: 0, cues: [] });
  return { kind: 'beatPlayed', atMs, turnId: 't' as never, beat, wordStartsMs, durationMs: wordCount * WORD_MS, playedWords: wordCount, firedCueMs: cueWords.cues, ending: 'finished', frozen: [], reportedBy: 'browser' };
}

function parseLog(bodies: (SessionEventBody & { atMs: number })[]): SessionEvent[] {
  return bodies.map((body, seq) => {
    const parsed = parseSessionEvent(JSON.parse(JSON.stringify({ seq, ...body })));
    if (!parsed.ok) throw new Error(parsed.problem);
    return parsed.value;
  });
}

describe('a pendulum and a lever, replayed from the session log', () => {
  const pendulum = makeBeat('b1', [
    'Hang a ',
    { kind: 'sketch', id: 'clock' },
    { kind: 'drawShape', id: 'pin', target: 'clock', shape: 'dot', at: 'top' },
    'pin, a ',
    { kind: 'drawShape', id: 'bob', target: 'clock', shape: 'ball', below: 'pin', gap: 'far' },
    'weight, and a ',
    { kind: 'drawShape', id: 'string', target: 'clock', shape: 'line', from: 'pin', to: 'bob' },
    'string. Let it ',
    { kind: 'animate', target: 'bob', motion: 'swing', around: 'pin', overWords: 6 },
    'go and it swings back and forth for ever.',
  ]);
  const log = parseLog([played(pendulum, 1000)]);

  it('keeps the bob on its string, and the string tied to the bob, at every moment of the swing', () => {
    for (let atMs = 1000; atMs < 1000 + 20 * WORD_MS; atMs += 97) {
      const board = rebuildBoard(log, atMs);
      const pin = getPiecePose(board.elements, 'pin' as never, atMs);
      const bob = getPiecePose(board.elements, 'bob' as never, atMs);
      const string = board.elements.get('string' as never);
      if (!pin || !bob || !string) continue;
      const [top, bottom] = getStrokePoints(board.elements, string.content as never, atMs, false);
      expect(Math.hypot((bottom?.x ?? 0) - bob.at.x, (bottom?.y ?? 0) - bob.at.y)).toBeCloseTo(0.5, 6);
      expect(top).toEqual(pin.at);
    }
  });

  it('tips a plank on its pivot until its end touches the floor, carrying the rock on it', () => {
    const lever = [
      command(0, { kind: 'sketch', id: 'seesaw' }),
      command(10, piece('floor', 'seesaw', { shape: 'ground' })),
      command(20, piece('pivot', 'seesaw', { shape: 'triangle', on: 'floor' })),
      command(30, piece('plank', 'seesaw', { shape: 'bar', on: 'pivot' })),
      command(40, piece('rock', 'seesaw', { shape: 'box', size: 'small', on: 'plank', side: 'left' })),
      command(100, { kind: 'animate', target: 'plank', motion: 'tilt', around: 'pivot', toward: 'right' }, 1000),
    ];
    const rest = getBoardAt(lever, 50);
    const tipped = getBoardAt(lever, 2000);
    const pivotTop = { x: boxOf(rest, 'pivot')?.x ?? 0, y: (boxOf(rest, 'pivot')?.y ?? 0) - (boxOf(rest, 'pivot')?.height ?? 0) / 2 };
    const distance = (board: BoardState, id: string, atMs: number) => {
      const at = getPiecePose(board.elements, id as never, atMs)?.at ?? { x: 0, y: 0 };
      return Math.hypot(at.x - pivotTop.x, at.y - pivotTop.y);
    };
    expect(distance(tipped, 'rock', 2000)).toBeCloseTo(distance(rest, 'rock', 50), 9);
    expect(getPiecePose(tipped.elements, 'rock' as never, 2000)?.at.y).toBeLessThan(getPiecePose(rest.elements, 'rock' as never, 50)?.at.y ?? 0);
    const plank = boxOf(rest, 'plank');
    const pose = getPiecePose(tipped.elements, 'plank' as never, 2000);
    expect(plank && pose && getAnchorPoint(plank, pose, 'bottom-right').y).toBeCloseTo(7.4, 9);
  });
});

describe('turning an arrow', () => {
  it('points it the other way after half a turn, about its tail', () => {
    const arrow = [
      command(0, { kind: 'sketch', id: 'walk' }),
      command(10, piece('start', 'walk', { shape: 'dot', at: 'left' })),
      command(20, piece('steps', 'walk', { shape: 'arrow', from: 'start', toward: 'right', length: 'medium' })),
      command(1000, { kind: 'animate', target: 'steps', motion: 'spin', turns: 0.5 }, 600),
    ];
    const tipAt = (atMs: number) => {
      const board = getBoardAt(arrow, atMs);
      const element = [...board.elements.values()].find((each) => each.content.kind === 'sketch');
      const marks = element ? getFigureMarks({ board, element, atMs, width: 620, height: 413, isReducedMotion: false, words: WORDS }) : [];
      const steps = marks.find((mark) => mark.key === 'piece-steps');
      return steps?.kind === 'path' ? { tail: steps.branches[0]?.[0], tip: steps.branches[0]?.at(-1) } : null;
    };
    const before = tipAt(900);
    const after = tipAt(3000);
    expect((after?.tip?.x ?? 0) - (after?.tail?.x ?? 0)).toBeCloseTo(-((before?.tip?.x ?? 0) - (before?.tail?.x ?? 0)), 0);
    expect(after?.tail).toEqual(before?.tail);
  });
});

describe('the sketch on the page', () => {
  const marksAt = (operations: BoardOperation[], atMs: number, isReducedMotion = false) => {
    const board = getBoardAt(operations, atMs);
    const element = [...board.elements.values()].find((each) => each.content.kind === 'sketch');
    if (!element) throw new Error('no sketch');
    return getFigureMarks({ board, element, atMs, width: 620, height: 413, isReducedMotion, words: WORDS });
  };

  it('draws each piece in the pen as its word comes, and never a number that is not finite', () => {
    for (let atMs = 0; atMs < 4000; atMs += 50) expect(JSON.stringify(marksAt(ROLLING, atMs))).not.toMatch(/null|NaN|Infinity/);
    expect(marksAt(ROLLING, 150).map((mark) => mark.key)).not.toContain('piece-ball');
    expect(marksAt(ROLLING, 900).map((mark) => mark.key)).toEqual(expect.arrayContaining(['piece-floor', 'piece-table', 'piece-ball']));
  });

  it('draws a loop of lines that end on each other without hanging, when an id is drawn again', () => {
    const looped = [
      command(0, { kind: 'sketch', id: 'desk' }),
      command(10, piece('a', 'desk', { shape: 'line', from: 'left', to: 'right' })),
      command(20, piece('b', 'desk', { shape: 'line', from: 'a', to: 'top' })),
      command(30, piece('a', 'desk', { shape: 'line', from: 'b', to: 'bottom' })),
    ];
    expect(() => marksAt(looped, 5000)).not.toThrow();
  });

  it('shows the end of a motion at once under reduced motion', () => {
    const trail = (isReduced: boolean) => marksAt(ROLLING, ROLL_AT_MS + 10, isReduced).find((mark) => mark.key === 'trail-ball');
    const landed = marksAt(ROLLING, ROLL_AT_MS + ROLL_OVER_MS + 100).find((mark) => mark.key === 'trail-ball');
    expect(trail(true)).toEqual(landed);
    expect(trail(false)).not.toEqual(landed);
  });
});
