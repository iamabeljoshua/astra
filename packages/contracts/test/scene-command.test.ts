import { describe, expect, it } from 'vitest';
import {
  BEAT_LIMITS,
  parseBeat,
  parseSceneCommand,
  SCENE_COMMAND_KINDS,
  SIMULATION_MODELS,
  SIMULATION_PARAMETER_RULES,
  SIMULATION_PARAMETERS,
  TRACKED_QUANTITIES,
} from '../src/index.ts';
import { commandOrThrow, expectRefused, ONE_OF_EACH_COMMAND, withCommand, withoutField } from './helpers.ts';

const RUN = { kind: 'runSimulation', target: 'shot' };
const SHOT_WITHOUT_GRAVITY = { horizontalSpeed: 4.2, upwardSpeed: 5.6, releaseHeight: 2.2 };
const PLOT = { kind: 'plot', id: 'curve', domain: [-2, 2] };
const COORDINATE_LIMIT = 1e6;
const WILD = 1e308;

function expectAccepted(command: unknown): void {
  expect(parseSceneCommand(command)).toEqual({ ok: true, value: command });
}

describe('parseSceneCommand', () => {
  it.each(SCENE_COMMAND_KINDS)('accepts a %s and returns it unchanged', (kind) => {
    expectAccepted(ONE_OF_EACH_COMMAND[kind]);
  });

  it('names the command as the place of a problem', () => {
    expect(parseSceneCommand({ kind: 'focus', target: 'A' })).toEqual({ ok: false, problem: 'command.target: expected an element reference' });
  });

  it.each([
    ['a string', 'clearBoard'],
    ['null', null],
    ['a list', []],
    ['an unknown kind', { kind: 'playVideo' }],
    ['an inherited kind', { kind: 'constructor' }],
  ])('refuses %s', (_name, input) => {
    expectRefused(parseSceneCommand(input), /command\.kind: expected one of/);
  });

  it('reads only the fields a value owns, so nothing inherited can stand in for one', () => {
    expectRefused(parseSceneCommand(Object.create({ kind: 'clearBoard' })), /command\.kind: expected one of/);
    expectRefused(parseSceneCommand(Object.assign(Object.create({ target: 'a' }), { kind: 'focus' })), /command\.target: expected an element reference/);
  });
});

describe('runSimulation', () => {
  it.each([
    [{ ...RUN, action: 'play' }],
    [{ ...RUN, action: 'play', until: 'release' }],
    [{ ...RUN, action: 'play', until: 'peak' }],
    [{ ...RUN, action: 'play', until: 'landing', overWords: 3 }],
    [{ ...RUN, action: 'play', until: 0.57 }],
    [{ ...RUN, action: 'play', until: 0 }],
    [{ ...RUN, action: 'play', overWords: 1 }],
    [{ ...RUN, action: 'play', overWords: BEAT_LIMITS.words }],
    [{ ...RUN, action: 'pause' }],
    [{ ...RUN, action: 'restart' }],
    [{ ...RUN, action: 'seek', to: 'peak' }],
    [{ ...RUN, action: 'seek', to: 1.25 }],
  ])('accepts %j', (command) => {
    expectAccepted(command);
  });

  it.each<[string, unknown, RegExp]>([
    ['an unknown action', { ...RUN, action: 'rewind' }, /action: expected one of play, pause, restart, seek/],
    ['no target', { kind: 'runSimulation', action: 'play' }, /target: expected an element id/],
    ['a stop on pause', { ...RUN, action: 'pause', until: 'peak' }, /until: unknown field/],
    ['a word count on pause', { ...RUN, action: 'pause', overWords: 3 }, /overWords: unknown field/],
    ['a stop on restart', { ...RUN, action: 'restart', until: 'peak' }, /until: unknown field/],
    ['a destination on play', { ...RUN, action: 'play', to: 'peak' }, /\.to: unknown field/],
    ['a stop on seek', { ...RUN, action: 'seek', to: 'peak', until: 'landing' }, /until: unknown field/],
    ['a word count on seek', { ...RUN, action: 'seek', to: 'peak', overWords: 3 }, /overWords: unknown field/],
    ['a seek with nowhere to go', { ...RUN, action: 'seek' }, /\.to: expected one of release, peak, landing/],
    ['a moment we do not have', { ...RUN, action: 'play', until: 'apex' }, /until: expected one of release, peak, landing/],
    ['negative seconds', { ...RUN, action: 'seek', to: -1 }, /\.to: expected a number from 0 to 3600/],
    ['infinite seconds', { ...RUN, action: 'play', until: Number.POSITIVE_INFINITY }, /until: expected a finite number/],
    ['zero words', { ...RUN, action: 'play', overWords: 0 }, /overWords: expected a whole number from 1 to 60/],
    ['more words than a beat holds', { ...RUN, action: 'play', overWords: BEAT_LIMITS.words + 1 }, /overWords: expected a whole number from 1 to 60/],
    ['part of a word', { ...RUN, action: 'play', overWords: 1.5 }, /overWords: expected a whole number/],
  ])('refuses %s', (_name, command, reason) => {
    expectRefused(parseSceneCommand(command), reason);
  });
});

