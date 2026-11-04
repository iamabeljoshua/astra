/** One piece of source math. A number stays whole, so "3" never matches inside "13". */
export interface TexToken {
  text: string;
  start: number;
  end: number;
}

const TOKEN = /\\[A-Za-z]+|\\[\s\S]|\d+(?:\.\d+)?|\s+|[\s\S]/g;

export function getTexTokens(tex: string): TexToken[] {
  return [...tex.matchAll(TOKEN)].filter(([text]) => text.trim() !== '').map((match) => ({ text: match[0], start: match.index, end: match.index + match[0].length }));
}

const MATH_MAX_GROUP_DEPTH = 12;

const SYMBOL_COMMANDS = `alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda mu nu xi pi varpi rho varrho sigma varsigma tau upsilon phi varphi chi psi omega
  Gamma Delta Theta Lambda Xi Pi Sigma Upsilon Phi Psi Omega
  le leq ge geq ne neq lt gt approx equiv sim simeq cong propto in notin ni subset subseteq supset supseteq to rightarrow leftarrow Rightarrow Leftarrow leftrightarrow Leftrightarrow longrightarrow implies iff mapsto perp parallel mid nmid ll gg not
  pm mp times div cdot ast star circ bullet cup cap setminus land lor wedge vee oplus otimes
  infty partial nabla forall exists nexists emptyset varnothing angle measuredangle triangle square degree prime ldots cdots dots vdots ddots therefore because neg lnot hbar ell Re Im aleph top bot
  langle rangle lfloor rfloor lceil rceil vert Vert lvert rvert lVert rVert ulcorner urcorner llcorner lrcorner
  quad qquad`;

const FUNCTION_COMMANDS = 'sin cos tan cot sec csc arcsin arccos arctan sinh cosh tanh log ln lg exp lim limsup liminf max min sup inf det gcd deg arg dim hom ker Pr bmod pmod mod sum prod int iint iiint oint bigcup bigcap coprod';

const STRUCTURE_COMMANDS = `frac dfrac tfrac cfrac sqrt binom dbinom tbinom overline underline hat widehat bar vec dot ddot tilde widetilde overrightarrow overleftarrow overbrace underbrace cancel
  left right big Big bigg Bigg bigl bigr Bigl Bigr biggl biggr Biggl Biggr
  text textbf textit mathrm mathbf mathit mathbb mathcal mathsf mathfrak operatorname overset underset stackrel substack limits nolimits begin end`;

export const ALLOWED_TEX_COMMANDS: ReadonlySet<string> = new Set(`${SYMBOL_COMMANDS} ${FUNCTION_COMMANDS} ${STRUCTURE_COMMANDS}`.split(/\s+/).map((name) => `\\${name}`));

const ALLOWED_ESCAPES: ReadonlySet<string> = new Set(['\\,', '\\;', '\\:', '\\!', '\\ ', '\\{', '\\}', '\\%', '\\$', '\\&', '\\_', '\\|', '\\\\']);

const ALLOWED_ENVIRONMENTS: ReadonlySet<string> = new Set(['matrix', 'pmatrix', 'bmatrix', 'Bmatrix', 'vmatrix', 'Vmatrix', 'smallmatrix', 'cases', 'rcases', 'dcases', 'aligned', 'gathered']);

const NEEDS_TRUST = /^\\(?:href|url|includegraphics|html[A-Za-z]*)$/;

// A comment hides the math after it, and these two have no meaning in math mode.
const REFUSED_CHARACTERS: ReadonlySet<string> = new Set(['%', '#', '$']);

const ENVIRONMENT_NAME = /^\{([A-Za-z]+)\}/;

function getGroupProblem(tex: string, tokens: readonly TexToken[]): string | null {
  const open: string[] = [];
  for (const { text, end } of tokens) {
    if (text === '{' || text === '\\left') open.push(text);
    if (text === '\\begin') {
      const name = ENVIRONMENT_NAME.exec(tex.slice(end).trimStart())?.[1];
      if (name === undefined || !ALLOWED_ENVIRONMENTS.has(name)) return 'math with known environments only';
      open.push(text);
    }
    if (open.length > MATH_MAX_GROUP_DEPTH) return `math nested at most ${MATH_MAX_GROUP_DEPTH} levels deep`;
    if (text === '}' && open.pop() !== '{') return 'math with balanced groups';
    if (text === '\\right' && open.pop() !== '\\left') return 'math with balanced groups';
    if (text === '\\end' && open.pop() !== '\\begin') return 'math with balanced groups';
  }
  return open.length === 0 ? null : 'math with balanced groups';
}

