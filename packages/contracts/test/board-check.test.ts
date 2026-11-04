import { describe, expect, it } from 'vitest';
import {
  type BoardElementKind,
  type BoardKinds,
  getBoardAfter,
  getBoardAfterAction,
  getBoardProblem,
  getCues,
  SCENE_COMMAND_KINDS,
  type SceneCommand,
  type StudentAction,
} from '../src/index.ts';
import { commandOrThrow, makeBeat, parseOrThrow } from './helpers.ts';

const ALL_KINDS: BoardElementKind[] = [...SCENE_COMMAND_KINDS, 'ink'];
const SIMULATION = { model: 'projectile', parameters: { horizontalSpeed: 4, upwardSpeed: 5, releaseHeight: 2 } };

const NEEDS_A_KIND: [string, unknown, BoardElementKind[]][] = [
  ['transformMath', { kind: 'transformMath', target: 'a', tex: 'x' }, ['writeMath']],
  ['markValue', { kind: 'markValue', id: 'm', target: 'a', at: 1 }, ['plot', 'numberLine']],
  ['shadeArea', { kind: 'shadeArea', id: 'm', target: 'a', from: 0, to: 1 }, ['plot']],
  ['highlight.tex', { kind: 'highlight', id: 'm', target: 'a', tex: 'x' }, ['writeMath', 'studentLine']],
  ['slider.constant', { kind: 'slider', id: 'm', target: 'a', constant: 'c', min: 1, max: 2 }, ['plot']],
  ['construct', { kind: 'construct', id: 'm', target: 'a', step: { shape: 'point', name: 'A', x: 0, y: 0 } }, ['geometry']],
  ['runSimulation', { kind: 'runSimulation', target: 'a', action: 'play' }, ['simulate', 'richScene']],
  ['setParameter', { kind: 'setParameter', target: 'a', parameter: 'gravity', value: 1 }, ['simulate']],
  ['trackVector', { kind: 'trackVector', id: 'm', target: 'a', quantity: 'velocity' }, ['simulate']],
  ['slider', { kind: 'slider', id: 'm', target: 'a', parameter: 'gravity', min: 1, max: 2 }, ['simulate']],
  ['ghostPath', { kind: 'ghostPath', id: 'm', target: 'a' }, ['simulate']],
  ['reveal', { kind: 'reveal', target: 'a', upTo: 1 }, ['plot', 'diagram', 'table', 'timeline', 'code']],
  ['plot.over', { kind: 'plot', id: 'm', expression: 'x', domain: [0, 1], over: 'a' }, ['plot']],
  ['simulate.over', { kind: 'simulate', id: 'm', simulation: SIMULATION, over: 'a' }, ['drawing']],
];

const TAKES_ANY_ELEMENT: [string, unknown][] = [
  ['annotate', { kind: 'annotate', id: 'm', target: 'a.part', mark: 'circle' }],
  ['highlight', { kind: 'highlight', id: 'm', target: 'a.part' }],
  ['focus', { kind: 'focus', target: 'a.part' }],
  ['hide', { kind: 'hide', target: 'a' }],
  ['vector.on', { kind: 'vector', id: 'm', on: 'a.part', angleDegrees: 0, length: 'short' }],
];

const NAMES_NOTHING: [string, unknown][] = [
  ['writeMath', { kind: 'writeMath', id: 'm', tex: 'x' }],
  ['plot with no over', { kind: 'plot', id: 'm', expression: 'x', domain: [0, 1] }],
  ['simulate with no over', { kind: 'simulate', id: 'm', simulation: SIMULATION }],
  ['clearBoard', { kind: 'clearBoard' }],
];

function boardOf(entries: [string, BoardElementKind][]): BoardKinds {
  return new Map(entries);
}

function getBeatProblems(script: unknown[], startingBoard: BoardKinds): (string | null)[] {
  const beat = parseOrThrow(makeBeat({ script }));
  let board = startingBoard;
  return getCues(beat).map(({ command }) => {
    const problem = getBoardProblem(command, board);
    board = getBoardAfter(command, board);
    return problem;
  });
}

