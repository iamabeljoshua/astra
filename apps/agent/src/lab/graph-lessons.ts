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

export const GRAPH_LESSONS = { shot: SHOT_LESSON, graphs: GRAPH_LESSON, 'number-line': NUMBER_LINE_LESSON, triangle: TRIANGLE_LESSON, 'free-body': FREE_BODY_LESSON, launch: LAUNCH_LESSON, 'figure-hostile': FIGURE_HOSTILE_LESSON } as const satisfies Record<string, readonly (readonly Beat[])[]>;