/** Says what is wrong with math a model wrote, or null. Only named commands pass, so nothing can define a macro, size a box, pick a color, or reach a link. */
export function getTexProblem(tex: string): string | null {
  const tokens = getTexTokens(tex);
  for (const { text } of tokens) {
    if (NEEDS_TRUST.test(text)) return 'math with no links, images, or raw HTML';
    if (REFUSED_CHARACTERS.has(text)) return 'math with no comments or dollar signs';
    if (text.startsWith('\\') && !ALLOWED_TEX_COMMANDS.has(text) && !ALLOWED_ESCAPES.has(text)) return `math with known commands only, not ${text}`;
  }
  return getGroupProblem(tex, tokens);
}

export type MathPartRole = 'term' | 'operator' | 'relation';

export interface MathPart {
  tex: string;
  role: MathPartRole;
  start: number;
  end: number;
}

const OPERATOR_TOKENS: ReadonlySet<string> = new Set(['+', '-', '\\pm', '\\mp', '\\times', '\\div', '\\cdot']);
const RELATION_TOKENS: ReadonlySet<string> = new Set(['=', '<', '>', '\\le', '\\leq', '\\ge', '\\geq', '\\ne', '\\neq', '\\approx', '\\equiv', '\\sim', '\\to', '\\rightarrow', '\\Rightarrow', '\\implies', '\\iff']);
const OPENING_TOKENS: ReadonlySet<string> = new Set(['{', '(', '[', '\\{', '\\left', '\\begin', '\\langle', '\\lfloor', '\\lceil', '\\lvert', '\\lVert']);
const CLOSING_TOKENS: ReadonlySet<string> = new Set(['}', ')', ']', '\\}', '\\right', '\\end', '\\rangle', '\\rfloor', '\\rceil', '\\rvert', '\\rVert']);
const TOGGLING_TOKENS: ReadonlySet<string> = new Set(['|', '\\|', '\\vert', '\\Vert']);
const SCRIPT_TOKENS: ReadonlySet<string> = new Set(['^', '_']);
const WHOLE_LINE_TOKENS: ReadonlySet<string> = new Set(['\\\\', '&']);

/** Splits at the top level only. */
export function getMathParts(tex: string): MathPart[] {
  const tokens = getTexTokens(tex);
  const parts: MathPart[] = [];
  let depth = 0;
  let toggledOpen = false;
  let termStart: number | null = null;
  let termEnd = 0;
  const closeTerm = () => {
    if (termStart !== null) parts.push({ tex: tex.slice(termStart, termEnd), role: 'term', start: termStart, end: termEnd });
    termStart = null;
  };
  for (const [index, token] of tokens.entries()) {
    if (TOGGLING_TOKENS.has(token.text)) toggledOpen = !toggledOpen;
    if (OPENING_TOKENS.has(token.text)) depth += 1;
    if (CLOSING_TOKENS.has(token.text)) depth = Math.max(0, depth - 1);
    const isTopLevel = depth === 0 && !toggledOpen;
    if (isTopLevel && WHOLE_LINE_TOKENS.has(token.text)) return [{ tex, role: 'term', start: 0, end: tex.length }];
    const isScripted = SCRIPT_TOKENS.has(tokens[index - 1]?.text ?? '');
    const role = OPERATOR_TOKENS.has(token.text) ? 'operator' : RELATION_TOKENS.has(token.text) ? 'relation' : null;
    if (isTopLevel && role !== null && !isScripted) {
      closeTerm();
      parts.push({ tex: token.text, role, start: token.start, end: token.end });
    } else {
      termStart ??= token.start;
      termEnd = token.end;
    }
  }
  closeTerm();
  return parts;
}

const isBalanced = (tokens: readonly TexToken[]) => {
  let depth = 0;
  for (const { text } of tokens) {
    if (OPENING_TOKENS.has(text)) depth += 1;
    if (CLOSING_TOKENS.has(text)) depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
};

/** Every place in the source that spells `query`, counted from the left, as `highlight.occurrence` counts. */
export function findMathSpans(tex: string, query: string): { start: number; end: number }[] {
  const tokens = getTexTokens(tex);
  const wanted = getTexTokens(query);
  if (wanted.length === 0 || !isBalanced(wanted)) return [];
  const spans: { start: number; end: number }[] = [];
  for (let first = 0; first + wanted.length <= tokens.length; first += 1) {
    const candidate = tokens.slice(first, first + wanted.length);
    if (!candidate.every((token, index) => token.text === wanted[index]?.text)) continue;
    spans.push({ start: candidate[0]?.start ?? 0, end: candidate.at(-1)?.end ?? 0 });
    first += wanted.length - 1;
  }
  return spans;
}
