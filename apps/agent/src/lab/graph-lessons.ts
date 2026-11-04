import type { Beat } from '@astra/contracts';
import { makeBeat } from './make-beat.ts';

const SHOT = { horizontalSpeed: 4.2, upwardSpeed: 5.6, releaseHeight: 2.2, gravity: 9.8 };

/** PRD section 6.4, played straight through, with the student's turns left out. */
const SHOT_LESSON: readonly (readonly Beat[])[] = [
  [
    makeBeat('point-guard', [
      { kind: 'drawing', id: 'court', name: 'hoop-side' },
      'You said you play point guard, ',
      { kind: 'simulate', id: 'shot', simulation: { model: 'projectile', parameters: SHOT }, over: 'court' },
      "so let's use your jump shot. ",
    ]),
    makeBeat('your-hand', [
      'Your ',
      { kind: 'vector', id: 'hand-push', on: 'shot.ball', angleDegrees: 53, length: 'medium', label: 'hand' },
      'hand, right up until it ',
      { kind: 'hide', target: 'hand-push' },
      'lets go. ',
      { kind: 'focus', target: 'shot.ball' },
      'After that? ',
    ]),
    makeBeat('nothing', [
      'Nothing. ',
      { kind: 'trackVector', id: 'sideways', target: 'shot', quantity: 'velocity-x', label: 'sideways' },
      'So its sideways speed never changes. ',
      { kind: 'trackVector', id: 'upward', target: 'shot', quantity: 'velocity-y', label: 'up and down' },
      'Watch this arrow. ',
    ]),
    makeBeat('the-climb', [
      { kind: 'readout', id: 'height-now', target: 'shot', quantity: 'height' },
      { kind: 'runSimulation', target: 'shot', action: 'play', until: 'peak', overWords: 7 },
      'It climbs, slower and slower, until it ',
      { kind: 'annotate', id: 'top-mark', target: 'shot.ball', mark: 'circle', label: 'top' },
      'hangs at the very top. ',
    ]),
    makeBeat('the-fall', [
      { kind: 'runSimulation', target: 'shot', action: 'play', until: 'landing', overWords: 7 },
      'Then gravity pulls it all the way down. ',
    ]),
    makeBeat('you-drive', [
      { kind: 'ghostPath', id: 'first-arc', target: 'shot' },
      'Now you drive. ',
      { kind: 'slider', id: 'sideways-speed', target: 'shot', parameter: 'horizontalSpeed', min: 0, max: 10 },
      'If you double the sideways speed and leave the upward speed alone, where does it land? ',
    ]),
  ],
];

const GRAPH_LESSON: readonly (readonly Beat[])[] = [
  [
    makeBeat('parabola', [
      { kind: 'plot', id: 'curve', expression: 'a*x^2', constants: [{ name: 'a', value: 1, min: 0.25, max: 3 }], domain: [-3, 3], startsEmpty: true, label: 'y = a x squared', xLabel: 'x', yLabel: 'y' },
      'Here is a parabola. ',
      { kind: 'reveal', target: 'curve', upTo: 3, overWords: 8 },
      'It draws from left to right, as I say this. ',
    ]),
    makeBeat('steeper', [
      { kind: 'setParameter', target: 'curve', constant: 'a', value: 2, overWords: 6 },
      'Now make a twice as big, and watch it narrow. ',
      { kind: 'markValue', id: 'at-two', target: 'curve', at: 2, label: 'here' },
      'Here it reaches eight. ',
      { kind: 'slider', id: 'a-slider', target: 'curve', constant: 'a', min: 0.25, max: 3 },
      'You can drag this one too. ',
    ]),
    makeBeat('area', [
      { kind: 'shadeArea', id: 'area', target: 'curve', from: 0, to: 2, label: 'area' },
      'The shaded part is the area under it. ',
      { kind: 'plot', id: 'line', over: 'curve', expression: 'x+2', domain: [-3, 3], label: 'y = x + 2' },
      'And a straight line on the same axes. ',
    ]),
    makeBeat('asymptote', [
      { kind: 'clearBoard' },
      { kind: 'plot', id: 'inverse', expression: '1/x', domain: [-5, 5], label: 'y = 1/x', xLabel: 'x', yLabel: 'y' },
      'One over x breaks at zero, and no line crosses the break. ',
      { kind: 'plot', id: 'wave', over: 'inverse', expression: 'tan(x)', domain: [-5, 5] },
      'Tangent breaks at each of its poles the same way. ',
    ]),
    makeBeat('edges', [
      { kind: 'clearBoard' },
      { kind: 'plot', id: 'root', expression: 'sqrt(x)', domain: [-2, 9], label: 'y = root x', xLabel: 'x', yLabel: 'y' },
      'A square root starts at exactly zero. ',
      { kind: 'plot', id: 'jump', expression: 'abs(x-1)/(x-1)', domain: [-3, 3], yRange: [-2, 2], label: 'a jump' },
      'And a jump stays a jump. ',
    ]),
  ],
];

