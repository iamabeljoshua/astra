/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { DISPLAY_STYLE, KATEX_OPTIONS } from './tex-check.ts';

/** Builds real DOM nodes and text nodes, with no HTML string anywhere, so math text has no way to become markup. */
export function renderTex(tex: string, into: HTMLElement): boolean {
  try {
    katex.render(DISPLAY_STYLE + tex, into, KATEX_OPTIONS);
    return true;
  } catch {
    into.replaceChildren();
    return false;
  }
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
  if (text !== '') paints.push({ element: element as HTMLElement, glyph: text });
  else if (element.matches(SHAPE)) paints.push({ element: element as HTMLElement, glyph: null });
  else if (element.querySelector(':scope > svg')) {
    paints.push({ element: element as HTMLElement, glyph: null });
    return;
  }
  for (const child of element.children) collectFrom(child, paints);
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

function wrapSpans(tex: string, spans: readonly TexSpan[]): string {
  let wrapped = '';
  let position = 0;
  spans.forEach(({ start, end }, index) => {
    wrapped += `${tex.slice(position, start)}\\textcolor{${toSentinelColor(index + 1)}}{${tex.slice(start, end)}}`;
    position = end;
  });
  return wrapped + tex.slice(position);
}

// KaTeX keeps no ids under `trust: false`, but a color passes through to every span it sets, so marker colors in a hidden copy show which ink each span made.
export function getPaintsOfSpans(tex: string, spans: readonly TexSpan[], visible: readonly MathPaintElement[]): (number | null)[] | null {
  const hidden = document.createElement('div');
  if (!renderTex(wrapSpans(tex, spans), hidden)) return null;
  const marked = collectMathPaints(hidden);
  if (marked.length !== visible.length || marked.some((paint, index) => paint.glyph !== visible[index]?.glyph)) return null;
  return marked.map((paint) => {
    const number = readSentinelNumber(paint.element);
    return number === null ? null : number - 1;
  });
}

export function getMissingFonts(paints: readonly MathPaintElement[]): string[] {
  const fonts = new Set(paints.flatMap(({ element, glyph }) => {
    if (glyph === null) return [];
    const { fontStyle, fontWeight, fontFamily } = getComputedStyle(element);
    return [`${fontStyle} ${fontWeight} 16px ${fontFamily}`];
  }));
  return [...fonts].filter((font) => !document.fonts.check(font));
}

const MATH_FONTS = ['16px KaTeX_Main', 'italic 16px KaTeX_Math', '16px KaTeX_Size1', '16px KaTeX_Size2'];

export function preloadMathFonts(): Promise<unknown> {
  return Promise.allSettled(MATH_FONTS.map((font) => document.fonts.load(font)));
}