describe('getBoardProblem', () => {
  describe.each(NEEDS_A_KIND)('%s', (_name, input, allowedKinds) => {
    const command = commandOrThrow(input);

    it.each(ALL_KINDS)('on a %s', (kind) => {
      const problem = getBoardProblem(command, boardOf([['a', kind]]));
      if (allowedKinds.includes(kind)) expect(problem).toBeNull();
      else expect(problem).toMatch(new RegExp(`needs ${allowedKinds.join(' or ')}, but a is a ${kind}`));
    });

    it('when nothing is there', () => {
      expect(getBoardProblem(command, boardOf([]))).toMatch(/names a, which is not on the board/);
    });
  });

  describe.each(TAKES_ANY_ELEMENT)('%s', (_name, input) => {
    const command = commandOrThrow(input);

    it.each(ALL_KINDS)('takes a %s, reading the part before the dot', (kind) => {
      expect(getBoardProblem(command, boardOf([['a', kind]]))).toBeNull();
    });

    it('needs something to be there', () => {
      expect(getBoardProblem(command, boardOf([['b', 'text']]))).toMatch(/names a, which is not on the board/);
    });
  });

  it.each(NAMES_NOTHING)('has nothing to check on %s', (_name, input) => {
    expect(getBoardProblem(commandOrThrow(input), boardOf([]))).toBeNull();
  });

  it('lets the tutor point at student ink', () => {
    expect(getBoardProblem(commandOrThrow({ kind: 'annotate', id: 'm', target: 'ink-1', mark: 'circle' }), boardOf([['ink-1', 'ink']]))).toBeNull();
  });
});

describe('getBoardAfter', () => {
  const equation = commandOrThrow({ kind: 'writeMath', id: 'a', tex: 'x' });

  it('adds what a command creates', () => {
    expect([...getBoardAfter(equation, boardOf([]))]).toEqual([['a', 'writeMath']]);
  });

  it('gives marks an entry, so hide can remove them', () => {
    const mark = commandOrThrow({ kind: 'highlight', id: 'term', target: 'a', tex: 'x' });
    const marked = getBoardAfter(mark, boardOf([['a', 'writeMath']]));
    expect(marked.get('term')).toBe('highlight');
    expect(getBoardAfter(commandOrThrow({ kind: 'hide', target: 'term' }), marked).has('term')).toBe(false);
  });

  it('replaces a live id in place', () => {
    const plot = commandOrThrow({ kind: 'plot', id: 'a', expression: 'x', domain: [0, 1] });
    const board = getBoardAfter(plot, boardOf([['first', 'text'], ['a', 'writeMath'], ['last', 'text']]));
    expect([...board]).toEqual([['first', 'text'], ['a', 'plot'], ['last', 'text']]);
  });

  it('removes what hide names, and clearBoard removes everything', () => {
    const board = boardOf([['a', 'writeMath'], ['b', 'plot']]);
    expect([...getBoardAfter(commandOrThrow({ kind: 'hide', target: 'a' }), board)]).toEqual([['b', 'plot']]);
    expect([...getBoardAfter(commandOrThrow({ kind: 'clearBoard' }), board)]).toEqual([]);
  });

  it('leaves the board alone for a command that creates nothing', () => {
    const board = boardOf([['a', 'writeMath']]);
    expect([...getBoardAfter(commandOrThrow({ kind: 'focus', target: 'a' }), board)]).toEqual([...board]);
  });

  it('returns a new board and never changes the one it was given', () => {
    const board = boardOf([['a', 'text']]);
    const commands: SceneCommand[] = [equation, commandOrThrow({ kind: 'hide', target: 'a' }), commandOrThrow({ kind: 'clearBoard' }), commandOrThrow({ kind: 'focus', target: 'a' })];
    for (const command of commands) {
      expect(getBoardAfter(command, board)).not.toBe(board);
      expect([...board]).toEqual([['a', 'text']]);
    }
  });
});

describe('a reveal on the board', () => {
  const FRAMES_WITH_A_COUNT: BoardElementKind[] = ['diagram', 'table', 'timeline', 'code'];

  describe.each(FRAMES_WITH_A_COUNT)('on a %s', (kind) => {
    it.each([0, 3])('counts up to %d', (upTo) => {
      expect(getBoardProblem(commandOrThrow({ kind: 'reveal', target: 'a', upTo }), boardOf([['a', kind]]))).toBeNull();
    });

    it.each([-1, 2.5])('refuses %d as a count', (upTo) => {
      expect(getBoardProblem(commandOrThrow({ kind: 'reveal', target: 'a', upTo }), boardOf([['a', kind]]))).toBe(`reveal needs a whole count on a ${kind}`);
    });
  });

  it.each([-1.5, 0, 2.5])('takes %d on a plot, where it is an x value', (upTo) => {
    expect(getBoardProblem(commandOrThrow({ kind: 'reveal', target: 'a', upTo }), boardOf([['a', 'plot']]))).toBeNull();
  });
});