const NUMBER_LINE_LESSON: readonly (readonly Beat[])[] = [
  [
    makeBeat('the-line', [
      { kind: 'numberLine', id: 'line', domain: [-5, 5] },
      'Here is a number line. ',
      { kind: 'markValue', id: 'start', target: 'line', at: -3, label: 'start' },
      'We start at minus three ',
      { kind: 'markValue', id: 'end', target: 'line', at: 2, label: 'end' },
      'and move five steps to two. ',
      { kind: 'markValue', id: 'half', target: 'line', at: 0.5 },
      'And here is one half. ',
    ]),
  ],
];

const point = (id: string, name: string, x: number, y: number) => ({ kind: 'construct', id, target: 'figure', step: { shape: 'point', name, x, y } });
const segment = (id: string, from: string, to: string) => ({ kind: 'construct', id, target: 'figure', step: { shape: 'segment', from, to } });

const TRIANGLE_LESSON: readonly (readonly Beat[])[] = [
  [
    makeBeat('two-points', [
      { kind: 'geometry', id: 'figure', xRange: [0, 7], yRange: [0, 6] },
      'Start with ',
      point('a', 'A', 1, 1),
      'a point, ',
      point('b', 'B', 5, 1),
      'and a second point, ',
      segment('ab', 'A', 'B'),
      'with a side between them. ',
    ]),
    makeBeat('third', [
      point('c', 'C', 1, 4),
      'Put C straight above A. ',
      segment('ac', 'A', 'C'),
      'Join them, ',
      segment('bc', 'B', 'C'),
      'and close the triangle. ',
    ]),
    makeBeat('angles', [
      { kind: 'construct', id: 'at-a', target: 'figure', step: { shape: 'angle', at: 'A', from: 'B', to: 'C' } },
      'The angle at A is a right angle. ',
      { kind: 'construct', id: 'at-b', target: 'figure', step: { shape: 'angle', at: 'B', from: 'C', to: 'A' } },
      'The one at B is computed too. ',
      { kind: 'construct', id: 'round', target: 'figure', step: { shape: 'circle', center: 'A', through: 'B' } },
      'A circle around A through B stays round. ',
    ]),
  ],
];

const force = (id: string, angleDegrees: number, length: string, label: string) => ({ kind: 'vector', id, on: 'body.block', angleDegrees, length, label });

const FREE_BODY_LESSON: readonly (readonly Beat[])[] = [
  [
    makeBeat('the-block', [
      { kind: 'geometry', id: 'body', xRange: [0, 10], yRange: [0, 6] },
      { kind: 'construct', id: 'block', target: 'body', step: { shape: 'point', name: 'block', x: 5, y: 3 } },
      'Take a block on a table. ',
      force('weight', -90, 'long', 'weight'),
      'Its weight pulls it down. ',
      force('normal', 90, 'long', 'normal force'),
      'The table pushes back up. ',
      force('push', 0, 'medium', 'your push'),
      'You push it to the right, ',
      force('friction', 180, 'short', 'friction'),
      'and friction pushes back. ',
    ]),
  ],
];

