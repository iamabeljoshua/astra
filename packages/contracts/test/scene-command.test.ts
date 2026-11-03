import { describe, expect, it } from 'vitest';
import { BEAT_LIMITS, parseBeat, parseSceneCommand, SCENE_COMMAND_KINDS, TRACKED_QUANTITIES } from '../src/index.ts';
import { commandOrThrow, expectRefused, ONE_OF_EACH_COMMAND, withCommand, withoutField } from './helpers.ts';

const RUN = { kind: 'runSimulation', target: 'shot' };
const SHOT_WITHOUT_GRAVITY = { horizontalSpeed: 4.2, upwardSpeed: 5.6, releaseHeight: 2.2 };
const PLOT = { kind: 'plot', id: 'curve', domain: [-2, 2] };

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
    ['negative seconds', { ...RUN, action: 'seek', to: -1 }, /\.to: expected simulation seconds of 0 or more/],
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

  it.each<[string, unknown]>([
    ['a start', { from: 'missing', to: 'b' }],
    ['an end', { from: 'a', to: 'missing' }],
  ])('refuses %s that is not a node', (_name, edge) => {
    expectRefused(parseSceneCommand({ kind: 'diagram', id: 'cycle', nodes, edges: [edge] }), /edges\[0\]\.\w+: expected a node of this diagram/);
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
    'log(x, 2)',
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
    'x**2 + y',
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
