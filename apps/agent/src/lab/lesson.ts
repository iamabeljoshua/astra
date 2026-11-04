import { type Beat, getBeatText, getCues, getSpokenWords } from '@astra/contracts';
import { GRAPH_LESSONS } from './graph-lessons.ts';
import { makeBeat } from './make-beat.ts';

const BALL = { kind: 'simulate', id: 'shot', simulation: { model: 'projectile', parameters: { horizontalSpeed: 4.2, upwardSpeed: 5.6, releaseHeight: 2.2, gravity: 9.8 } } };

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

const EVERY_WORD_LESSON: readonly (readonly Beat[])[] = [
  [
    makeBeat('every-word', [
      { kind: 'writeMath', id: 'line', tex: 'a + b = c' },
      'First ',
      { kind: 'highlight', id: 'ring-a', target: 'line', tex: 'a' },
      'we ',
      { kind: 'highlight', id: 'ring-b', target: 'line', tex: 'b' },
      'mark ',
      { kind: 'hide', target: 'ring-a' },
      'both ',
      { kind: 'hide', target: 'ring-b' },
      'terms ',
      { kind: 'transformMath', target: 'line', tex: 'a = c - b' },
      'and ',
      { kind: 'writeMath', id: 'second', tex: 'x^2 = 9' },
      'then ',
      { kind: 'transformMath', target: 'second', tex: String.raw`x = \pm 3` },
      'keep ',
      { kind: 'highlight', id: 'ring-c', target: 'line', tex: 'c' },
      'going ',
      { kind: 'text', id: 'note', text: 'every word', handwritten: true },
      'on ',
      { kind: 'hide', target: 'ring-c' },
      'every ',
      { kind: 'transformMath', target: 'line', tex: 'c = a + b' },
      'word.',
    ]),
  ],
];

const HOSTILE_MARKUP = '<img src=x onerror="window.pwned=1"><script>window.pwned=1</script>';