const LAUNCH_LESSON: readonly (readonly Beat[])[] = [
  [
    makeBeat('launch', [
      { kind: 'simulate', id: 'cannon', simulation: { model: 'projectile', parameters: { horizontalSpeed: 10, upwardSpeed: 10, releaseHeight: 0, gravity: 9.8 } } },
      'A ball leaves the ground at forty five degrees. ',
      { kind: 'readout', id: 'how-far', target: 'cannon', quantity: 'landing-distance' },
      { kind: 'readout', id: 'how-high', target: 'cannon', quantity: 'peak-height' },
      { kind: 'readout', id: 'air-time', target: 'cannon', quantity: 'time', label: 'Flight time' },
      { kind: 'runSimulation', target: 'cannon', action: 'play', until: 'landing', rate: 0.5 },
      'Watch it at half speed. ',
      { kind: 'trackVector', id: 'velocity', target: 'cannon', quantity: 'velocity', label: 'velocity' },
      { kind: 'trackVector', id: 'pull', target: 'cannon', quantity: 'acceleration', label: 'gravity' },
      'Its velocity turns, and gravity never changes. ',
      { kind: 'slider', id: 'angle', target: 'cannon', parameter: 'launchAngle', min: 10, max: 80 },
      'Change the angle and see how far it goes. ',
    ]),
  ],
];

const MARKUP = '<img src=x onerror="window.pwned=1">';

const FIGURE_HOSTILE_LESSON: readonly (readonly Beat[])[] = [
  [
    makeBeat('crowded', [
      { kind: 'plot', id: 'busy', expression: 'sin(x)', domain: [-1000000, 1000000], yRange: [-1, 1], label: MARKUP, xLabel: 'w'.repeat(80), yLabel: 'W'.repeat(80) },
      'A label full of markup on a huge domain. ',
      { kind: 'markValue', id: 'm1', target: 'busy', at: 0, label: 'first label here' },
      { kind: 'markValue', id: 'm2', target: 'busy', at: 0, label: 'second label here' },
      { kind: 'markValue', id: 'm3', target: 'busy', at: 0, label: 'third label here' },
      { kind: 'markValue', id: 'm4', target: 'busy', at: 0, label: 'fourth label here' },
      { kind: 'markValue', id: 'm5', target: 'busy', at: 900000, label: 'far along the axis' },
      'Five marks in the same place. ',
    ]),
    makeBeat('deep', [
      { kind: 'clearBoard' },
      { kind: 'plot', id: 'nest', expression: `${'sqrt('.repeat(30)}abs(x)${')'.repeat(30)}`, domain: [-1, 1], label: 'nested as deep as allowed' },
      'A curve nested as deep as allowed. ',
      { kind: 'plot', id: 'bomb', expression: '9^9^9^9^x', domain: [-3, 3] },
      'A curve that blows up. ',
      { kind: 'plot', id: 'never', expression: 'sqrt(-1-x*x)', domain: [-3, 3], yRange: [-1, 1], label: 'no real values' },
      'And a curve with no values at all. ',
    ]),
    makeBeat('out-of-range', [
      { kind: 'clearBoard' },
      { kind: 'plot', id: 'small', expression: 'a*x', constants: [{ name: 'a', value: 1, min: 0, max: 2 }], domain: [0, 1] },
      { kind: 'reveal', target: 'small', upTo: 99 },
      'A reveal past the end of its axes. ',
      { kind: 'setParameter', target: 'small', constant: 'a', value: 500 },
      'A constant set far past its range. ',
      { kind: 'setParameter', target: 'small', constant: 'nope', value: 1 },
      'A constant that does not exist. ',
      { kind: 'markValue', id: 'nothing', target: 'small', at: 0.5, label: 'still fine' },
      'And the board still works. ',
    ]),
    makeBeat('bad-geometry', [
      { kind: 'clearBoard' },
      { kind: 'geometry', id: 'figure', xRange: [0, 4], yRange: [0, 4] },
      { kind: 'construct', id: 'orphan', target: 'figure', step: { shape: 'segment', from: 'nope', to: 'neither' } },
      'A side between points that do not exist. ',
      point('far', 'far', 500, 500),
      point('near', 'N', 2, 2),
      { kind: 'construct', id: 'long', target: 'figure', step: { shape: 'segment', from: 'N', to: 'far' } },
      'A side running off the figure. ',
      { kind: 'construct', id: 'dot-angle', target: 'figure', step: { shape: 'angle', at: 'N', from: 'N', to: 'N' } },
      'An angle with no sides. ',
    ]),
  ],
];

