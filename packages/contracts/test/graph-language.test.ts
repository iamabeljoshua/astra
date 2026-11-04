import { describe, expect, it } from 'vitest';
import { type BoardKinds, getBoardProblem, getResumeScript, parseAgentMessage, parseBrowserMessage, parseSceneCommand, parseSessionEvent, type SceneCommand } from '../src/index.ts';
import { commandOrThrow, expectRefused, parseOrThrow } from './helpers.ts';

const BOARD: BoardKinds = new Map([['shot', 'simulate'], ['curve', 'plot'], ['line', 'numberLine']]);
const problemOf = (command: unknown) => getBoardProblem(commandOrThrow(command), BOARD);

describe('numbers that follow a quantity', () => {
  it('reads a readout, and names only quantities the engine computes', () => {
    expect(commandOrThrow({ kind: 'readout', id: 'how-far', target: 'shot', quantity: 'landing-distance', label: 'lands at' })).toMatchObject({ quantity: 'landing-distance' });
    expectRefused(parseSceneCommand({ kind: 'readout', id: 'how-far', target: 'shot', quantity: 'answer' }), /quantity/);
    expectRefused(parseSceneCommand({ kind: 'readout', id: 'how-far', target: 'shot', quantity: 'height', value: 42 }), /value/);
  });

  it('puts a readout only on a simulation', () => {
    expect(problemOf({ kind: 'readout', id: 'r', target: 'shot', quantity: 'height' })).toBeNull();
    expect(problemOf({ kind: 'readout', id: 'r', target: 'curve', quantity: 'height' })).toMatch(/needs simulate/);
  });
});

describe('a label on a figure', () => {
  const vector = { kind: 'vector', id: 'v', on: 'shot.ball', angleDegrees: 0, length: 'short' };

  it('takes the same limit on combining marks as math, because a stack of them is drawn far taller than its line', () => {
    expect(commandOrThrow({ ...vector, label: 'e\u0301\u0323' })).toMatchObject({ label: 'e\u0301\u0323' });
    expectRefused(parseSceneCommand({ ...vector, label: `e${'\u0301'.repeat(3)}` }), /combining marks/);
    expectRefused(parseSceneCommand({ kind: 'plot', id: 'p', expression: 'x', domain: [0, 1], label: `a${'\u0301'.repeat(40)}` }), /combining marks/);
  });
});

describe('a playback rate', () => {
  const play = { kind: 'runSimulation', target: 'shot', action: 'play' };

  it('takes a rate when there is no word to aim at', () => {
    expect(commandOrThrow({ ...play, rate: 0.5 })).toMatchObject({ rate: 0.5 });
  });

  it('refuses a rate with words to aim at, or past its range', () => {
    expectRefused(parseSceneCommand({ ...play, rate: 0.5, overWords: 3 }), /either overWords or a rate/);
    expectRefused(parseSceneCommand({ ...play, rate: 40 }), /rate/);
    expectRefused(parseSceneCommand({ ...play, rate: 0 }), /rate/);
  });

  it('keeps the rate when a cut play resumes', () => {
    const beat = parseOrThrow({ id: 'b', expectsReply: false, script: [{ ...play, rate: 0.5 }, 'Watch it go slowly.'] });
    const script = getResumeScript(beat, { fromWord: 2, firedCues: 1, frozen: [{ target: 'shot' as never, simulationSeconds: 0.4 }] });
    expect(script[0]).toMatchObject({ action: 'play', rate: 0.5 });
  });
});

