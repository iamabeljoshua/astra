import katex from 'katex';

// `trust: false` closes links and raw HTML, the two limits close macro bombs and huge sizes, and `throwOnError` keeps a red error message off the board.
export const KATEX_OPTIONS = { displayMode: false, output: 'htmlAndMathml', throwOnError: true, trust: false, strict: 'ignore', maxExpand: 500, maxSize: 4 } as const;

// Inline mode is what lets a long equation wrap at its operators, and this keeps fractions at full size.
export const DISPLAY_STYLE = '\\displaystyle ';

// A tab crashes once a tree runs about 650 elements deep, and a list of the tricks that build one would miss one, so the tree itself is measured. Twelve groups of the deepest allowed command reach about 100, and the longest line of terms holds about 2500 nodes.
const TEX_TREE_LIMITS = { depth: 120, nodes: 3000 };

interface TexTree {
  children?: readonly TexTree[];
  toNode(): Node;
}

// The one KaTeX call that hands over the tree before any of it becomes DOM.
const buildKatexTree = (katex as unknown as { __renderToDomTree(tex: string, options: typeof KATEX_OPTIONS): TexTree }).__renderToDomTree;

function isWithinLimits(root: TexTree): boolean {
  let nodes = 0;
  const stack = [{ tree: root, depth: 1 }];
  for (let entry = stack.pop(); entry; entry = stack.pop()) {
    nodes += 1;
    if (entry.depth > TEX_TREE_LIMITS.depth || nodes > TEX_TREE_LIMITS.nodes) return false;
    for (const child of entry.tree.children ?? []) stack.push({ tree: child, depth: entry.depth + 1 });
  }
  return true;
}

/** The tree KaTeX would build, or null if it refuses this math or the tree is past the limits. Everything that sets math goes through here, live and on a rebuild from the log. */
export function buildTexTree(tex: string): TexTree | null {
  try {
    const tree = buildKatexTree(DISPLAY_STYLE + tex, KATEX_OPTIONS);
    return isWithinLimits(tree) ? tree : null;
  } catch {
    return null;
  }
}

/**
 * Whether the board can set this math. This file loads no stylesheet, so plain Node can import it through `@astra/board/tex-check`.
 *
 * This is not a safety check. It says yes to commands the scene language refuses, such as `\href`, which KaTeX sets as inert text under `trust: false`. Run `parseSceneCommand` as well.
 */
export function canRenderTex(tex: string): boolean {
  return buildTexTree(tex) !== null;
}