describe('building in steps', () => {
  it.each(['plot', 'diagram', 'table', 'timeline', 'code'] as const)('lets a %s start empty', (kind) => {
    expectAccepted({ ...ONE_OF_EACH_COMMAND[kind], startsEmpty: false });
    expectRefused(parseSceneCommand({ ...ONE_OF_EACH_COMMAND[kind], startsEmpty: 'yes' }), /startsEmpty: expected true or false/);
  });

  it('does not let other commands start empty', () => {
    expectRefused(parseSceneCommand({ ...ONE_OF_EACH_COMMAND.writeMath, startsEmpty: true }), /startsEmpty: unknown field/);
  });

  it.each([
    [{ kind: 'reveal', target: 'values', upTo: 1 }],
    [{ kind: 'reveal', target: 'curve', upTo: -1.5 }],
    [{ kind: 'reveal', target: 'values', upTo: 3, overWords: BEAT_LIMITS.words }],
  ])('accepts %j', (command) => {
    expectAccepted(command);
  });

  it.each<[string, unknown, RegExp]>([
    ['no target', { kind: 'reveal', upTo: 1 }, /target: expected an element id/],
    ['a target with a part', { kind: 'reveal', target: 'values.row', upTo: 1 }, /target: expected an element id/],
    ['no count', { kind: 'reveal', target: 'values' }, /upTo: expected a finite number/],
    ['a count written as text', { kind: 'reveal', target: 'values', upTo: '1' }, /upTo: expected a finite number/],
    ['an infinite count', { kind: 'reveal', target: 'values', upTo: Number.POSITIVE_INFINITY }, /upTo: expected a finite number/],
    ['zero words', { kind: 'reveal', target: 'values', upTo: 1, overWords: 0 }, /overWords: expected a whole number from 1 to 60/],
    ['more words than a beat holds', { kind: 'reveal', target: 'values', upTo: 1, overWords: 61 }, /overWords: expected a whole number from 1 to 60/],
  ])('refuses a reveal with %s', (_name, command, reason) => {
    expectRefused(parseSceneCommand(command), reason);
  });
});

