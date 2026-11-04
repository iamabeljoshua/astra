import { describe, expect, it } from 'vitest';
import type { BrowserMessage } from '@astra/contracts';
import { createTimerClock } from '../src/player/audio-clock.ts';
import { type BoardOperation, sortOperations } from '../src/player/board-operations.ts';
import { getBoardAt, describeBoard, getReshapedValues, getSceneFrame, type BoardElement } from '../src/player/board-state.ts';
import { createScenePlayer } from '../src/player/scene-player.ts';
import { rebuildBoard } from '../src/player/rebuild-board.ts';
import { parseSessionEvent } from '@astra/contracts';
import { createProjectileScene } from '../src/motion/projectile-scene.ts';

const place = (command: object, atMs = 0, overMs: number | null = null): BoardOperation => ({ kind: 'command', atMs, overMs, command: command as never });

const SHOT = { kind: 'simulate', id: 'shot', simulation: { model: 'projectile', parameters: { horizontalSpeed: 4, upwardSpeed: 6, releaseHeight: 2, gravity: 9.8 } } };
const element = (operations: BoardOperation[], id: string, atMs: number) => getBoardAt(operations, atMs).elements.get(id as never) as BoardElement;
const ids = (operations: BoardOperation[], atMs: number) => [...getBoardAt(operations, atMs).elements.keys()];

describe('hiding', () => {
  const figure = [
    place(SHOT),
    place({ kind: 'trackVector', id: 'arrow', target: 'shot', quantity: 'velocity' }),
    place({ kind: 'vector', id: 'push', on: 'shot.ball', angleDegrees: 0, length: 'short' }),
    place({ kind: 'ghostPath', id: 'ghost', target: 'shot' }),
    place({ kind: 'slider', id: 'speed', target: 'shot', parameter: 'gravity', min: 1, max: 20 }),
    place({ kind: 'readout', id: 'number', target: 'shot', quantity: 'height' }),
    place({ kind: 'annotate', id: 'note', target: 'shot.ball', mark: 'cross' }),
    place({ kind: 'text', id: 'title', text: 'stays' }),
    place({ kind: 'focus', target: 'shot.ball' }),
  ];

  it('takes everything hanging on a simulation with it, and leaves the rest', () => {
    const operations = [...figure, place({ kind: 'hide', target: 'shot' }, 100)];
    expect(ids(operations, 200)).toEqual(['title']);
    expect(getBoardAt(operations, 200).focus).toBeNull();
  });

  it('takes a plot\'s marks and the curves drawn over it', () => {
    const operations = [place({ kind: 'plot', id: 'graph', expression: 'x', domain: [0, 1] }), place({ kind: 'plot', id: 'second', over: 'graph', expression: 'x', domain: [0, 1] }), place({ kind: 'markValue', id: 'on-second', target: 'second', at: 0 }), place({ kind: 'hide', target: 'graph' }, 100)];
    expect(ids(operations, 200)).toEqual([]);
  });

  it('removes one arrow without touching what it hangs on', () => {
    expect(ids([...figure, place({ kind: 'hide', target: 'arrow' }, 100)], 200)).toContain('shot');
  });
});

