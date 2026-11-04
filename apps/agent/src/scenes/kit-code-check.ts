import { parse } from 'acorn';
import { getCodeProblems } from './content-check.ts';

const REACHES_OUTSIDE = new Set('fetch XMLHttpRequest WebSocket EventSource RTCPeerConnection webkitRTCPeerConnection Worker SharedWorker ServiceWorker BroadcastChannel MessageChannel importScripts navigator sendBeacon Image Audio Video window self top parent frames frameElement opener globalThis document location history localStorage sessionStorage indexedDB cookie caches postMessage alert open eval Function constructor __proto__ prototype getPrototypeOf setPrototypeOf setTimeout setInterval setImmediate requestAnimationFrame requestIdleCallback queueMicrotask Date performance WebAssembly Proxy Reflect TextureLoader ImageLoader ImageBitmapLoader FileLoader AudioLoader ObjectLoader LoadingManager WebGLRenderer'.split(' '));
const REFUSED_SYNTAX = new Set(['ImportExpression', 'MetaProperty', 'WithStatement', 'DebuggerStatement', 'AwaitExpression', 'YieldExpression', 'TaggedTemplateExpression']);
// A label holds words and numbers with a unit, so a dot between two runs of letters is an address and no ordinary label has one.
const ADDRESS_IN_TEXT = /[a-z0-9-]\.[a-z]{2,}(\b|\/)|^\s*\/\/|\b(data|blob|javascript|file|ftp|ws|wss):/i;

interface TruthRule {
  topic: RegExp;
  needs: string;
}

/** Hand-written geometry is where these went wrong, 1 of 10 clean against 14 of 14 on the kit's functions, so a topic the kit computes must use what it computes. */
const TOPICS_THE_KIT_COMPUTES: readonly TruthRule[] = [
  { topic: /\bmoon\b.*\b(phases?|crescent|gibbous)\b|\b(phases?|crescent|gibbous)\b.*\bmoon\b|\blunar phases?\b/i, needs: 'kit.astro.moonOrbit' },
  { topic: /\bseasons?\b|\bsolstices?\b|\bequinox(es)?\b|\baxial tilt\b/i, needs: 'kit.astro.seasons' },
];

interface SyntaxNode {
  type: string;
  [field: string]: unknown;
}

const isNode = (value: unknown): value is SyntaxNode => typeof value === 'object' && value !== null && typeof (value as SyntaxNode).type === 'string';

function* walk(node: SyntaxNode): Generator<SyntaxNode> {
  yield node;
  for (const value of Object.values(node)) {
    for (const child of Array.isArray(value) ? value : [value]) if (isNode(child)) yield* walk(child);
  }
}

function getNodeProblems(node: SyntaxNode): string[] {
  if (REFUSED_SYNTAX.has(node.type)) return [`${node.type} is not allowed in a scene`];
  if (node.type === 'Identifier' && REACHES_OUTSIDE.has(node.name as string)) return [`${node.name as string} is not allowed in a scene`];
  if (node.type !== 'Literal' && node.type !== 'TemplateElement') return [];
  const text = node.type === 'Literal' ? node.value : (node.value as { cooked?: string }).cooked;
  if (typeof text !== 'string') return [];
  if (REACHES_OUTSIDE.has(text)) return [`the string ${text} is not allowed in a scene`];
  return ADDRESS_IN_TEXT.test(text) ? [`a string holds what looks like an address: ${text.slice(0, 60)}`] : [];
}

function parseOneScene(code: string): { root: SyntaxNode } | { problem: string } {
  try {
    const program = parse(code, { ecmaVersion: 'latest', sourceType: 'script', locations: true }) as unknown as { body: SyntaxNode[] };
    const [only, ...rest] = program.body;
    const isScene = only?.type === 'FunctionDeclaration' && (only.id as { name?: string } | null)?.name === 'scene' && (only.params as unknown[]).length === 1;
    return isScene && rest.length === 0 ? { root: only } : { problem: 'the code must be exactly one function scene(kit) and nothing else' };
  } catch (error) {
    return { problem: `the code does not parse at line ${(error as { loc?: { line: number } }).loc?.line ?? '?'}: ${String(error)}` };
  }
}

/** A first screen before the code reaches a browser. The sandbox is the wall, and this keeps a scene that tries anything from ever being booted. */
export function getKitCodeProblems({ code, topic, moments }: { code: string; topic: string; moments: Readonly<Record<string, number>> }): string[] {
  const parsed = parseOneScene(code);
  if ('problem' in parsed) return [parsed.problem];
  const nodes = [...walk(parsed.root)];
  const strings = new Set(nodes.flatMap((node) => (node.type === 'Literal' && typeof node.value === 'string' ? [node.value] : [])));
  return [...new Set([
    ...getCodeProblems(code),
    ...nodes.flatMap(getNodeProblems),
    ...Object.keys(moments).filter((moment) => !strings.has(moment)).map((moment) => `it never uses the moment ${moment}`),
    ...TOPICS_THE_KIT_COMPUTES.filter((rule) => rule.topic.test(topic) && !code.includes(rule.needs)).map((rule) => `a scene on this topic must place its bodies with ${rule.needs}`),
  ])];
}