describe('wild numbers', () => {
  const POINT = { kind: 'construct', id: 'a', target: 'figure' };
  const LOW_AND_HIGH = /expected a low and a high number at least 0\.000001 apart/;

  it.each<[string, unknown, RegExp]>([
    ['a plot domain 1e308 wide', { ...PLOT, expression: 'x', domain: [-WILD, WILD] }, /domain\[0\]: expected a number from -1000000 to 1000000/],
    ['a plot domain too thin to sample', { ...PLOT, expression: 'x', domain: [0, 5e-324] }, LOW_AND_HIGH],
    ['a plot y range 1e308 wide', { ...PLOT, expression: 'x', yRange: [0, WILD] }, /yRange\[1\]: expected a number from/],
    ['a backwards plot y range', { ...PLOT, expression: 'x', yRange: [2, -2] }, LOW_AND_HIGH],
    ['a plot y range with one end', { ...PLOT, expression: 'x', yRange: [2] }, LOW_AND_HIGH],
    ['a number line 1e308 wide', { kind: 'numberLine', id: 'line', domain: [-WILD, WILD] }, /domain\[0\]: expected a number from/],
    ['a geometry x range 1e308 wide', { kind: 'geometry', id: 'figure', xRange: [0, WILD], yRange: [0, 1] }, /xRange\[1\]: expected a number from/],
    ['a geometry y range 1e308 wide', { kind: 'geometry', id: 'figure', xRange: [0, 1], yRange: [-WILD, 0] }, /yRange\[0\]: expected a number from/],
    ['a mark far off any axis', { kind: 'markValue', id: 'mark', target: 'line', at: WILD }, /\.at: expected a number from/],
    ['a huge reveal', { kind: 'reveal', target: 'values', upTo: WILD }, /upTo: expected a number from/],
    ['a huge negative reveal', { kind: 'reveal', target: 'curve', upTo: -WILD }, /upTo: expected a number from/],
    ['a seek past any flight', { ...RUN, action: 'seek', to: WILD }, /\.to: expected a number from 0 to 3600/],
    ['a play until past any flight', { ...RUN, action: 'play', until: 3601 }, /until: expected a number from 0 to 3600/],
    ['a vector angle of 1e308', { kind: 'vector', id: 'v', on: 'a', angleDegrees: WILD, length: 'short' }, /angleDegrees: expected a number from -360 to 360/],
    ['a vector angle past a full turn', { kind: 'vector', id: 'v', on: 'a', angleDegrees: -361, length: 'short' }, /angleDegrees: expected a number from -360 to 360/],
    ['an occurrence no math can hold', { kind: 'highlight', id: 'h', target: 'a', tex: 'x', occurrence: 9e15 }, /occurrence: expected a whole number from 0 to 499/],
    ['a point x of 1e308', { ...POINT, step: { shape: 'point', name: 'A', x: WILD, y: 0 } }, /step\.x: expected a number from/],
    ['a point y of -1e308', { ...POINT, step: { shape: 'point', name: 'A', x: 0, y: -WILD } }, /step\.y: expected a number from/],
  ])('refuses %s', (_name, command, reason) => {
    expectRefused(parseSceneCommand(command), reason);
  });

  it.each([
    [{ ...PLOT, expression: 'x', domain: [-COORDINATE_LIMIT, COORDINATE_LIMIT], yRange: [-COORDINATE_LIMIT, COORDINATE_LIMIT] }],
    [{ kind: 'markValue', id: 'mark', target: 'line', at: COORDINATE_LIMIT }],
    [{ kind: 'reveal', target: 'curve', upTo: -COORDINATE_LIMIT }],
    [{ ...RUN, action: 'seek', to: 3600 }],
    [{ ...POINT, step: { shape: 'point', name: 'A', x: -COORDINATE_LIMIT, y: COORDINATE_LIMIT } }],
    [{ kind: 'vector', id: 'v', on: 'a', angleDegrees: -360, length: 'short' }],
    [{ kind: 'highlight', id: 'h', target: 'a', tex: 'x', occurrence: 499 }],
  ])('accepts the largest value of %j', (command) => {
    expectAccepted(command);
  });
});

