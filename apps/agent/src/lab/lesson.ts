import { type Beat, parseBeat } from '@astra/contracts';

const BALL = { kind: 'simulate', id: 'shot', simulation: { model: 'projectile', parameters: { horizontalSpeed: 4.2, upwardSpeed: 5.6, releaseHeight: 2.2, gravity: 9.8 } } };

function makeBeat(id: string, script: unknown[], expectsReply = false): Beat {
  const parsed = parseBeat({ id, script, expectsReply });
  if (!parsed.ok) throw new Error(`${id}: ${parsed.problem}`);
  return parsed.value;
}

export const LESSON: readonly (readonly Beat[])[] = [
  [
    makeBeat('jump-shot', [
      'Picture ',
      { kind: 'text', id: 'title', text: 'A jump shot' },
      'your jump shot. ',
      BALL,
      'The ball leaves ',
      { kind: 'vector', id: 'hand-push', on: 'shot.ball', angleDegrees: 55, length: 'medium', label: 'hand' },
      'your hand, and right then ',
      { kind: 'hide', target: 'hand-push' },
      'nothing pushes it any more. ',
    ]),
    makeBeat('the-climb', [
      { kind: 'runSimulation', target: 'shot', action: 'play', until: 'peak', overWords: 8 },
      'Watch it climb, slower and slower, until it reaches ',
      { kind: 'annotate', id: 'top-mark', target: 'shot.ball', mark: 'circle', label: 'top' },
      'the very top. ',
      { kind: 'writeMath', id: 'gravity', tex: 'g = 9.8' },
      'Gravity pulls at 9.8 metres per second squared, ',
      { kind: 'highlight', id: 'gravity-mark', target: 'gravity', tex: '9.8' },
      'the whole way up. ',
    ]),
    makeBeat('the-fall', [
      { kind: 'runSimulation', target: 'shot', action: 'play', until: 'landing', overWords: 7 },
      'So at the top it hangs, then falls. ',
      { kind: 'text', id: 'question', text: 'What still pushes it sideways?' },
      'Once it leaves your hand, what still pushes it sideways?',
    ], true),
  ],
  [
    makeBeat('sideways', [
      { kind: 'text', id: 'answer', text: 'Nothing pushes it' },
      'Nothing does. ',
      { kind: 'writeMath', id: 'sideways-speed', tex: 'v_x = 4.2' },
      'Its sideways speed stays at 4.2 metres per second, ',
      { kind: 'vector', id: 'sideways-arrow', on: 'shot.ball', angleDegrees: 0, length: 'short', label: 'sideways' },
      'because no force acts that way. ',
      { kind: 'runSimulation', target: 'shot', action: 'restart' },
      'Watch it fly again, ',
      { kind: 'focus', target: 'shot.ball' },
      'and follow the ball. ',
    ]),
  ],
];

/** A student's first equation, solved one rearrangement at a time. */
const ALGEBRA_LESSON: readonly (readonly Beat[])[] = [
  [
    makeBeat('the-equation', [
      { kind: 'text', id: 'goal', text: 'Find x', handwritten: true },
      'We want x on its own. ',
      { kind: 'writeMath', id: 'steps', tex: '2x + 3 = 11', overWords: 5 },
      'Two x plus three equals eleven. ',
    ]),
    makeBeat('the-three', [
      'What is in the way? ',
      { kind: 'highlight', id: 'three-ring', target: 'steps', tex: '3' },
      'The three, so it goes first. ',
    ]),
    makeBeat('over-the-equals', [
      'Take three from both sides, ',
      { kind: 'transformMath', target: 'steps', tex: '2x = 11 - 3', overWords: 6 },
      'and it crosses over as minus three. ',
      { kind: 'hide', target: 'three-ring' },
      'Watch the sign change. ',
    ]),
    makeBeat('eight', [
      'Eleven minus three ',
      { kind: 'transformMath', target: 'steps', tex: '2x = 8' },
      'is eight. ',
    ]),
    makeBeat('over-two', [
      'Now two times x is eight, so ',
      { kind: 'transformMath', target: 'steps', tex: String.raw`x = \frac{8}{2}`, overWords: 5 },
      'the two moves under the eight. ',
    ]),
    makeBeat('the-answer', [
      'Eight over two ',
      { kind: 'transformMath', target: 'steps', tex: 'x = 4' },
      'is four. ',
      { kind: 'text', id: 'check', text: 'Check: 2(4) + 3 = 11', handwritten: true, overWords: 6 },
      'Put it back in and it holds. ',
    ]),
  ],
];

