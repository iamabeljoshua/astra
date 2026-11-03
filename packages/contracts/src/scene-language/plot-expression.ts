export const PLOT_EXPRESSION_MAX_CHARACTERS = 200;

const MAX_DEPTH = 32;

const PLOT_FUNCTIONS = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log10,
  sqrt: Math.sqrt,
  abs: Math.abs,
} as const;

const PLOT_OPERATIONS = {
  '+': (left: number, right: number) => left + right,
  '-': (left: number, right: number) => left - right,
  '*': (left: number, right: number) => left * right,
  '/': (left: number, right: number) => left / right,
  '^': Math.pow,
} as const;

const PLOT_CONSTANTS: ReadonlyMap<string, number> = new Map([
  ['pi', Math.PI],
  ['e', Math.E],
]);

const TOKEN = /\d+(?:\.\d+)?|\.\d+|[a-z]+|[-+*/^()]/g;
const NUMBER_TOKEN = /^[\d.]/;

type PlotFunction = keyof typeof PLOT_FUNCTIONS;
type PlotOperator = keyof typeof PLOT_OPERATIONS;

export type PlotNode =
  | { kind: 'number'; value: number }
  | { kind: 'x' }
  | { kind: 'negate'; operand: PlotNode }
  | { kind: 'operation'; operator: PlotOperator; left: PlotNode; right: PlotNode }
  | { kind: 'call'; name: PlotFunction; argument: PlotNode };

class NotAnExpression extends Error {}

function isPlotFunction(token: string): token is PlotFunction {
  return Object.hasOwn(PLOT_FUNCTIONS, token);
}

function getNumberValue(token: string): number {
  const value = PLOT_CONSTANTS.get(token) ?? (NUMBER_TOKEN.test(token) ? Number(token) : undefined);
  if (value === undefined) throw new NotAnExpression();
  return value;
}

function getTokens(text: string): string[] | null {
  const tokens = text.match(TOKEN) ?? [];
  return tokens.join('') === text.replaceAll(' ', '') ? tokens : null;
}

/** Sum, then product, then unary minus, then power, so -x^2 is -(x^2) and 2^3^2 is 2^(3^2). */
class PlotExpressionReader {
  private readonly tokens: readonly string[];
  private position = 0;
  private depth = 0;

  constructor(tokens: readonly string[]) {
    this.tokens = tokens;
  }

  readWhole(): PlotNode {
    const node = this.readSum();
    if (this.position < this.tokens.length) throw new NotAnExpression();
    return node;
  }

  private takeOperator<Operator extends PlotOperator>(operators: readonly Operator[]): Operator | undefined {
    const operator = operators.find((candidate) => candidate === this.tokens[this.position]);
    if (operator !== undefined) this.position += 1;
    return operator;
  }

  private readChain(operators: readonly PlotOperator[], readOperand: () => PlotNode): PlotNode {
    let node = readOperand();
    for (let operator = this.takeOperator(operators); operator !== undefined; operator = this.takeOperator(operators)) {
      node = { kind: 'operation', operator, left: node, right: readOperand() };
    }
    return node;
  }

  private readSum(): PlotNode {
    return this.readChain(['+', '-'], () => this.readProduct());
  }

  private readProduct(): PlotNode {
    return this.readChain(['*', '/'], () => this.readUnary());
  }

  private readUnary(): PlotNode {
    if (this.depth === MAX_DEPTH) throw new NotAnExpression();
    this.depth += 1;
    const node: PlotNode = this.takeOperator(['-']) === undefined ? this.readPower() : { kind: 'negate', operand: this.readUnary() };
    this.depth -= 1;
    return node;
  }

  private readPower(): PlotNode {
    const base = this.readAtom();
    if (this.takeOperator(['^']) === undefined) return base;
    return { kind: 'operation', operator: '^', left: base, right: this.readUnary() };
  }

  private readAtom(): PlotNode {
    const token = this.tokens[this.position];
    this.position += 1;
    if (token === undefined) throw new NotAnExpression();
    if (token === '(') return this.readGrouped();
    if (token === 'x') return { kind: 'x' };
    if (!isPlotFunction(token)) return { kind: 'number', value: getNumberValue(token) };
    if (this.tokens[this.position] !== '(') throw new NotAnExpression();
    this.position += 1;
    return { kind: 'call', name: token, argument: this.readGrouped() };
  }

  private readGrouped(): PlotNode {
    const node = this.readSum();
    if (this.tokens[this.position] !== ')') throw new NotAnExpression();
    this.position += 1;
    return node;
  }
}

export function parsePlotExpression(text: string): PlotNode | null {
  const tokens = text.length > PLOT_EXPRESSION_MAX_CHARACTERS ? null : getTokens(text);
  if (tokens === null) return null;
  try {
    return new PlotExpressionReader(tokens).readWhole();
  } catch (error) {
    if (error instanceof NotAnExpression) return null;
    throw error;
  }
}

/** Gives NaN or Infinity where the curve has no value, such as sqrt(x) at -1 or 1/x at 0. */
export function evaluatePlotExpression(node: PlotNode, x: number): number {
  switch (node.kind) {
    case 'number':
      return node.value;
    case 'x':
      return x;
    case 'negate':
      return -evaluatePlotExpression(node.operand, x);
    case 'call':
      return PLOT_FUNCTIONS[node.name](evaluatePlotExpression(node.argument, x));
    case 'operation':
      return PLOT_OPERATIONS[node.operator](evaluatePlotExpression(node.left, x), evaluatePlotExpression(node.right, x));
  }
}
