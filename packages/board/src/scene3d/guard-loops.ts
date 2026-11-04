import { parse } from 'acorn';

const LOOP_TYPES = new Set(['ForStatement', 'WhileStatement', 'DoWhileStatement', 'ForInStatement', 'ForOfStatement']);

interface SyntaxNode {
  type: string;
  start: number;
  end: number;
  body: SyntaxNode;
}

const isSyntaxNode = (value: unknown): value is SyntaxNode => typeof (value as SyntaxNode | null)?.type === 'string';

function getGuardInserts(node: SyntaxNode, guardCall: string): [number, string][] {
  const inserts: [number, string][] = [];
  if (LOOP_TYPES.has(node.type)) {
    const { body } = node;
    if (body.type === 'BlockStatement') inserts.push([body.start + 1, guardCall]);
    else inserts.push([body.start, `{${guardCall}`], [body.end, '}']);
  }
  for (const child of Object.values(node).flat()) if (isSyntaxNode(child)) inserts.push(...getGuardInserts(child, guardCall));
  return inserts;
}

/** Removing an iframe does not stop a spinning script, so every loop calls a time check before the code runs. A syntax error throws here. */
export function guardLoops(code: string, guardName: string): string {
  const program = parse(code, { ecmaVersion: 'latest', sourceType: 'script' }) as unknown as SyntaxNode;
  const inserts = getGuardInserts(program, `${guardName}();`).sort(([first], [second]) => second - first);
  return inserts.reduce((guarded, [at, text]) => guarded.slice(0, at) + text + guarded.slice(at), code);
}