describe('simulation values', () => {
  const makeSimulate = (parameters: unknown) => ({ kind: 'simulate', id: 'shot', simulation: { model: 'projectile', parameters } });
  const SETTING = { kind: 'setParameter', target: 'shot' };
  const SLIDER = { kind: 'slider', id: 'speed', target: 'shot' };

  it.each<[string, Record<string, unknown>, RegExp]>([
    ['gravity of 0, which never lands', { gravity: 0 }, /gravity: expected a number from 0\.1 to 100/],
    ['negative gravity, which never lands', { gravity: -9.81 }, /gravity: expected a number from 0\.1 to 100/],
    ['a speed of 1e308', { horizontalSpeed: WILD }, /horizontalSpeed: expected a number from -100 to 100/],
    ['an upward speed of -1e308', { upwardSpeed: -WILD }, /upwardSpeed: expected a number from -100 to 100/],
    ['a release below the ground', { releaseHeight: -5 }, /releaseHeight: expected a number from 0 to 1000/],
    ['a release too high to draw', { releaseHeight: 1001 }, /releaseHeight: expected a number from 0 to 1000/],
  ])('refuses %s in a simulate', (_name, change, reason) => {
    expectRefused(parseSceneCommand(makeSimulate({ ...SHOT_WITHOUT_GRAVITY, ...change })), reason);
  });

  it('accepts the ends of every range in a simulate', () => {
    expectAccepted(makeSimulate({ horizontalSpeed: -100, upwardSpeed: 100, releaseHeight: 0, gravity: 0.1 }));
    expectAccepted(makeSimulate({ horizontalSpeed: 100, upwardSpeed: -100, releaseHeight: 1000, gravity: 100 }));
  });

  it.each<[string, number, RegExp]>([
    ['gravity', 0, /value: expected a number from 0\.1 to 100/],
    ['gravity', -WILD, /value: expected a number from 0\.1 to 100/],
    ['horizontalSpeed', 101, /value: expected a number from -100 to 100/],
    ['releaseHeight', -1, /value: expected a number from 0 to 1000/],
  ])('refuses a setParameter of %s to %d', (parameter, value, reason) => {
    expectRefused(parseSceneCommand({ ...SETTING, parameter, value }), reason);
  });

  it('accepts a setParameter inside the range', () => {
    expectAccepted({ ...SETTING, parameter: 'gravity', value: 1.62 });
  });

  it.each<[string, number, number, RegExp]>([
    ['gravity', 0, 20, /\.min: expected a number from 0\.1 to 100/],
    ['gravity', 1, 101, /\.max: expected a number from 0\.1 to 100/],
    ['horizontalSpeed', -WILD, WILD, /\.min: expected a number from -100 to 100/],
    ['releaseHeight', -1, 10, /\.min: expected a number from 0 to 1000/],
  ])('keeps a slider on %s inside the range: %d to %d', (parameter, min, max, reason) => {
    expectRefused(parseSceneCommand({ ...SLIDER, parameter, min, max }), reason);
  });

  it('accepts a slider across the whole range', () => {
    expectAccepted({ ...SLIDER, parameter: 'gravity', min: 0.1, max: 100 });
  });

  it('gives every parameter a range that holds its default', () => {
    expect(SIMULATION_PARAMETERS).toEqual(['horizontalSpeed', 'upwardSpeed', 'releaseHeight', 'gravity']);
    for (const parameter of SIMULATION_PARAMETERS) {
      const { min, max, default: defaultValue = min } = SIMULATION_PARAMETER_RULES[parameter];
      expect(min, parameter).toBeLessThan(max);
      expect(defaultValue, parameter).toBeGreaterThanOrEqual(min);
      expect(defaultValue, parameter).toBeLessThanOrEqual(max);
    }
  });

  it('uses one range for a parameter name across every model', () => {
    for (const { parameters } of Object.values(SIMULATION_MODELS)) {
      expect(SIMULATION_PARAMETER_RULES).toMatchObject(parameters);
    }
  });

  it('lets a seek reach the landing of the longest flight the ranges allow', () => {
    const { upwardSpeed, releaseHeight, gravity } = SIMULATION_MODELS.projectile.parameters;
    const landingSeconds = (upwardSpeed.max + Math.sqrt(upwardSpeed.max ** 2 + 2 * gravity.min * releaseHeight.max)) / gravity.min;
    expectAccepted({ ...RUN, action: 'seek', to: landingSeconds });
  });
});

describe('a frame with nothing in it', () => {
  const EMPTY_FRAMES: [string, Record<string, unknown>, RegExp][] = [
    ['a diagram with no nodes', { kind: 'diagram', id: 'd', nodes: [], edges: [] }, /nodes: expected at least one item/],
    ['a timeline with no events', { kind: 'timeline', id: 't', events: [] }, /events: expected at least one item/],
    ['a table with no columns or rows', { kind: 'table', id: 't', columns: [], rows: [] }, /columns: expected at least one item/],
    ['a table with no columns', { kind: 'table', id: 't', columns: [], rows: [[]] }, /columns: expected at least one item/],
    ['a table with no rows', { kind: 'table', id: 't', columns: ['x'], rows: [] }, /rows: expected at least one item/],
  ];

  it.each(EMPTY_FRAMES)('refuses %s', (_name, command, reason) => {
    expectRefused(parseSceneCommand(command), reason);
    expectRefused(parseSceneCommand({ ...command, startsEmpty: false }), reason);
  });

  it.each(EMPTY_FRAMES)('accepts %s that starts empty for reveal', (_name, command) => {
    expectAccepted({ ...command, startsEmpty: true });
  });
});