const WORDS = 'Here is a thing to look at. ';

const wave = (id: string, expression: string, domain: [number, number]) => makeBeat(id, [{ kind: 'clearBoard' }, { kind: 'plot', id, expression, domain, label: `y = ${expression}`, xLabel: 'x', yLabel: 'y' }, WORDS]);

const FIGURE_WAVES_LESSON: readonly (readonly Beat[])[] = [
  [makeBeat('slider-wave', [{ kind: 'plot', id: 'wave', expression: 'sin(a*x)', constants: [{ name: 'a', value: 1, min: 1, max: 10 }], domain: [-10, 10], label: 'y = sin(a x)', xLabel: 'x', yLabel: 'y' }, 'Here is a wave. ', { kind: 'slider', id: 'a-slider', target: 'wave', constant: 'a', min: 1, max: 10 }, 'Drag this to change how fast it wiggles. '])],
  [wave('slow', 'sin(x)', [-50, 50]), wave('two-pi', 'sin(2*pi*x)', [-10, 10]), wave('folded', 'abs(sin(x))', [-20, 20]), wave('fast', 'sin(30*x)', [-10, 10]), wave('band', 'sin(1000*x)', [-10, 10]), wave('poles', 'tan(10*x)', [-10, 10]), wave('inverse', '1/x', [-5, 5]), wave('tangent', 'tan(x)', [-5, 5]), wave('jump', 'abs(x-1)/(x-1)', [-3, 3]), wave('root', 'sqrt(x)', [-2, 9])],
];

const FIGURE_REUSE_LESSON: readonly (readonly Beat[])[] = [
  [
    makeBeat('first', [{ kind: 'plot', id: 'c1', expression: 'a*x', constants: [{ name: 'a', value: 1, min: 0, max: 2 }], domain: [0, 5], label: 'first' }, { kind: 'slider', id: 's', target: 'c1', constant: 'a', min: 0, max: 2 }, 'Here is the first one, with a slider. ']),
  ],
  [
    makeBeat('second', [{ kind: 'clearBoard' }, { kind: 'plot', id: 'c2', expression: 'b*x', constants: [{ name: 'b', value: 15, min: 10, max: 20 }], domain: [0, 5], label: 'second' }, { kind: 'slider', id: 's', target: 'c2', constant: 'b', min: 10, max: 20 }, 'Now the second, with its own slider. ']),
  ],
  [
    makeBeat('third', [{ kind: 'plot', id: 'c2', expression: 'x^2', domain: [-3, 3], label: 'a new curve in the same place' }, 'And a new curve in the same place. ']),
  ],
];

const FIGURE_MARKS_LESSON: readonly (readonly Beat[])[] = [
  [
    makeBeat('on-a-line', [{ kind: 'numberLine', id: 'line', domain: [0, 10] }, { kind: 'markValue', id: 'start', target: 'line', at: 3, label: 'start' }, { kind: 'markValue', id: 'off', target: 'line', at: 99 }, { kind: 'annotate', id: 'on-line', target: 'line.start', mark: 'circle', label: 'circled' }, WORDS]),
    makeBeat('on-a-curve', [{ kind: 'clearBoard' }, { kind: 'plot', id: 'c', expression: 'x^2', domain: [-2, 2] }, { kind: 'annotate', id: 'on-curve', target: 'c.curve', mark: 'circle', label: 'bend' }, { kind: 'annotate', id: 'on-bad', target: 'c.peak', mark: 'circle', label: 'peak' }, { kind: 'markValue', id: 'too-far', target: 'c', at: 9 }, WORDS]),
    makeBeat('on-a-point', [{ kind: 'clearBoard' }, { kind: 'geometry', id: 'g', xRange: [0, 6], yRange: [0, 6] }, { kind: 'construct', id: 'pa', target: 'g', step: { shape: 'point', name: 'A', x: 2, y: 2 } }, { kind: 'annotate', id: 'on-a', target: 'g.A', mark: 'circle', label: 'A is here' }, { kind: 'annotate', id: 'on-z', target: 'g.Z', mark: 'circle', label: 'Z is nowhere' }, WORDS, { kind: 'hide', target: 'pa' }, WORDS]),
    makeBeat('on-a-flight', [{ kind: 'clearBoard' }, { kind: 'simulate', id: 's', simulation: { model: 'projectile', parameters: { horizontalSpeed: 4, upwardSpeed: 4, releaseHeight: 1, gravity: 9.8 } } }, { kind: 'annotate', id: 'on-path', target: 's.path', mark: 'circle', label: 'the path' }, { kind: 'annotate', id: 'on-ball', target: 's.ball', mark: 'check', label: 'the ball' }, WORDS]),
  ],
];