describe('running a simulation', () => {
  const seconds = (operations: BoardOperation[], atMs: number) => describeBoard(getBoardAt(operations, atMs), atMs).elements.find((one) => one.id === 'shot')?.sceneSeconds;

  it('plays at a rate when there is no word to aim at', () => {
    const operations = [place(SHOT), place({ kind: 'runSimulation', target: 'shot', action: 'play', rate: 0.5 }, 1000)];
    expect(seconds(operations, 2000)).toBeCloseTo(0.5, 2);
  });

  it('holds at a moment, and stays there', () => {
    const operations = [place(SHOT), place({ kind: 'runSimulation', target: 'shot', action: 'play', until: 'peak' }, 0)];
    expect(seconds(operations, 5000)).toBeCloseTo(6 / 9.8, 3);
    expect(seconds(operations, 9000)).toBeCloseTo(6 / 9.8, 3);
  });

  it('never runs time backward: a play to a moment already passed starts over', () => {
    const operations = [place(SHOT), place({ kind: 'runSimulation', target: 'shot', action: 'seek', to: 'landing' }, 0), place({ kind: 'runSimulation', target: 'shot', action: 'play', until: 'peak' }, 100)];
    expect(seconds(operations, 100)).toBe(0);
    expect(seconds(operations, 300)).toBeCloseTo(0.2, 3);
  });

  it('continues without a jump when a play lands on a play', () => {
    const operations = [place(SHOT), place({ kind: 'runSimulation', target: 'shot', action: 'play', until: 'landing' }, 0), place({ kind: 'runSimulation', target: 'shot', action: 'play', until: 'landing', rate: 2 }, 500)];
    expect(seconds(operations, 500)).toBeCloseTo(0.5, 3);
    expect(seconds(operations, 600)).toBeCloseTo(0.7, 3);
  });

  it('freezes where a stop lands, and writes the same frame later', () => {
    const operations: BoardOperation[] = [place(SHOT), place({ kind: 'runSimulation', target: 'shot', action: 'play' }, 0), { kind: 'freeze', atMs: 300, frames: [{ target: 'shot' as never, simulationSeconds: 0.3 }] }];
    expect(seconds(operations, 300)).toBe(0.3);
    expect(seconds(operations, 9000)).toBe(0.3);
    expect(getSceneFrame(element(operations, 'shot', 9000), 9000)).toEqual(getSceneFrame(element(operations, 'shot', 300), 300));
  });

  it('restarts a drag each sample and flies once the student stops', () => {
    const operations: BoardOperation[] = [place(SHOT), { kind: 'parameterSample', atMs: 1000, target: 'shot' as never, parameter: 'horizontalSpeed', value: 8 }];
    expect(seconds(operations, 1000)).toBe(0);
    expect(seconds(operations, 1300)).toBeCloseTo(0.3, 3);
    expect(element(operations, 'shot', 1300).placedScene?.scene.values?.horizontalSpeed).toBe(8);
  });

  it('keeps a ghost of the path it had when the ghost was placed', () => {
    const operations: BoardOperation[] = [place(SHOT), place({ kind: 'ghostPath', id: 'ghost', target: 'shot' }, 100), { kind: 'parameterSample', atMs: 200, target: 'shot' as never, parameter: 'horizontalSpeed', value: 8 }];
    expect(element(operations, 'ghost', 300).ghostScene?.values?.horizontalSpeed).toBe(4);
    expect(element(operations, 'shot', 300).placedScene?.scene.values?.horizontalSpeed).toBe(8);
  });
});

describe('reshaping a curve', () => {
  const plot = { kind: 'plot', id: 'graph', expression: 'a*x', constants: [{ name: 'a', value: 1, min: 0, max: 4 }], domain: [0, 1] };

  it('moves its constants from where they are to the new value, on the clock', () => {
    const operations = [place(plot), place({ kind: 'setParameter', target: 'graph', constant: 'a', value: 3 }, 1000, 1000)];
    expect(getReshapedValues(element(operations, 'graph', 1500), 1500).a).toBeCloseTo(2, 6);
    expect(getReshapedValues(element(operations, 'graph', 2500), 2500).a).toBe(3);
  });

  it('continues from where it had reached when another change lands', () => {
    const operations = [place(plot), place({ kind: 'setParameter', target: 'graph', constant: 'a', value: 3 }, 1000, 1000), place({ kind: 'setParameter', target: 'graph', constant: 'a', value: 0 }, 1500, 1000)];
    expect(getReshapedValues(element(operations, 'graph', 1500), 1500).a).toBeCloseTo(2, 6);
  });

  it('starts a revealed plot empty at the low end of its domain, not at zero', () => {
    const operations = [place({ ...plot, domain: [-5, 5], startsEmpty: true })];
    expect(describeBoard(getBoardAt(operations, 100), 100).elements[0]?.revealedUpTo).toBe(-5);
  });

  it('stops a reveal at the end of the axes', () => {
    const operations = [place({ ...plot, startsEmpty: true }), place({ kind: 'reveal', target: 'graph', upTo: 99 }, 100, 100)];
    expect(describeBoard(getBoardAt(operations, 500), 500).elements[0]?.revealedUpTo).toBe(1);
  });
});