describe('changing a value', () => {
  it.each<[string, unknown, RegExp]>([
    ['an unknown parameter', { kind: 'setParameter', target: 'shot', parameter: 'spin', value: 1 }, /parameter: expected one of/],
    ['a value written as text', { kind: 'setParameter', target: 'shot', parameter: 'gravity', value: '1' }, /value: expected a finite number/],
    ['no value', { kind: 'setParameter', target: 'shot', parameter: 'gravity' }, /value: expected a finite number/],
    ['no target', { kind: 'setParameter', parameter: 'gravity', value: 1 }, /target: expected an element id/],
  ])('refuses a setParameter with %s', (_name, command, reason) => {
    expectRefused(parseSceneCommand(command), reason);
  });

  it('tracks exactly the four quantities the design names', () => {
    expect(TRACKED_QUANTITIES).toEqual(['velocity', 'velocity-x', 'velocity-y', 'acceleration']);
    for (const quantity of TRACKED_QUANTITIES) expectAccepted({ kind: 'trackVector', id: 'arrow', target: 'shot', quantity });
    expectRefused(parseSceneCommand({ kind: 'trackVector', id: 'arrow', target: 'shot', quantity: 'speed' }), /quantity: expected one of/);
  });
});

describe('annotate', () => {
  const MARK = { kind: 'annotate', id: 'mark', target: 'ink-1' };

  it.each(['underline', 'circle', 'check', 'cross'])('marks student work with a %s', (mark) => {
    expectAccepted({ ...MARK, mark });
  });

  it('takes a label, checked as a label', () => {
    expectAccepted({ ...MARK, mark: 'cross', label: 'flip the sign' });
    expectRefused(parseSceneCommand({ ...MARK, mark: 'cross', label: 'x'.repeat(81) }), /label: expected at most 80 characters/);
    expectRefused(parseSceneCommand({ ...MARK, mark: 'cross', label: 7 }), /label: expected text/);
  });

  it('refuses a mark we do not have', () => {
    expectRefused(parseSceneCommand({ ...MARK, mark: 'star' }), /mark: expected one of underline, circle, check, cross/);
  });
});

describe('marks can be removed', () => {
  it.each(['highlight', 'annotate', 'markValue', 'ghostPath', 'construct'] as const)('requires an id on a %s, so hide can remove it', (kind) => {
    expectRefused(parseSceneCommand(withoutField(ONE_OF_EACH_COMMAND[kind], 'id')), /\.id: expected an element id/);
  });

  it('picks one match of a term by whole occurrence, counting from 0', () => {
    const highlight = { kind: 'highlight', id: 'term', target: 'equation', tex: 'x' };
    expectAccepted({ ...highlight, occurrence: 0 });
    expectAccepted({ ...highlight, occurrence: 2 });
    expectRefused(parseSceneCommand({ ...highlight, occurrence: -1 }), /occurrence: expected a whole number/);
    expectRefused(parseSceneCommand({ ...highlight, occurrence: 0.5 }), /occurrence: expected a whole number/);
  });

  it('checks plot axis labels as labels', () => {
    expectRefused(parseSceneCommand({ ...ONE_OF_EACH_COMMAND.plot, xLabel: 'x'.repeat(81) }), /xLabel: expected at most 80 characters/);
    expectRefused(parseSceneCommand({ ...ONE_OF_EACH_COMMAND.plot, yLabel: 7 }), /yLabel: expected text/);
  });
});

describe('image', () => {
  it('shows a picture from our set or a shared file', () => {
    expectAccepted({ kind: 'image', id: 'painting', asset: 'saturn', alt: 'Saturn' });
    expectAccepted({ kind: 'image', id: 'homework', fileId: '3f2b8c1e-7d4a-4f6e-9b1c-2a5d8e7f0c3b', alt: 'The student worksheet' });
  });

  it.each<[string, unknown, RegExp]>([
    ['both sources', { kind: 'image', id: 'a', asset: 'saturn', fileId: 'file-1', alt: 'x' }, /either an asset or a fileId/],
    ['no source', { kind: 'image', id: 'a', alt: 'x' }, /either an asset or a fileId/],
    ['a path as a file id', { kind: 'image', id: 'a', fileId: '../../secret', alt: 'x' }, /fileId: expected a file id/],
    ['a capital in a file id', { kind: 'image', id: 'a', fileId: 'File-1', alt: 'x' }, /fileId: expected a file id/],
    ['no description', { kind: 'image', id: 'a', fileId: 'file-1' }, /alt: expected text/],
  ])('refuses %s', (_name, command, reason) => {
    expectRefused(parseSceneCommand(command), reason);
  });
});