const FIGURE_LABELS_LESSON: readonly (readonly Beat[])[] = [
  [
    makeBeat('wide-letters', [
      { kind: 'plot', id: 'p', expression: 'x^2', domain: [-3, 3], label: '\u0645\u0646\u062D\u0646\u0649 \u0627\u0644\u0642\u0637\u0639 \u0627\u0644\u0645\u0643\u0627\u0641\u0626', xLabel: '\u0633', yLabel: '\u0635' },
      { kind: 'markValue', id: 'm1', target: 'p', at: 1, label: '\u0627\u0644\u0646\u0642\u0637\u0629' },
      { kind: 'markValue', id: 'm2', target: 'p', at: 2, label: '\u05E0\u05E7\u05D5\u05D3\u05D4' },
      { kind: 'markValue', id: 'm3', target: 'p', at: -1, label: '\u653E\u7269\u7DDA\u306E\u9802\u70B9\u306F\u3053\u3053\u3067\u3059' },
      { kind: 'markValue', id: 'm4', target: 'p', at: -2, label: '\u{1F600}'.repeat(10) },
      { kind: 'markValue', id: 'm5', target: 'p', at: 0, label: '\uFDFD\uFDFD\uFDFD' },
      { kind: 'markValue', id: 'm6', target: 'p', at: 2.5, label: `${'Supercalifragilisticexpialidocious_'.repeat(2)}Supercali` },
      { kind: 'markValue', id: 'm7', target: 'p', at: -2.5, label: '\u102A\u102A\u102A\u102A' },
      { kind: 'markValue', id: 'm8', target: 'p', at: 1.5, label: '\u{1242B}\u{1242B}\u{1242B}' },
      WORDS,
    ]),
  ],
];

const flight = (id: string, parameters: object) => ({ kind: 'simulate', id, simulation: { model: 'projectile', parameters } });