/** Everything hard to set at once, for the phone width. */
const DENSE_LESSON: readonly (readonly Beat[])[] = [
  [
    makeBeat('the-formula', [
      { kind: 'writeMath', id: 'quadratic', tex: String.raw`x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`, overWords: 6 },
      'The quadratic formula has a root inside a fraction. ',
      { kind: 'highlight', id: 'discriminant', target: 'quadratic', tex: 'b^2 - 4ac' },
      'This part decides how many answers there are. ',
    ]),
    makeBeat('the-matrix', [
      { kind: 'writeMath', id: 'system', tex: String.raw`\begin{pmatrix} 2 & 1 \\ 1 & 3 \end{pmatrix} \begin{pmatrix} x \\ y \end{pmatrix} = \begin{pmatrix} 5 \\ 10 \end{pmatrix}`, overWords: 6 },
      'Two equations become one line with matrices. ',
      { kind: 'transformMath', target: 'system', tex: String.raw`\begin{pmatrix} x \\ y \end{pmatrix} = \frac{1}{5} \begin{pmatrix} 3 & -1 \\ -1 & 2 \end{pmatrix} \begin{pmatrix} 5 \\ 10 \end{pmatrix}`, overWords: 6 },
      'The inverse moves across the equals sign. ',
    ]),
    makeBeat('the-powers', [
      { kind: 'writeMath', id: 'powers', tex: String.raw`\sum_{k=1}^{n} k^2 = \frac{n(n+1)(2n+1)}{6}`, overWords: 5 },
      'A sum, with powers and a long fraction. ',
      { kind: 'writeMath', id: 'root', tex: String.raw`\sqrt[3]{x^2 + 1} = e^{\frac{1}{3}\ln(x^2 + 1)}`, overWords: 5 },
      'A cube root equals a power of e. ',
    ]),
    makeBeat('the-long-line', [
      { kind: 'writeMath', id: 'long-line', tex: String.raw`(x + 1)(x + 2)(x + 3) = x^3 + 6x^2 + 11x + 6 = (x^2 + 3x + 2)(x + 3)`, overWords: 6 },
      'A long line wraps at its operators. ',
      { kind: 'diagram', id: 'flow', nodes: [{ name: 'expand', label: 'Expand' }, { name: 'collect', label: 'Collect' }, { name: 'factor', label: 'Factor' }], edges: [{ from: 'expand', to: 'collect' }, { from: 'collect', to: 'factor' }], handwritten: true, startsEmpty: true },
      { kind: 'reveal', target: 'flow', upTo: 3, overWords: 6 },
      'Expand, then collect, then factor, drawn by hand. ',
    ]),
  ],
];

export const LESSONS = { 'jump-shot': LESSON, algebra: ALGEBRA_LESSON, dense: DENSE_LESSON } as const satisfies Record<string, readonly (readonly Beat[])[]>;

export type LessonName = keyof typeof LESSONS;

export const STOCK_PHRASE = 'Let me work that out.';

export const STOCK_TURN: readonly Beat[] = [makeBeat('stock', [{ kind: 'text', id: 'working', text: 'Working it out' }, 'Let me ', { kind: 'focus', target: 'working' }, 'work that out.'])];

export const OVERLONG_LINE = 'Nine point eight metres per second squared.';
