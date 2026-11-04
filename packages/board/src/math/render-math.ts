/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
// The swap build, because the default holds text invisible for 3 s behind a stalled font, past the point the painter gives up waiting.
import 'katex/dist/katex-swap.min.css';
import { buildTexTree } from './tex-check.ts';

/** Builds real DOM nodes and text nodes, with no HTML string anywhere, so math text has no way to become markup. */
export function renderTex(tex: string, into: HTMLElement): boolean {
  const tree = buildTexTree(tex);
  into.replaceChildren(...(tree ? [tree.toNode()] : []));
  return tree !== null;
}

export interface MathPaintElement {
  element: HTMLElement;
  /** The characters, or null for a shape such as a fraction bar. */
  glyph: string | null;
}

const NOT_PAINT = '.katex-strut, .strut, .pstrut, .vlist-s, .mspace';
const SHAPE = '.frac-line, .overline-line, .underline-line, .hline, .hdashline, .vertical-separator';
const NO_INK = /[\s\u200b]/g;

function getOwnText(element: Element): string {
  let text = '';
  for (const node of element.childNodes) if (node.nodeType === Node.TEXT_NODE) text += (node.textContent ?? '').replace(NO_INK, '');
  return text;
}

function collectFrom(element: Element, paints: MathPaintElement[]): void {
  if (element.matches(NOT_PAINT)) return;
  const text = getOwnText(element);
  const paint = { element: element as HTMLElement, glyph: text === '' ? null : text };
  // KaTeX sets the `g` of `\gcd` as a span and `cd` as bare text after it, and a marked copy reads g, c, d, so the text keeps its place in reading order.
  const isTextAfterChild = text !== '' && element.firstChild?.nodeType === Node.ELEMENT_NODE;
  if (text !== '' && !isTextAfterChild) paints.push(paint);
  else if (text === '' && element.matches(SHAPE)) paints.push(paint);
  else if (text === '' && element.querySelector(':scope > svg')) {
    paints.push(paint);
    return;
  }
  for (const child of element.children) collectFrom(child, paints);
  if (isTextAfterChild) paints.push(paint);
}

/** Every piece of ink in KaTeX's output, in its own order, which is the same for the same source. */
export function collectMathPaints(root: Element): MathPaintElement[] {
  const paints: MathPaintElement[] = [];
  const html = root.querySelector('.katex-html');
  if (html) for (const child of html.children) collectFrom(child, paints);
  return paints;
}

export interface TexSpan {
  start: number;
  end: number;
}

const COLOR_NUMBER = /^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)$/;

const toSentinelColor = (number: number) => `#${number.toString(16).padStart(6, '0')}`;

function readSentinelNumber(element: HTMLElement): number | null {
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    const match = COLOR_NUMBER.exec(current.style.color);
    if (match) return Number(match[1]) * 65536 + Number(match[2]) * 256 + Number(match[3]);
  }
  return null;
}

// The outer group is what lets a marked part stand as a script or an argument, as in `x^2`, `\hat x`, and `\frac\pi2`. The second form is for a big operator, whose limits sit above and below only while it stays an operator. The third is for `\limsup\nolimits`, where KaTeX keeps the limits below in display style.
const MARKERS: readonly ((color: string, source: string) => string)[] = [(color, source) => `{\\textcolor{${color}}{${source}}}`, (color, source) => `\\mathop{\\textcolor{${color}}{${source}}}\\limits`, (color, source) => `\\operatorname*{\\textcolor{${color}}{${source}}}`];

function wrapSpans(tex: string, spans: readonly TexSpan[], marker: (typeof MARKERS)[number]): string {
  let wrapped = '';
  let position = 0;
  spans.forEach(({ start, end }, index) => {
    wrapped += `${tex.slice(position, start)}${marker(toSentinelColor(index + 1), tex.slice(start, end))}`;
    position = end;
  });
  return wrapped + tex.slice(position);
}

function readOwner(paint: MathPaintElement): number | null {
  const number = readSentinelNumber(paint.element);
  return number === null ? null : number - 1;
}

// KaTeX sets a run such as `lim` as one span, and as one span per letter once it has a color, so one visible glyph may take several marked ones.
function alignOwners(visible: readonly MathPaintElement[], marked: readonly MathPaintElement[]): (number | null)[] | null {
  const owners: (number | null)[] = [];
  let next = 0;
  for (const { glyph } of visible) {
    const first = marked[next];
    if (!first || (first.glyph === null) !== (glyph === null)) return null;
    next += 1;
    let text = first.glyph;
    while (text !== glyph) {
      const more = marked[next];
      if (!more?.glyph || !glyph?.startsWith(`${text}${more.glyph}`) || readOwner(more) !== readOwner(first)) return null;
      text = `${text}${more.glyph}`;
      next += 1;
    }
    owners.push(readOwner(first));
  }
  return next === marked.length ? owners : null;
}

function readOwners(markedTex: string, visible: readonly MathPaintElement[]): (number | null)[] | null {
  const hidden = document.createElement('div');
  return renderTex(markedTex, hidden) ? alignOwners(visible, collectMathPaints(hidden)) : null;
}

// KaTeX keeps no ids under `trust: false`, but a color passes through to every span it sets, so marker colors in a hidden copy show which ink each span made.
export function getPaintsOfSpans(tex: string, spans: readonly TexSpan[], visible: readonly MathPaintElement[]): (number | null)[] | null {
  for (const marker of MARKERS) {
    const owners = readOwners(wrapSpans(tex, spans, marker), visible);
    if (owners) return owners;
  }
  return null;
}

export function getMissingFonts(paints: readonly MathPaintElement[]): string[] {
  const fonts = new Set(paints.flatMap(({ element, glyph }) => {
    if (glyph === null) return [];
    const { fontStyle, fontWeight, fontFamily } = getComputedStyle(element);
    return [`${fontStyle} ${fontWeight} 16px ${fontFamily}`];
  }));
  return [...fonts].filter((font) => !document.fonts.check(font));
}

/** How long an equation stays hidden for a font on the way. A slow phone link brings a font well inside it, and a student is still on the word when it ends. */
export const FONT_HOLD_LIMIT_MS = 1000;

export interface FontWait {
  font: string;
  outcome: 'pending' | 'arrived' | 'failed';
  startedMs: number;
  settled: Promise<void>;
}

const fontWaitsOfPage = new WeakMap<FontFaceSet, Map<string, FontWait>>();

/** One wait per font per page, so the next equation never waits again for a font that already ran out of time. */
export function getFontWait(font: string): FontWait {
  const waits = fontWaitsOfPage.get(document.fonts) ?? new Map<string, FontWait>();
  fontWaitsOfPage.set(document.fonts, waits);
  const known = waits.get(font);
  if (known) return known;
  const wait: FontWait = { font, outcome: 'pending', startedMs: performance.now(), settled: Promise.resolve() };
  wait.settled = document.fonts.load(font).then(
    () => {
      wait.outcome = 'arrived';
    },
    () => {
      wait.outcome = 'failed';
    },
  );
  waits.set(font, wait);
  return wait;
}

export const isFontHoldOver = ({ outcome, startedMs }: FontWait) => outcome !== 'pending' || performance.now() - startedMs >= FONT_HOLD_LIMIT_MS;

const MATH_FONTS = ['16px KaTeX_Main', 'italic 16px KaTeX_Math', '16px KaTeX_Size1', '16px KaTeX_Size2'];

export function preloadMathFonts(): Promise<unknown> {
  return Promise.allSettled(MATH_FONTS.map((font) => document.fonts.load(font)));
}