const HOSTILE_LESSON: readonly (readonly Beat[])[] = [
  [
    makeBeat('markup', [
      { kind: 'text', id: 'plain-markup', text: HOSTILE_MARKUP },
      'Markup as plain text ',
      { kind: 'text', id: 'ink-markup', text: HOSTILE_MARKUP, handwritten: true },
      'then markup by hand ',
      { kind: 'writeMath', id: 'math-markup', tex: String.raw`\text{<script>window.pwned=1</script>}` },
      'then markup in math. ',
    ]),
    makeBeat('sizes', [
      { kind: 'clearBoard' },
      { kind: 'writeMath', id: 'wide', tex: `x = ${Array.from({ length: 50 }, (_, index) => `a_{${index}}`).join(' + ')}` },
      'A very wide line ',
      { kind: 'writeMath', id: 'wide-fraction', tex: String.raw`\frac{${'a b c d e f g h i j '.repeat(8)}}{2}` },
      'and a wide fraction ',
      { kind: 'writeMath', id: 'tower', tex: `${String.raw`\frac{1}{`.repeat(10)}x${'}'.repeat(10)}` },
      'and a tall tower ',
      { kind: 'text', id: 'one-word', text: 'w'.repeat(400), handwritten: true },
      'and one huge word. ',
    ]),
    makeBeat('bad-math', [
      { kind: 'clearBoard' },
      { kind: 'writeMath', id: 'good', tex: '2x = 8' },
      'A good equation ',
      { kind: 'transformMath', target: 'good', tex: 'x^2^3' },
      'then a bad step ',
      { kind: 'writeMath', id: 'bad', tex: String.raw`\frac{1}` },
      'and a broken one ',
      { kind: 'highlight', id: 'no-term', target: 'good', tex: 'y', occurrence: 99 },
      'and a mark on nothing ',
      { kind: 'annotate', id: 'no-part', target: 'good.t99', mark: 'cross' },
      'and a mark on no term ',
      { kind: 'diagram', id: 'labels', nodes: [{ name: 'a', label: HOSTILE_MARKUP.slice(0, 80) }, { name: 'b', label: 'B' }], edges: [{ from: 'a', to: 'b', label: '<b>x</b>' }], handwritten: true },
      'and markup in a diagram. ',
    ]),
    makeBeat('still-works', [
      { kind: 'clearBoard' },
      { kind: 'writeMath', id: 'after', tex: String.raw`\frac{x}{2} = 3` },
      'And the board still works ',
      { kind: 'transformMath', target: 'after', tex: 'x = 6' },
      'after all of that. ',
    ]),
  ],
];

const RARE_FONTS_LESSON: readonly (readonly Beat[])[] = [
  [
    makeBeat('rare-fonts', [
      { kind: 'writeMath', id: 'rare', tex: String.raw`\mathcal{L} = \mathbb{R} + \mathfrak{g}` },
      'A script letter, a blackboard letter, and a gothic letter. ',
      { kind: 'transformMath', target: 'rare', tex: String.raw`\mathbb{R} = \mathcal{L} - \mathfrak{g}` },
      'The same letters move across the equals sign. ',
    ]),
  ],
];

export const LESSONS = { 'jump-shot': LESSON, algebra: ALGEBRA_LESSON, dense: DENSE_LESSON, 'every-word': EVERY_WORD_LESSON, hostile: HOSTILE_LESSON, 'rare-fonts': RARE_FONTS_LESSON, ...GRAPH_LESSONS } as const satisfies Record<string, readonly (readonly Beat[])[]>;

export type LessonName = keyof typeof LESSONS;

const MOST_COMMANDS_IN_A_BEAT = 12;

// Proof only. The script's own cues sit where a writer put them, so these show what a cue on any other word would do, as near every nth word as a beat's command limit allows.
function addCueEveryWords(beat: Beat, every: number): Beat {
  const wordCount = getSpokenWords(getBeatText(beat)).length;
  const room = MOST_COMMANDS_IN_A_BEAT - getCues(beat).length;
  const spacing = Math.max(every, Math.ceil(wordCount / room));
  let wordIndex = 0;
  const script = beat.script.flatMap((part): unknown[] => {
    if (typeof part !== 'string') return [part];
    return part.split(/(?<=\s)/).flatMap((word) => {
      const index = wordIndex++;
      return index % spacing === 0 ? [{ kind: 'text', id: `${beat.id}-w${index}`, text: 'x' }, word] : [word];
    });
  });
  return makeBeat(beat.id, script, beat.expectsReply);
}

export function getNamedLessonTurn({ lesson, lessonTurn = 0, cueEveryWords }: { lesson: LessonName; lessonTurn?: number; cueEveryWords?: number }): readonly Beat[] {
  const beats = LESSONS[lesson][lessonTurn] ?? [];
  return cueEveryWords ? beats.map((beat) => addCueEveryWords(beat, cueEveryWords)) : beats;
}

export function getLessonTurn({ lessonTurn = 0, repeats = 1, cueEveryWords }: { lessonTurn?: number; repeats?: number; cueEveryWords?: number }): readonly Beat[] {
  const beats = LESSON[lessonTurn] ?? [];
  const repeated = Array.from({ length: repeats }, (_, round) => beats.map((beat) => (repeats === 1 ? beat : makeBeat(`${beat.id}-r${round}`, [...beat.script], beat.expectsReply)))).flat();
  return cueEveryWords ? repeated.map((beat) => addCueEveryWords(beat, cueEveryWords)) : repeated;
}

export const STOCK_PHRASE = 'Let me work that out.';

export const STOCK_TURN: readonly Beat[] = [makeBeat('stock', [{ kind: 'text', id: 'working', text: 'Working it out' }, 'Let me ', { kind: 'focus', target: 'working' }, 'work that out.'])];

export const STOCK_MATH_TURN: readonly Beat[] = [
  makeBeat('stock-math', [
    { kind: 'writeMath', id: 'stored-line', tex: '2x + 3 = 11' },
    'Let ',
    { kind: 'highlight', id: 'stored-ring', target: 'stored-line', tex: '3' },
    'me ',
    { kind: 'transformMath', target: 'stored-line', tex: '2x = 11 - 3' },
    'work ',
    { kind: 'hide', target: 'stored-ring' },
    'that ',
    { kind: 'transformMath', target: 'stored-line', tex: '2x = 8' },
    'out.',
  ]),
];

export const OVERLONG_LINE = 'Nine point eight metres per second squared.';