describe('getBoardAfterAction', () => {
  const STROKE = { action: 'inkStroke', id: 'ink-1', points: [[0, 0, 0]] } as unknown as StudentAction;
  const ERASE = { action: 'inkErased', target: 'ink-1' } as unknown as StudentAction;

  it('adds a stroke as ink, so the tutor can point at it', () => {
    const board = getBoardAfterAction(STROKE, boardOf([['shot', 'simulate']]));
    expect([...board]).toEqual([['shot', 'simulate'], ['ink-1', 'ink']]);
    expect(getBoardProblem(commandOrThrow({ kind: 'annotate', id: 'm', target: 'ink-1', mark: 'cross' }), board)).toBeNull();
  });

  it('keeps one entry for a long stroke sent in several actions', () => {
    const board = getBoardAfterAction(STROKE, getBoardAfterAction(STROKE, boardOf([])));
    expect([...board]).toEqual([['ink-1', 'ink']]);
  });

  it('removes erased ink, so the tutor can no longer point at it', () => {
    const board = getBoardAfterAction(ERASE, boardOf([['ink-1', 'ink'], ['shot', 'simulate']]));
    expect([...board]).toEqual([['shot', 'simulate']]);
    expect(getBoardProblem(commandOrThrow({ kind: 'focus', target: 'ink-1' }), board)).toMatch(/not on the board/);
  });

  it('never lets a stroke or an erase take a tutor element', () => {
    const board = boardOf([['ink-1', 'simulate']]);
    expect([...getBoardAfterAction(STROKE, board)]).toEqual([['ink-1', 'simulate']]);
    expect([...getBoardAfterAction(ERASE, board)]).toEqual([['ink-1', 'simulate']]);
  });

  it.each<[string, unknown]>([
    ['a slider drag', { action: 'sliderDragged', target: 'shot', parameter: 'gravity', samples: [] }],
    ['a rewind', { action: 'rewound', turnId: 't1', toBeat: 'b1' }],
    ['a shared file', { action: 'fileShared', fileId: 'file-1', name: 'a.pdf' }],
  ])('changes nothing for %s', (_name, action) => {
    const board = boardOf([['shot', 'simulate']]);
    expect([...getBoardAfterAction(action as StudentAction, board)]).toEqual([...board]);
  });

  it('returns a new board and never changes the one it was given', () => {
    const board = boardOf([['ink-1', 'ink']]);
    expect(getBoardAfterAction(ERASE, board)).not.toBe(board);
    expect([...board]).toEqual([['ink-1', 'ink']]);
  });
});

describe('a whole beat on the board', () => {
  it('finds a target nothing has created', () => {
    expect(getBeatProblems([{ kind: 'hide', target: 'ghost' }, 'Watch.'], boardOf([]))).toEqual(['hide names ghost, which is not on the board']);
  });

  it('finds a target hidden or cleared earlier in the beat', () => {
    const script = [{ kind: 'hide', target: 'shot' }, 'Watch ', { kind: 'focus', target: 'shot' }, 'this ', { kind: 'clearBoard' }, 'arrow ', { kind: 'focus', target: 'court' }, 'move.'];
    const problems = getBeatProblems(script, boardOf([['shot', 'simulate'], ['court', 'drawing']]));
    expect(problems).toEqual([null, 'focus names shot, which is not on the board', null, 'focus names court, which is not on the board']);
  });

  it('accepts a target created earlier in the same beat, or already on the board', () => {
    const script = [{ kind: 'writeMath', id: 'equation', tex: 'x' }, 'Watch ', { kind: 'highlight', id: 'term', target: 'equation' }, 'this ', { kind: 'focus', target: 'shot.ball' }, 'arrow.'];
    expect(getBeatProblems(script, boardOf([['shot', 'simulate']]))).toEqual([null, null, null]);
  });
});

describe('a hostile name on the board', () => {
  it('stays in the Map and never reaches Object.prototype', () => {
    const before = Object.getOwnPropertyNames(Object.prototype);
    const hostile = { kind: 'writeMath', id: '__proto__', tex: 'x' } as unknown as SceneCommand;
    const board = getBoardAfter(hostile, boardOf([]));
    expect(board.get('__proto__')).toBe('writeMath');
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
    expect(Object.getOwnPropertyNames(Object.prototype)).toEqual(before);
    expect(({} as Record<string, unknown>).kind).toBeUndefined();
  });

  it('does not find an inherited name on an empty board', () => {
    const inherited = { kind: 'focus', target: 'constructor' } as unknown as SceneCommand;
    expect(getBoardProblem(inherited, boardOf([]))).toBe('focus names constructor, which is not on the board');
  });
});

describe('named moments', () => {
  const play = (until: string) => commandOrThrow({ kind: 'runSimulation', target: 'a', action: 'play', until });

  it('refuses a moment a simulation does not have', () => {
    expect(getBoardProblem(play('apex'), new Map([['a', 'simulate']]))).toMatch(/moments release, peak, landing/);
    expect(getBoardProblem(play('peak'), new Map([['a', 'simulate']]))).toBeNull();
  });

  it('lets a stored scene name its own moments', () => {
    expect(getBoardProblem(play('tangent-locks'), new Map([['a', 'richScene']]))).toBeNull();
  });
});