describe('names a hostile model might write', () => {
  const HOSTILE_NAMES: [string, RegExp][] = [
    ['__proto__', /expected a name/],
    ['constructor', /expected a name/],
    ['prototype', /expected a name/],
    ['hasOwnProperty', /expected a name/],
    ['toString', /expected a name/],
    ['my node', /expected a name/],
    ['<b onclick=alert(1)>', /expected a name/],
    ['-leading-hyphen', /expected a name/],
    ['x'.repeat(41), /expected a name/],
  ];

  const NAMED_PLACES: [string, (name: string) => unknown][] = [
    ['a geometry point', (name) => ({ kind: 'construct', id: 'a', target: 'f', step: { shape: 'point', name, x: 0, y: 0 } })],
    ['a segment start', (name) => ({ kind: 'construct', id: 'a', target: 'f', step: { shape: 'segment', from: name, to: 'B' } })],
    ['a circle center', (name) => ({ kind: 'construct', id: 'a', target: 'f', step: { shape: 'circle', center: name, through: 'B' } })],
    ['an angle corner', (name) => ({ kind: 'construct', id: 'a', target: 'f', step: { shape: 'angle', at: name, from: 'A', to: 'B' } })],
    ['a diagram node', (name) => ({ kind: 'diagram', id: 'a', nodes: [{ name, label: 'x' }], edges: [] })],
    ['a drawing label part', (name) => ({ kind: 'drawing', id: 'a', name: 'hoop-side', labels: [{ part: name, text: 'x' }] })],
  ];

  describe.each(NAMED_PLACES)('in %s', (_place, makeCommand) => {
    it.each(HOSTILE_NAMES)('refuses %s', (name, reason) => {
      expectRefused(parseSceneCommand(makeCommand(name)), reason);
    });

    it.each(['A', 'oxygen-atom', 'H2', 'x'.repeat(40)])('accepts %s', (name) => {
      expect(parseSceneCommand(makeCommand(name)).ok).toBe(true);
    });
  });

  it.each(['__proto__', 'constructor', 'prototype'])('refuses %s as an element id', (name) => {
    expectRefused(parseSceneCommand({ kind: 'writeMath', id: name, tex: 'x' }), /\.id: expected an element id/);
  });

  it.each(['constructor', 'prototype', 'constructor.prototype', 'shot.__proto__', 'shot.constructor', 'shot.prototype', 'shot.hasOwnProperty', 'shot.my node', 'shot.'])(
    'refuses %s as a reference',
    (target) => {
      expectRefused(parseSceneCommand({ kind: 'focus', target }), /target: expected an element reference/);
    },
  );

  it('accepts a name in a reference that a diagram can create', () => {
    expectAccepted({ kind: 'focus', target: 'water.oxygen-atom' });
    expectAccepted({ kind: 'diagram', id: 'water', nodes: [{ name: 'oxygen-atom', label: 'Oxygen' }], edges: [] });
  });

  it.each(['constructor', 'prototype'])('refuses %s as a beat id', (id) => {
    expectRefused(parseBeat({ id, script: ['Watch.'], expectsReply: false }), /beat\.id: expected a beat id/);
  });

  it('leaves Object.prototype alone', () => {
    const before = Object.getOwnPropertyNames(Object.prototype);
    const hostile = JSON.parse('{"kind":"diagram","id":"d","nodes":[{"name":"__proto__","label":"x"}],"edges":[{"from":"__proto__","to":"polluted"}]}');
    expectRefused(parseSceneCommand(hostile), /nodes\[0\]\.name: expected a name/);
    expect(Object.getOwnPropertyNames(Object.prototype)).toEqual(before);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('a diagram edge', () => {
  const nodes = [{ name: 'a', label: 'Rain' }, { name: 'b', label: 'River' }];

  it('joins nodes of its own diagram', () => {
    expectAccepted({ kind: 'diagram', id: 'cycle', nodes, edges: [{ from: 'a', to: 'b' }] });
  });

  it('cannot be aimed at a name two nodes share', () => {
    const twice = [{ name: 'a', label: 'Rain' }, { name: 'a', label: 'River' }];
    expectRefused(parseSceneCommand({ kind: 'diagram', id: 'cycle', nodes: twice, edges: [] }), /nodes: expected each node name once/);
  });

  it.each<[string, unknown]>([
    ['a start', { from: 'missing', to: 'b' }],
    ['an end', { from: 'a', to: 'missing' }],
  ])('refuses %s that is not a node', (_name, edge) => {
    expectRefused(parseSceneCommand({ kind: 'diagram', id: 'cycle', nodes, edges: [edge] }), /edges\[0\]\.\w+: expected a node of this diagram/);
  });
});

describe('free text', () => {
  const TEXT_PLACES: [string, (text: string) => unknown][] = [
    ['text', (text) => ({ kind: 'text', id: 'note', text })],
    ['alt', (alt) => ({ kind: 'image', id: 'picture', asset: 'saturn', alt })],
    ['label', (label) => ({ kind: 'markValue', id: 'mark', target: 'line', at: 1, label })],
    ['source', (source) => ({ kind: 'code', id: 'snippet', language: 'python', source })],
  ];
  const UNSAFE_CHARACTERS = ['\u0007', '\u000B', '\u000C', '\r', '\u001B', '\u007F', '\u0085', '\u202A', '\u202B', '\u202C', '\u202D', '\u202E', '\u2066', '\u2067', '\u2068', '\u2069'];

  describe.each(TEXT_PLACES)('in %s', (place, makeCommand) => {
    it.each(UNSAFE_CHARACTERS)('refuses the character %j', (character) => {
      expectRefused(parseSceneCommand(makeCommand(`a${character}b`)), new RegExp(`${place}: expected text with no control or bidi characters`));
    });

    it.each(['\t', '\n'])('accepts %j', (character) => {
      expect(parseSceneCommand(makeCommand(`a${character}b`)).ok).toBe(true);
    });

    it('accepts the right-to-left text a student might read', () => {
      expect(parseSceneCommand(makeCommand('מים נוזל')).ok).toBe(true);
    });
  });

  it('keeps the lines and indents of code, and nothing else below a space', () => {
    expectAccepted({ kind: 'code', id: 'snippet', language: 'python', source: 'def f(x):\n\treturn x\n' });
    expectRefused(parseSceneCommand({ kind: 'code', id: 'snippet', language: 'python', source: 'def f(x):\r\n\treturn x' }), /source: expected text with no control/);
  });
});

describe('code', () => {
  it.each(['python', 'c++', 'c#', 'objective-c', 'x'.repeat(20)])('accepts %s as a language', (language) => {
    expectAccepted({ kind: 'code', id: 'snippet', language, source: 'x' });
  });

  it.each(['Python', 'a b', '"><svg onload=x()>', '', 'x'.repeat(21)])('refuses %j as a language', (language) => {
    expectRefused(parseSceneCommand({ kind: 'code', id: 'snippet', language, source: 'x' }), /language: expected a code language name/);
  });
});

describe('plot.expression', () => {
  it.each([
    'x',
    'x^2',
    '(x-1)*(x+1)*(x+2)',
    'sin(x)/x',
    '2*x + 1',
    '3.5*x',
    '.5*x',
    '-x',
    'e^x',
    'pi*x',
    'exp(-x)',
    'ln(x)',
    'log(x)',
    'sqrt(abs(x))',
    'cos(x)^2 + tan(x)',
    'sin (x)',
  ])('accepts %s', (expression) => {
    expectAccepted({ ...PLOT, expression });
  });

  it.each([
    'alert(1)',
    'x.constructor',
    'process.exit()',
    '`x`',
    "constructor.constructor('alert(1)')()",
    'y = x^2',
    'x**2',
    '+++',
    '((((',
    'sin(',
    '()',
    '1,2',
    'log(x, 2)',
    `${'sqrt('.repeat(33)}x${')'.repeat(33)}`,
    String.raw`\frac{x}{2}`,
    'the parabola',
    '2x',
    '2 x',
    'x2',
    'xx',
    '2(x)',
    '(x)(x)',
    '(x)2',
    'x(x)',
    'sin x',
    'sinx',
    '2sin(x)',
    '1.',
    '1e5',
    'x\n+1',
  ])('refuses %j', (expression) => {
    expectRefused(parseSceneCommand({ ...PLOT, expression }), /expression: expected an expression in x/);
  });
});

describe('tex', () => {
  const MATH_COMMANDS: [string, (tex: string) => unknown][] = [
    ['writeMath', (tex) => ({ kind: 'writeMath', id: 'eq', tex })],
    ['transformMath', (tex) => ({ kind: 'transformMath', target: 'eq', tex })],
    ['highlight', (tex) => ({ kind: 'highlight', id: 'term', target: 'eq', tex })],
  ];

  describe.each(MATH_COMMANDS)('in %s', (_kind, makeCommand) => {
    it.each([
      ['a form feed, which is what JSON makes of an unescaped frac', JSON.parse(String.raw`"\frac{1}{2}"`) as string],
      ['a tab, which is what JSON makes of an unescaped theta', JSON.parse(String.raw`"\theta"`) as string],
      ['a newline, which is what JSON makes of an unescaped neq', JSON.parse(String.raw`"\neq"`) as string],
      ['a backspace, which is what JSON makes of an unescaped beta', JSON.parse(String.raw`"\beta"`) as string],
    ])('refuses %s', (_name, tex) => {
      expectRefused(parseSceneCommand(makeCommand(tex)), /tex: expected math with no control characters/);
    });

    it('accepts math with its backslashes intact', () => {
      expect(parseSceneCommand(makeCommand(String.raw`\frac{1}{2} + \theta`)).ok).toBe(true);
    });

    it.each([
      String.raw`\href{javascript:alert(1)}{x}`,
      String.raw`\href {https://example.com}{x}`,
      String.raw`x + \url{https://example.com}`,
      String.raw`\includegraphics{https://example.com/a.png}`,
      String.raw`\htmlClass{a}{x}`,
      String.raw`\htmlId{a}{x}`,
      String.raw`\htmlStyle{color:red}{x}`,
      String.raw`\htmlData{a=b}{x}`,
      String.raw`\html{x}`,
    ])('refuses %s, which needs trust KaTeX does not give', (tex) => {
      expectRefused(parseSceneCommand(makeCommand(tex)), /tex: expected math with no links, images, or raw HTML/);
    });

    it.each([String.raw`\urcorner`, String.raw`\hrule`, 'href', 'url'])('accepts %s, which only looks like one', (tex) => {
      expect(parseSceneCommand(makeCommand(tex)).ok).toBe(true);
    });

    it('refuses a bidi override', () => {
      expectRefused(parseSceneCommand(makeCommand('a\u202Eb')), /tex: expected text with no control or bidi characters/);
    });
  });
});

describe('stored simulations when a parameter is added later', () => {
  const makeSimulate = (parameters: unknown) => ({ kind: 'simulate', id: 'shot', simulation: { model: 'projectile', parameters } });

  it('fills in the default for a row written before gravity existed', () => {
    const command = commandOrThrow(makeSimulate(SHOT_WITHOUT_GRAVITY));
    expect(command).toEqual(makeSimulate({ ...SHOT_WITHOUT_GRAVITY, gravity: 9.81 }));
  });

  it('keeps a value the row did give', () => {
    const command = commandOrThrow(makeSimulate({ ...SHOT_WITHOUT_GRAVITY, gravity: 1.62 }));
    expect(command).toEqual(makeSimulate({ ...SHOT_WITHOUT_GRAVITY, gravity: 1.62 }));
  });

  it('still checks a value the row did give', () => {
    expectRefused(parseSceneCommand(makeSimulate({ ...SHOT_WITHOUT_GRAVITY, gravity: 'low' })), /gravity: expected a finite number/);
  });

  it('still refuses a row missing a required value', () => {
    expectRefused(parseSceneCommand(makeSimulate({ upwardSpeed: 5.6, releaseHeight: 2.2 })), /horizontalSpeed: expected a finite number/);
  });

  it('refuses a model name that only exists on Object.prototype', () => {
    const command = { kind: 'simulate', id: 'shot', simulation: { model: 'constructor', parameters: {} } };
    expectRefused(parseSceneCommand(command), /model: expected one of projectile/);
  });
});

describe('a beat holding a command', () => {
  it('reads commands with the same rules as parseSceneCommand', () => {
    expectRefused(parseBeat(withCommand({ kind: 'focus', target: 'constructor' })), /script\[0\]\.target: expected an element reference/);
  });
});