describe('a launch angle', () => {
  it('takes a slider on the angle, within its range', () => {
    expect(commandOrThrow({ kind: 'slider', id: 's', target: 'shot', parameter: 'launchAngle', min: 10, max: 80 })).toMatchObject({ parameter: 'launchAngle' });
    expectRefused(parseSceneCommand({ kind: 'slider', id: 's', target: 'shot', parameter: 'launchAngle', min: 10, max: 200 }), /max/);
  });

  it('never stores an angle with the simulation, because the speeds already say it', () => {
    expectRefused(parseSceneCommand({ kind: 'simulate', id: 'shot', simulation: { model: 'projectile', parameters: { horizontalSpeed: 1, upwardSpeed: 1, releaseHeight: 0, gravity: 9, launchAngle: 45 } } }), /launchAngle/);
  });
});

describe('a constant set by the tutor', () => {
  it('reshapes a plot over words', () => {
    expect(commandOrThrow({ kind: 'setParameter', target: 'curve', constant: 'a', value: 2, overWords: 4 })).toMatchObject({ constant: 'a', overWords: 4 });
    expect(problemOf({ kind: 'setParameter', target: 'curve', constant: 'a', value: 2 })).toBeNull();
    expect(problemOf({ kind: 'setParameter', target: 'shot', constant: 'a', value: 2 })).toMatch(/needs plot/);
    expect(problemOf({ kind: 'setParameter', target: 'curve', parameter: 'gravity', value: 2 })).toMatch(/needs simulate/);
  });

  it('refuses words on a simulation value, and a poisoned name', () => {
    expectRefused(parseSceneCommand({ kind: 'setParameter', target: 'shot', parameter: 'gravity', value: 2, overWords: 3 }), /overWords/);
    expectRefused(parseSceneCommand({ kind: 'setParameter', target: 'curve', constant: '__proto__', value: 2 }), /constant/);
  });

  it('carries the words into a cut, like any other cue', () => {
    const command: SceneCommand = commandOrThrow({ kind: 'setParameter', target: 'curve', constant: 'a', value: 2, overWords: 4 });
    expect('overWords' in command && command.overWords).toBe(4);
  });
});

describe('cue paces in a report', () => {
  const report = { wordStartsMs: [0, 300, 600], durationMs: 900, playedWords: 3, firedCueMs: [0], ending: 'finished', frozen: [] };
  const played = { type: 'played', turnId: 't', beatId: 'b', browserMs: 1000, startedMsAgo: 900, ...report };
  const beat = { id: 'b', expectsReply: false, script: [{ kind: 'runSimulation', target: 'shot', action: 'play', overWords: 2 }, 'One two three'] };
  const event = { seq: 0, atMs: 0, kind: 'beatPlayed', reportedBy: 'browser', turnId: 't', beat, ...report };

  it('reads them from the browser and into the log', () => {
    const cuePaces = [{ cue: 0, afterMs: 0, landsAtMs: 600 }, { cue: 0, afterMs: 200, landsAtMs: 640 }];
    expect(parseBrowserMessage({ ...played, cuePaces })).toMatchObject({ ok: true, value: { cuePaces } });
    expect(parseSessionEvent({ ...event, cuePaces })).toMatchObject({ ok: true, value: { cuePaces } });
  });

  it('still reads a stored row with none', () => {
    const parsed = parseSessionEvent(event);
    expect(parsed).toMatchObject({ ok: true });
    expect(parsed.ok && 'cuePaces' in parsed.value).toBe(false);
  });

  it('refuses a pace for a cue that never fired, or a list too long to store', () => {
    expectRefused(parseBrowserMessage({ ...played, cuePaces: [{ cue: 1, afterMs: 0, landsAtMs: 600 }] }), /cue/);
    expectRefused(parseBrowserMessage({ ...played, cuePaces: Array.from({ length: 121 }, () => ({ cue: 0, afterMs: 0, landsAtMs: 600 })) }), /cuePaces/);
    expectRefused(parseBrowserMessage({ ...played, cuePaces: [{ cue: 0, afterMs: -1, landsAtMs: 600 }] }), /afterMs/);
  });

  it('leaves the agent messages as they were', () => {
    expect(parseAgentMessage({ type: 'stop', turnId: 't' })).toMatchObject({ ok: true });
  });
});