const FIGURE_EXTREMES_LESSON: readonly (readonly Beat[])[] = [
  [makeBeat('narrowest', [{ kind: 'plot', id: 'small', expression: 'a*x', constants: [{ name: 'a', value: 0, min: 0, max: 1e-6 }], domain: [0, 1e-6], label: 'small' }, { kind: 'slider', id: 'on-small', target: 'small', constant: 'a', min: 0, max: 1e-6 }, { kind: 'numberLine', id: 'tiny-line', domain: [-1e-6, 0] }, { kind: 'markValue', id: 'on-tiny', target: 'tiny-line', at: -5e-7 }, WORDS])],
  [makeBeat('ground', [{ kind: 'clearBoard' }, flight('flat', { horizontalSpeed: 5, upwardSpeed: 0, releaseHeight: 0, gravity: 9.8 }), { kind: 'readout', id: 'flat-far', target: 'flat', quantity: 'landing-distance' }, { kind: 'trackVector', id: 'flat-speed', target: 'flat', quantity: 'velocity', label: 'speed' }, { kind: 'runSimulation', target: 'flat', action: 'play' }, { kind: 'slider', id: 'on-flat', target: 'flat', parameter: 'upwardSpeed', min: 0, max: 1e-6 }, WORDS])],
  [makeBeat('overflow', [{ kind: 'clearBoard' }, { kind: 'plot', id: 'huge', expression: '10^308*x', domain: [-1, 1], label: 'very big' }, { kind: 'plot', id: 'huge-over', over: 'huge', expression: '0-10^308*x', domain: [-1, 1] }, { kind: 'markValue', id: 'on-huge', target: 'huge', at: 0 }, { kind: 'shadeArea', id: 'under-huge', target: 'huge', from: -1, to: 1 }, WORDS])],
  [makeBeat('widest', [{ kind: 'clearBoard' }, { kind: 'plot', id: 'wide', expression: 'a*x+10^16', constants: [{ name: 'a', value: 1e6, min: -1e6, max: 1e6 }], domain: [-1e6, 1e6], label: 'wide' }, { kind: 'slider', id: 'on-wide', target: 'wide', constant: 'a', min: -1e6, max: 1e6 }, { kind: 'numberLine', id: 'wide-line', domain: [-1e6, 1e6] }, { kind: 'markValue', id: 'on-wide-line', target: 'wide-line', at: 999999.999999 }, WORDS])],
  [makeBeat('far-points', [{ kind: 'clearBoard' }, { kind: 'geometry', id: 'far', xRange: [0, 1e-6], yRange: [0, 1e-6] }, { kind: 'construct', id: 'pa', target: 'far', step: { shape: 'point', name: 'A', x: 1e6, y: -1e6 } }, { kind: 'construct', id: 'pb', target: 'far', step: { shape: 'point', name: 'B', x: 5e-7, y: 5e-7 } }, { kind: 'construct', id: 'pc', target: 'far', step: { shape: 'point', name: 'C', x: 1e-300, y: 0 } }, { kind: 'construct', id: 'ab', target: 'far', step: { shape: 'segment', from: 'A', to: 'B' } }, { kind: 'construct', id: 'round', target: 'far', step: { shape: 'circle', center: 'B', through: 'A' } }, { kind: 'construct', id: 'at-b', target: 'far', step: { shape: 'angle', at: 'B', from: 'A', to: 'C' } }, { kind: 'vector', id: 'push', on: 'far.A', angleDegrees: 360, length: 'long', label: 'force' }, { kind: 'annotate', id: 'on-a', target: 'far.A', mark: 'circle', label: 'far away' }, WORDS])],
  [makeBeat('far-flight', [{ kind: 'clearBoard' }, flight('long', { horizontalSpeed: 100, upwardSpeed: 100, releaseHeight: 1000, gravity: 0.1 }), { kind: 'readout', id: 'long-far', target: 'long', quantity: 'landing-distance' }, { kind: 'readout', id: 'long-high', target: 'long', quantity: 'peak-height' }, { kind: 'trackVector', id: 'long-speed', target: 'long', quantity: 'velocity', label: 'speed' }, { kind: 'runSimulation', target: 'long', action: 'seek', to: 3600 }, { kind: 'slider', id: 'on-speed', target: 'long', parameter: 'launchSpeed', min: 0, max: 150 }, { kind: 'slider', id: 'on-angle', target: 'long', parameter: 'launchAngle', min: -90, max: 90 }, { kind: 'slider', id: 'on-side', target: 'long', parameter: 'horizontalSpeed', min: -100, max: 100 }, WORDS])],
  [makeBeat('backward-flight', [{ kind: 'clearBoard' }, { kind: 'drawing', id: 'court', name: 'hoop-side' }, { ...flight('back', { horizontalSpeed: -4.2, upwardSpeed: 5.6, releaseHeight: 2.2, gravity: 9.8 }), over: 'court' }, { kind: 'annotate', id: 'on-path', target: 'back.path', mark: 'circle', label: 'the path' }, { kind: 'ghostPath', id: 'back-ghost', target: 'back' }, { kind: 'runSimulation', target: 'back', action: 'play', rate: 4 }, { kind: 'slider', id: 'on-gravity', target: 'back', parameter: 'gravity', min: 5, max: 100 }, WORDS])],
];

export const GRAPH_LESSONS = { shot: SHOT_LESSON, graphs: GRAPH_LESSON, 'number-line': NUMBER_LINE_LESSON, triangle: TRIANGLE_LESSON, 'free-body': FREE_BODY_LESSON, launch: LAUNCH_LESSON, 'figure-hostile': FIGURE_HOSTILE_LESSON, 'figure-waves': FIGURE_WAVES_LESSON, 'figure-reuse': FIGURE_REUSE_LESSON, 'figure-marks': FIGURE_MARKS_LESSON, 'figure-labels': FIGURE_LABELS_LESSON, 'figure-extremes': FIGURE_EXTREMES_LESSON } as const satisfies Record<string, readonly (readonly Beat[])[]>;
