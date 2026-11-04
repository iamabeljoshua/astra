import { ALLOWED_TEX_COMMANDS } from '@astra/contracts';
import { makeSeededRandom } from '../ink/ink-stroke.ts';

const MOST_CHARACTERS = 500;
const COMBINING_MARKS = ['́', '̈', '̀', '̂', '̇', '⃗', '҃'];

type Wrapper = (inner: string) => string;

const ONE_ARGUMENT = ['sqrt', 'hat', 'widehat', 'bar', 'vec', 'dot', 'ddot', 'tilde', 'widetilde', 'overline', 'underline', 'overrightarrow', 'overleftarrow', 'overbrace', 'underbrace', 'cancel', 'text', 'textbf', 'textit', 'mathrm', 'mathbf', 'mathit', 'mathbb', 'mathcal', 'mathsf', 'mathfrak', 'operatorname', 'substack'];
const TWO_ARGUMENTS = ['frac', 'dfrac', 'tfrac', 'cfrac', 'binom', 'dbinom', 'tbinom', 'overset', 'underset', 'stackrel'];
const ENVIRONMENTS = ['matrix', 'pmatrix', 'bmatrix', 'Bmatrix', 'vmatrix', 'Vmatrix', 'smallmatrix', 'cases', 'rcases', 'dcases', 'aligned', 'gathered'];
const BIG_DELIMITERS = ['big', 'Big', 'bigg', 'Bigg'];

const WRAPPERS: readonly Wrapper[] = [
  ...ONE_ARGUMENT.map((name): Wrapper => (inner) => `\\${name}{${inner}}`),
  ...TWO_ARGUMENTS.flatMap((name): Wrapper[] => [(inner) => `\\${name}{${inner}}{a}`, (inner) => `\\${name}{a}{${inner}}`]),
  ...ENVIRONMENTS.map((name): Wrapper => (inner) => `\\begin{${name}}${inner}&a\\\\b&c\\end{${name}}`),
  (inner) => `x^{${inner}}`,
  (inner) => `x_{${inner}}`,
  (inner) => `x_{a}^{${inner}}`,
  (inner) => `\\sum_{${inner}}^{b}`,
  (inner) => `\\sum\\limits_{a}^{${inner}}`,
  (inner) => `\\left(${inner}\\right)`,
  (inner) => `{${inner}}`,
];

const fillTo = (make: (index: number) => string) => {
  let source = '';
  for (let index = 0; source.length < MOST_CHARACTERS; index += 1) source += make(index);
  return source.slice(0, MOST_CHARACTERS);
};

/** Sources a model could send, built from the commands the parser allows, aimed at great depth and great size. Many are refused, which is the point. The same seed gives the same sources. */
export function makeTexFuzzSources(count: number, seed: string): string[] {
  const random = makeSeededRandom(seed);
  const pick = <Item>(items: readonly Item[]) => items[Math.floor(random() * items.length)] as Item;
  const upTo = (most: number) => 1 + Math.floor(random() * most);
  const commands = [...ALLOWED_TEX_COMMANDS];

  const nest = () => {
    const wrappers = [pick(WRAPPERS), pick(WRAPPERS)];
    let source = pick(['x', '2', 'a+b', '\\pi']);
    for (let level = upTo(14); level > 0; level -= 1) source = (wrappers[level % 2] as Wrapper)(source);
    return source;
  };
  const chain = () => {
    const wrapper = pick(WRAPPERS);
    return fillTo(() => wrapper(pick(['a', 'x^2', '1'])));
  };
  const tree = (budget: number): string => (budget <= 0 ? pick(['x', 'y', '2', '+', '=', '\\pi', '\\cdot']) : random() < 0.4 ? `${tree(budget - 1)}${tree(budget - 1)}` : pick(WRAPPERS)(tree(budget - 1)));
  const marks = () => {
    const run = Array.from({ length: pick([2, 3, 5, 20, 120, 135, 200, 495]) }, () => pick(COMBINING_MARKS)).join('');
    return pick([`x${run}`, `\\text{x${run}}`, `\\hat{x${run}}`, `x^{a${run}}`, `${'á'.repeat(100)}`]);
  };
  const table = () => {
    const name = pick(ENVIRONMENTS);
    const row = Array.from({ length: upTo(60) }, () => pick(['a', '', '1', 'x^2'])).join('&');
    return `\\begin{${name}}${fillTo(() => `${row}\\\\`).slice(0, MOST_CHARACTERS - 2 * name.length - 14)}\\end{${name}}`;
  };
  const anyCommand = () => fillTo(() => `${pick(commands)}${pick(['{a}{b}', '{a}', ' x', '2', '_a', '^a', ''])}`).slice(0, pick([40, 120, 300, 500]));
  const unbraced = () => pick([`\\hat x`, `\\sqrt2`, `\\frac\\pi2`, `\\vec v`, `x^2`, `a_1`, `\\sum_i x_i`, `\\not=`, `\\big(`]).repeat(upTo(60)).slice(0, MOST_CHARACTERS);
  const delimiters = () => fillTo(() => `\\${pick(BIG_DELIMITERS)}${pick(['(', ')', '|', '\\{'])}`);

  const makers = [nest, chain, () => tree(upTo(8)), marks, table, anyCommand, unbraced, delimiters];
  return Array.from({ length: count }, (_, index) => (makers[index % makers.length] as () => string)());
}
