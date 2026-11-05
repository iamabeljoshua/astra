import { parse } from 'acorn';
import { getCodeProblems } from './content-check.ts';
import { readMarks } from './narration.ts';
import type { LessonPlan } from './scene-types.ts';

const REACHES_OUTSIDE = new Set('fetch XMLHttpRequest WebSocket EventSource RTCPeerConnection webkitRTCPeerConnection Worker SharedWorker ServiceWorker BroadcastChannel MessageChannel importScripts navigator window globalThis document localStorage sessionStorage indexedDB caches eval Function setTimeout setInterval setImmediate requestAnimationFrame requestIdleCallback queueMicrotask Date performance WebAssembly Proxy Reflect'.split(' '));
// Plain words a scene may use for its own, as a stage's top colour, so they count only when nothing in the scene declares them.
const GLOBALS_WITH_PLAIN_NAMES = new Set('top self parent frames frameElement opener location history alert open Image Audio Video'.split(' '));
const NEVER_ON_ANYTHING = new Set('constructor __proto__ prototype getPrototypeOf setPrototypeOf sendBeacon postMessage cookie TextureLoader ImageLoader ImageBitmapLoader FileLoader AudioLoader ObjectLoader LoadingManager WebGLRenderer'.split(' '));
const REFUSED_SYNTAX = new Set(['ImportExpression', 'MetaProperty', 'WithStatement', 'DebuggerStatement', 'AwaitExpression', 'YieldExpression', 'TaggedTemplateExpression']);
const ADDRESS_IN_TEXT = /[a-z0-9-]\.[a-z]{2,}(\b|\/)|^\s*\/\/|\b(data|blob|javascript|file|ftp|ws|wss):/i;

interface TruthRule {
  topic: RegExp;
  needs: string;
}

/** Hand-written geometry is where these went wrong, 1 of 10 clean against 14 of 14 on the kit's functions. */
const TOPICS_THE_KIT_COMPUTES: readonly TruthRule[] = [
  { topic: /\bmoon\b.*\b(phases?|crescent|gibbous)\b|\b(phases?|crescent|gibbous)\b.*\bmoon\b|\blunar phases?\b/i, needs: 'moonOrbit' },
  { topic: /\bseasons?\b|\bsolstices?\b|\bequinox(es)?\b|\baxial tilt\b/i, needs: 'seasons' },
];

interface SyntaxNode {
  type: string;
  [field: string]: unknown;
}

const isNode = (value: unknown): value is SyntaxNode => typeof value === 'object' && value !== null && typeof (value as SyntaxNode).type === 'string';

const isNamedMember = (node: unknown, name: string): node is SyntaxNode => isNode(node) && node.type === 'MemberExpression' && !node.computed && (node.property as SyntaxNode).name === name;

const usesAstro = (nodes: readonly SyntaxNode[], name: string) => nodes.some((node) => isNamedMember(node, name) && isNamedMember(node.object, 'astro'));

function* walk(node: SyntaxNode): Generator<SyntaxNode> {
  yield node;
  for (const value of Object.values(node)) {
    for (const child of Array.isArray(value) ? value : [value]) if (isNode(child)) yield* walk(child);
  }
}

function getBoundNames(pattern: unknown): string[] {
  if (!isNode(pattern)) return [];
  return [...walk(pattern)].flatMap((node) => (node.type === 'Identifier' ? [node.name as string] : []));
}

function getNameOnlyNodes(nodes: readonly SyntaxNode[]): ReadonlySet<SyntaxNode> {
  return new Set(nodes.flatMap((node) => {
    if (node.type === 'MemberExpression' && !node.computed && isNode(node.property)) return [node.property];
    if (node.type === 'Property' && !node.computed && isNode(node.key)) return [node.key];
    return [];
  }));
}

function getDeclaredNames(nodes: readonly SyntaxNode[]): ReadonlySet<string> {
  return new Set(nodes.flatMap((node) => {
    if (node.type === 'VariableDeclarator') return getBoundNames(node.id);
    if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') return (node.params as unknown[]).flatMap(getBoundNames);
    return [];
  }));
}

function getNodeProblems(node: SyntaxNode, nameOnly: ReadonlySet<SyntaxNode>, declared: ReadonlySet<string>): string[] {
  if (REFUSED_SYNTAX.has(node.type)) return [`${node.type} is not allowed in a scene`];
  if (node.type === 'Identifier') {
    const name = node.name as string;
    const isRefused = NEVER_ON_ANYTHING.has(name) || (!nameOnly.has(node) && (REACHES_OUTSIDE.has(name) || (GLOBALS_WITH_PLAIN_NAMES.has(name) && !declared.has(name))));
    return isRefused ? [`${name} is not allowed in a scene`] : [];
  }
  if (node.type !== 'Literal' && node.type !== 'TemplateElement') return [];
  const text = node.type === 'Literal' ? node.value : (node.value as { cooked?: string }).cooked;
  if (typeof text !== 'string') return [];
  if (NEVER_ON_ANYTHING.has(text)) return [`the string ${text} is not allowed in a scene`];
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

export function getKitCodeProblems({ code, topic, moments }: { code: string; topic: string; moments: Readonly<Record<string, number>> }): string[] {
  const parsed = parseOneScene(code);
  if ('problem' in parsed) return [parsed.problem];
  const nodes = [...walk(parsed.root)];
  const nameOnly = getNameOnlyNodes(nodes);
  const declared = getDeclaredNames(nodes);
  const strings = new Set(nodes.flatMap((node) => (node.type === 'Literal' && typeof node.value === 'string' ? [node.value] : [])));
  return [...new Set([
    ...getCodeProblems(code),
    ...nodes.flatMap((node) => getNodeProblems(node, nameOnly, declared)),
    ...Object.entries(moments).filter(([moment, seconds]) => seconds > 0 && !strings.has(moment)).map(([moment]) => `it never uses the moment ${moment}`),
    ...TOPICS_THE_KIT_COMPUTES.filter((rule) => rule.topic.test(topic) && !usesAstro(nodes, rule.needs)).map((rule) => `a scene on this topic must place its bodies with kit.astro.${rule.needs}`),
  ])];
}

export const getKitSpokenLines = ({ setup, narration, close }: LessonPlan): readonly string[] => [setup, readMarks(narration).text, close];