describe('a move landing during another', () => {
  const steps = [place({ kind: 'writeMath', id: 'eq', tex: '2x + 3 = 11' }), place({ kind: 'transformMath', target: 'eq', tex: '2x = 11 - 3' }, 2000)];
  const describeEquation = (operations: BoardOperation[], atMs: number) => describeBoard(getBoardAt(operations, atMs), atMs).elements[0];

  it('lets the running move hurry to its end, with no jump, and then starts', () => {
    const operations = [...steps, place({ kind: 'transformMath', target: 'eq', tex: '2x = 8' }, 2200)];
    expect(describeEquation(operations, 2200)?.drawn).toBeCloseTo(0.25, 2);
    expect(describeEquation(operations, 2200)?.tex).toBe('2x = 11 - 3');
    expect(describeEquation(operations, 2319)?.drawn).toBeLessThan(1);
    expect(describeEquation(operations, 2319)?.tex).toBe('2x = 11 - 3');
    expect(describeEquation(operations, 2321)?.tex).toBe('2x = 8');
    expect(describeEquation(operations, 2321)?.morphFrom).toBe('2x = 11 - 3');
    expect(describeEquation(operations, 2321)?.drawn).toBeLessThan(0.01);
  });

  it('still lands on its word when it was paced over words', () => {
    const operations = [...steps, place({ kind: 'transformMath', target: 'eq', tex: '2x = 8', overWords: 3 }, 2200, 900)];
    expect(describeEquation(operations, 3099)?.drawn).toBeLessThan(1);
    expect(describeEquation(operations, 3101)?.drawn).toBe(1);
  });

  it('goes straight to the newest when several land at once', () => {
    const operations = [...steps, place({ kind: 'transformMath', target: 'eq', tex: '2x = 8' }, 2200), place({ kind: 'transformMath', target: 'eq', tex: 'x = 4' }, 2210)];
    expect(describeEquation(operations, 2500)?.tex).toBe('x = 4');
  });

  it('holds what is pending through a freeze, and carries on when the board unfreezes', () => {
    const operations: BoardOperation[] = [...steps, place({ kind: 'transformMath', target: 'eq', tex: '2x = 8' }, 2200), { kind: 'freeze', atMs: 2250, frames: [{ target: 'eq' as never, drawnFraction: 0.5 }] }, { kind: 'beatStarted', atMs: 4000 }];
    expect(describeEquation(operations, 3500)?.tex).toBe('2x = 11 - 3');
    expect(describeEquation(operations, 3500)?.drawn).toBe(0.5);
    expect(describeEquation(operations, 5000)?.tex).toBe('2x = 8');
  });
});

describe('two sliders that share a speed', () => {
  const shot: BoardOperation = { kind: 'command', atMs: 0, overMs: null, command: { kind: 'simulate', id: 'shot', simulation: { model: 'projectile', parameters: { horizontalSpeed: 4, upwardSpeed: 6, releaseHeight: 2, gravity: 9.8 } } } as never };
  const sample = (atMs: number, parameter: string, value: number): BoardOperation => ({ kind: 'parameterSample', atMs, target: 'shot' as never, parameter, value });
  const getValues = (operations: BoardOperation[]) => getBoardAt(operations, 5000).elements.get('shot' as never)?.placedScene?.scene.values;

  it('shows the value of the slider moved last, whichever came first', () => {
    expect(getValues([shot, sample(10, 'launchAngle', 30), sample(20, 'horizontalSpeed', 15)])?.horizontalSpeed).toBe(15);
    expect(getValues([shot, sample(10, 'horizontalSpeed', 15), sample(20, 'launchAngle', 30)])?.launchAngle).toBeCloseTo(30, 9);
    expect(getValues([shot, sample(10, 'launchAngle', 30), sample(20, 'horizontalSpeed', 15), sample(30, 'launchAngle', 45)])?.launchAngle).toBeCloseTo(45, 9);
    expect(getValues([shot, sample(10, 'launchAngle', 30), sample(20, 'horizontalSpeed', 15), sample(30, 'launchAngle', 45), sample(40, 'horizontalSpeed', 9)])?.horizontalSpeed).toBe(9);
  });
});

describe('two things in the same millisecond', () => {
  const curve: BoardOperation = { kind: 'command', atMs: 0, overMs: null, command: { kind: 'plot', id: 'curve', expression: 'a*x', constants: [{ name: 'a', value: 1, min: 0, max: 9 }], domain: [0, 1] } as never };
  const tutor: BoardOperation = { kind: 'command', atMs: 50, overMs: 0, command: { kind: 'setParameter', target: 'curve', constant: 'a', value: 3 } as never };
  const student: BoardOperation = { kind: 'parameterSample', atMs: 50, target: 'curve' as never, parameter: 'a', value: 7 };

  it('takes the tutor first and the student after, in whatever order they arrived, so a live board and a replay agree', () => {
    for (const operations of [[curve, student, tutor], [curve, tutor, student]]) {
      const board = getBoardAt(sortOperations(operations), 100);
      expect(board.elements.get('curve' as never)?.placedScene?.scene.values).toEqual({ a: 7 });
    }
  });
});

describe('a slider drag', () => {
  function drag() {
    let nowMs = 1000;
    const sent: BrowserMessage[] = [];
    const player = createScenePlayer({ clock: createTimerClock({ getNowMs: () => nowMs }), send: (message) => sent.push(message), setOutputLevel: () => {} });
    for (const value of [5, 6, 7, 8]) {
      player.moveSlider({ target: 'shot' as never, parameter: 'horizontalSpeed', value });
      nowMs += 120;
    }
    player.finishSliderDrag();
    return { player, sent };
  }

  it('sends what the board used, in pieces, on the clock the board read', () => {
    const { sent } = drag();
    const acted = sent.filter((message): message is BrowserMessage & { type: 'acted' } => message.type === 'acted');
    expect(acted.length).toBeGreaterThan(1);
    const samples = acted.flatMap((message) => (message.action.action === 'sliderDragged' ? message.action.samples.map(({ afterMs, value }) => ({ atMs: message.browserMs - message.startedMsAgo + afterMs, value })) : []));
    expect(samples).toEqual([{ atMs: 1001, value: 5 }, { atMs: 1121, value: 6 }, { atMs: 1241, value: 7 }, { atMs: 1361, value: 8 }]);
  });

  it.each([1000.3, 1000.5, 1000.7, 1000])('logs a key press at %d on the moment the live board used', (nowMs) => {
    const sent: BrowserMessage[] = [];
    const player = createScenePlayer({ clock: createTimerClock({ getNowMs: () => nowMs }), send: (message) => sent.push(message), setOutputLevel: () => {} });
    player.moveSlider({ target: 'shot' as never, parameter: 'horizontalSpeed', value: 5 });
    player.finishSliderDrag();
    const liveMs = player.getOperations().find((operation) => operation.kind === 'parameterSample')?.atMs;
    const acted = sent.find((message): message is BrowserMessage & { type: 'acted' } => message.type === 'acted');
    const samples = acted?.action.action === 'sliderDragged' ? acted.action.samples : [];
    expect((acted?.browserMs as number) - (acted?.startedMsAgo as number) + (samples[0]?.afterMs as number)).toBe(liveMs);
  });

  it('gives the replay the same board at every moment of the drag', () => {
    const { player, sent } = drag();
    const opening = { seq: 0, atMs: 0, kind: 'beatPlayed', reportedBy: 'browser', turnId: 't', beat: { id: 'b', expectsReply: false, script: [SHOT, 'One'] }, wordStartsMs: [0], durationMs: 100, playedWords: 1, firedCueMs: [0], ending: 'finished', frozen: [] };
    const log = [opening, ...sent.flatMap((message, index) => (message.type === 'acted' ? [{ seq: index + 1, atMs: message.browserMs - message.startedMsAgo, kind: 'studentActed', action: message.action }] : []))].map((event) => {
      const parsed = parseSessionEvent(JSON.parse(JSON.stringify(event)));
      if (!parsed.ok) throw new Error(parsed.problem);
      return parsed.value;
    });
    const live = createLiveWithShot(player);
    for (let atMs = 1000; atMs < 3000; atMs += 37) expect(describeBoard(rebuildBoard(log, atMs), atMs).elements[0]?.sceneValues).toEqual(describeBoard(live(atMs), atMs).elements[0]?.sceneValues);
  });

  function createLiveWithShot(player: ReturnType<typeof createScenePlayer>) {
    return (atMs: number) => getBoardAt([place(SHOT), ...player.getOperations()], atMs);
  }
});

describe('a long drag', () => {
  it('gives the same board as applying every sample, and asks for the scene only for what counts', () => {
    const samples = Array.from({ length: 500 }, (_, index): BoardOperation => ({ kind: 'parameterSample', atMs: 1000 + index * 16, target: 'shot' as never, parameter: 'horizontalSpeed', value: 1 + index / 100 }));
    let scenes = 0;
    const catalog = (command: { kind: string }, changes: Record<string, number>) => {
      scenes += 1;
      return command.kind === 'simulate' ? createProjectileScene({ horizontalSpeed: 4, upwardSpeed: 6, releaseHeight: 2, gravity: 9.8, ...changes }) : null;
    };
    const atMs = 1000 + 250 * 16 + 5;
    const board = getBoardAt([place(SHOT), ...samples], atMs, catalog as never);
    expect((board.elements.get('shot' as never) as BoardElement).placedScene?.scene.values?.horizontalSpeed).toBeCloseTo(1 + 250 / 100, 9);
    expect(scenes).toBeLessThan(5);
  });
});
