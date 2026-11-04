/// <reference lib="dom" />
import { findMathSpans } from '@astra/contracts';
import { writeStyle } from '../style-writer.ts';
import { getMovedTermIds, type MathLine } from './math-line.ts';
import { easeInOut, getBoxUnion, getOffsetFromLanding, getFlightTransform, type PaintBox, type PaintInfo, type PaintPlan, planPaints } from './paint-flights.ts';
import { collectMathPaints, FONT_HOLD_LIMIT_MS, type FontWait, getFontWait, getMissingFonts, getPaintsOfSpans, isFontHoldOver, type MathPaintElement, renderTex, type TexSpan } from './render-math.ts';

export interface MathSize {
  width: number;
  height: number;
}

interface RenderedLine {
  line: MathLine;
  host: HTMLElement;
  paints: readonly MathPaintElement[];
  infos: PaintInfo[];
  writingOrder: readonly number[];
  size: MathSize;
  paintsBySpanQuery: Map<string, readonly number[]>;
}

export interface MathFrame {
  line: MathLine;
  morphFrom: MathLine | null;
  /** From 0 to 1, how far the entrance or the rearrangement has run, on the board's clock. */
  progress: number;
  maxWidth: number;
  isReducedMotion: boolean;
}

export interface MathPainter {
  /** Builds what this frame needs, then says the sizes the layout should use. The size is null while there is nothing it can show. */
  prepare(frame: MathFrame): { size: MathSize | null; fromSize: MathSize | null };
  /** Puts every piece of ink where the clock says. Writes nothing when nothing changed. */
  paint(frame: MathFrame): void;
  /** The box of a term by its id or by its source, on the element's own scale, or null if it is not there now. */
  getTermBox(query: TermQuery): TermBoxes;
  /** The source the tutor asked for could not be set, so the board kept what it had. */
  getRefusedTex(): string | null;
  /** Fonts showing as fallback glyphs right now. The equation is correct and on time, and it lays out again if the font lands. */
  getFontProblems(): readonly MathFontProblem[];
  remove(): void;
}

export type TermQuery = { termId: string } | { tex: string; occurrence?: number } | null;

export interface TermBoxes {
  from: PaintBox | null;
  to: PaintBox | null;
  /** How far the term still is from `to` this frame, so a mark on it flies with it. */
  flightOffset: { x: number; y: number };
}

export interface MathFontProblem {
  font: string;
  reason: 'failed' | 'slow';
}

const getLineKey = ({ tex, terms }: MathLine) => `${tex}|${terms.map((term) => term.id).join()}`;

const PAINT_STYLES = ['visibility', 'clipPath', 'opacity', 'transform', 'display', 'transformOrigin'] as const;

// KaTeX breaks a long line into runs, in order. A run that starts left of the one before it starts a new row.
function getRowOfPaint({ host, paints }: { host: HTMLElement; paints: readonly MathPaintElement[] }): number[] {
  const rowOfRun = new Map<Element, number>();
  let row = 0;
  let previousLeft = Number.NEGATIVE_INFINITY;
  for (const run of host.querySelectorAll('.katex-html > .katex-base')) {
    const { left } = run.getBoundingClientRect();
    if (left < previousLeft) row += 1;
    previousLeft = left;
    rowOfRun.set(run, row);
  }
  return paints.map(({ element }) => rowOfRun.get(element.closest('.katex-base') as Element) ?? 0);
}

function getWritingOrder(infos: readonly PaintInfo[], rows: readonly number[]): number[] {
  const by = (index: number) => ({ row: rows[index] as number, ...(infos[index] as PaintInfo).box });
  return infos.map((_, index) => index).sort((first, second) => by(first).row - by(second).row || by(first).x - by(second).x || by(first).y - by(second).y);
}

// An element with a transform reports scaled rectangles, so each measure takes it off for the moment it reads them.
function measureLine({ host, paints, line, root }: { host: HTMLElement; paints: readonly MathPaintElement[]; line: MathLine; root: HTMLElement }) {
  const transform = root.style.transform;
  root.style.transform = 'none';
  const origin = root.getBoundingClientRect();
  const spans = getPaintsOfSpans(line.tex, line.terms, paints);
  const infos = paints.map(({ element, glyph }, index): PaintInfo => {
    const rect = element.getBoundingClientRect();
    const termIndex = spans?.[index];
    return { termId: termIndex === null || termIndex === undefined ? null : (line.terms[termIndex]?.id ?? null), glyph, box: { x: rect.left - origin.left, y: rect.top - origin.top, width: rect.width, height: rect.height }, fontSize: Number.parseFloat(getComputedStyle(element).fontSize) || 1 };
  });
  const inked = getBoxUnion(infos.map((info) => info.box));
  // A wide matrix overflows its box, and the layout must know its true width to shrink it.
  const size = { width: Math.ceil(Math.max(host.offsetWidth, inked ? inked.x + inked.width : 0)), height: Math.ceil(Math.max(host.offsetHeight, inked ? inked.y + inked.height : 0)) };
  const writingOrder = getWritingOrder(infos, getRowOfPaint({ host, paints }));
  root.style.transform = transform;
  return { size, infos, writingOrder };
}

function setWritten({ paints }: RenderedLine, index: number, reveal: number): void {
  const element = (paints[index] as MathPaintElement).element;
  writeStyle(element, 'visibility', reveal <= 0 ? 'hidden' : '');
  writeStyle(element, 'display', reveal > 0 && reveal < 1 ? 'inline-block' : '');
  writeStyle(element, 'clipPath', reveal > 0 && reveal < 1 ? `inset(-30% ${((1 - reveal) * 100).toFixed(1)}% -30% -30%)` : '');
}

// One element's equation, which at rest is exactly the tree KaTeX built.
export function createMathPainter(root: HTMLElement): MathPainter {
  let to: RenderedLine | null = null;
  let from: RenderedLine | null = null;
  let plan: PaintPlan | null = null;
  let renderedWidth = 0;
  let refusedTex: string | null = null;
  let fontWaits: readonly FontWait[] = [];
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  let lastPaintKey = '';
  let builtKey = '';
  let easedNow = 1;

  const isHoldingForFonts = () => !fontWaits.every(isFontHoldOver);

  const showTrees = () => {
    for (const rendered of [to, from]) if (rendered) writeStyle(rendered.host, 'visibility', isHoldingForFonts() ? 'hidden' : '');
  };

  // The wall clock and never the board's: a font decides when ink may show, and the entrance keeps running on the clock behind it. The timer holds for a board that has stopped drawing frames.
  const watchFonts = () => {
    clearTimeout(holdTimer);
    fontWaits = [to, from].flatMap((rendered) => (rendered ? getMissingFonts(rendered.paints) : [])).map(getFontWait);
    if (!isHoldingForFonts()) return;
    holdTimer = setTimeout(showTrees, FONT_HOLD_LIMIT_MS);
    for (const wait of fontWaits) void wait.settled.then(showTrees);
  };

  const render = (line: MathLine, maxWidth: number): RenderedLine | null => {
    const host = document.createElement('div');
    host.dataset.tex = line.tex;
    // Absolute, so measuring one tree never depends on another still being there.
    Object.assign(host.style, { position: 'absolute', left: '0', top: '0', width: 'max-content', maxWidth: `${Math.max(0, maxWidth)}px` });
    if (!renderTex(line.tex, host)) return null;
    root.append(host);
    const paints = collectMathPaints(host);
    const measured = measureLine({ host, paints, line, root });
    measured.infos.forEach((info, index) => {
      if (info.termId !== null) (paints[index] as MathPaintElement).element.dataset.term = info.termId;
    });
    return { line, host, paints, ...measured, paintsBySpanQuery: new Map() };
  };

  const settleTree = (rendered: RenderedLine) => {
    for (const { element } of rendered.paints) for (const name of PAINT_STYLES) writeStyle(element, name, '');
    writeStyle(rendered.host, 'opacity', '');
  };

  const rebuild = (line: MathLine, fromLine: MathLine | null, maxWidth: number) => {
    const previous = [to, from];
    const reuse = (wanted: MathLine) => (renderedWidth === maxWidth ? previous.find((rendered) => rendered && getLineKey(rendered.line) === getLineKey(wanted)) : undefined) ?? render(wanted, maxWidth);
    const nextTo = reuse(line);
    refusedTex = nextTo ? null : line.tex;
    const newOrLastGood = nextTo ?? (to && reuse(to.line));
    const nextFrom = nextTo && fromLine ? reuse(fromLine) : null;
    for (const rendered of previous) if (rendered && rendered !== newOrLastGood && rendered !== nextFrom) rendered.host.remove();
    to = newOrLastGood;
    from = nextFrom;
    if (to) settleTree(to);
    if (from) settleTree(from);
    plan = from && to ? planPaints({ from: from.infos, to: to.infos, movedTermIds: getMovedTermIds(from.line, to.line) }) : null;
    renderedWidth = maxWidth;
    lastPaintKey = '';
    watchFonts();
  };

  const prepareTrees = ({ line, morphFrom, progress, maxWidth }: MathFrame) => {
    const fromLine = morphFrom !== null && progress < 1 && morphFrom.tex !== line.tex ? morphFrom : null;
    const key = `${maxWidth}|${fromLine ? getLineKey(fromLine) : ''}|${getLineKey(line)}`;
    if (key === builtKey) return;
    builtKey = key;
    rebuild(line, fromLine, maxWidth);
  };

  // Settled first, because a piece of ink in flight would measure where it is flying and not where it sits. A rebuild forgets the waits and keeps the trees it reuses, so this runs before one.
  const refreshAfterFonts = () => {
    if (!fontWaits.some((wait) => wait.outcome === 'arrived')) return;
    fontWaits = fontWaits.filter((wait) => wait.outcome !== 'arrived');
    for (const rendered of [to, from]) {
      if (!rendered) continue;
      settleTree(rendered);
      Object.assign(rendered, measureLine({ host: rendered.host, paints: rendered.paints, line: rendered.line, root }));
    }
    if (from && to) plan = planPaints({ from: from.infos, to: to.infos, movedTermIds: getMovedTermIds(from.line, to.line) });
    lastPaintKey = '';
  };

  const paintWriting = (rendered: RenderedLine, progress: number, isReducedMotion: boolean) => {
    if (isReducedMotion) {
      writeStyle(rendered.host, 'opacity', progress >= 1 ? '' : progress.toFixed(3));
      return;
    }
    const count = rendered.writingOrder.length;
    rendered.writingOrder.forEach((paintIndex, position) => setWritten(rendered, paintIndex, Math.min(1, Math.max(0, progress * count - position))));
  };

  const paintMorph = (fromLine: RenderedLine, toLine: RenderedLine, activePlan: PaintPlan, progress: number, isReducedMotion: boolean) => {
    if (isReducedMotion) {
      writeStyle(fromLine.host, 'opacity', (1 - progress).toFixed(3));
      writeStyle(toLine.host, 'opacity', progress.toFixed(3));
      return;
    }
    const eased = easeInOut(progress);
    easedNow = eased;
    for (const { fromIndex, toIndex, isCrossing } of activePlan.flights) {
      const element = (fromLine.paints[fromIndex] as MathPaintElement).element;
      writeStyle(element, 'display', 'inline-block');
      writeStyle(element, 'transformOrigin', '0 0');
      writeStyle(element, 'transform', getFlightTransform({ from: fromLine.infos[fromIndex] as PaintInfo, to: toLine.infos[toIndex] as PaintInfo, isCrossing }, eased));
      writeStyle((toLine.paints[toIndex] as MathPaintElement).element, 'visibility', 'hidden');
    }
    const leaving = Math.max(0, 1 - progress * 2);
    const arriving = Math.max(0, progress * 2 - 1);
    for (const index of activePlan.leaving) writeStyle((fromLine.paints[index] as MathPaintElement).element, 'opacity', leaving.toFixed(3));
    for (const index of activePlan.arriving) writeStyle((toLine.paints[index] as MathPaintElement).element, 'opacity', arriving.toFixed(3));
  };

  const getSpanIndexes = (rendered: RenderedLine, query: TermQuery): readonly number[] | null => {
    if (query === null) return rendered.infos.map((_, index) => index);
    if ('termId' in query) {
      const indexes = rendered.infos.flatMap((info, index) => (info.termId === query.termId ? [index] : []));
      return indexes.length > 0 ? indexes : null;
    }
    const key = `${query.tex}|${query.occurrence ?? 0}`;
    const known = rendered.paintsBySpanQuery.get(key);
    if (known) return known;
    const span: TexSpan | undefined = findMathSpans(rendered.line.tex, query.tex)[query.occurrence ?? 0];
    if (!span) return null;
    const owners = getPaintsOfSpans(rendered.line.tex, [span], rendered.paints);
    const indexes = owners?.flatMap((owner, index) => (owner === 0 ? [index] : [])) ?? [];
    rendered.paintsBySpanQuery.set(key, indexes);
    return indexes;
  };

  const getBoxOfSpan = (rendered: RenderedLine | null, query: TermQuery): PaintBox | null => {
    if (!rendered) return null;
    const indexes = getSpanIndexes(rendered, query);
    return indexes ? getBoxUnion(indexes.map((index) => (rendered.infos[index] as PaintInfo).box)) : null;
  };

  const getLiveOffset = (query: TermQuery): { x: number; y: number } => {
    const none = { x: 0, y: 0 };
    if (!from || !to || !plan) return none;
    const indexes = new Set(getSpanIndexes(to, query) ?? []);
    const flight = plan.flights.find((candidate) => indexes.has(candidate.toIndex));
    if (!flight) return none;
    return getOffsetFromLanding({ from: from.infos[flight.fromIndex] as PaintInfo, to: to.infos[flight.toIndex] as PaintInfo, isCrossing: flight.isCrossing }, easedNow);
  };

  return {
    prepare(frame) {
      refreshAfterFonts();
      prepareTrees(frame);
      writeStyle(root, 'width', to ? `${to.size.width}px` : '');
      writeStyle(root, 'height', to ? `${to.size.height}px` : '');
      return { size: to?.size ?? null, fromSize: from?.size ?? null };
    },
    paint(frame) {
      showTrees();
      const key = `${frame.progress}|${frame.isReducedMotion}|${to?.line.tex}|${from?.line.tex}`;
      if (key === lastPaintKey || !to) return;
      lastPaintKey = key;
      if (from && plan) paintMorph(from, to, plan, frame.progress, frame.isReducedMotion);
      else if (frame.morphFrom === null) paintWriting(to, frame.progress, frame.isReducedMotion);
      if (!from && frame.progress >= 1) settleTree(to);
    },
    getTermBox: (query) => ({ from: getBoxOfSpan(from, query), to: getBoxOfSpan(to, query), flightOffset: getLiveOffset(query) }),
    getRefusedTex: () => refusedTex,
    getFontProblems: () => fontWaits.filter((wait) => wait.outcome !== 'arrived' && isFontHoldOver(wait)).map(({ font, outcome }) => ({ font, reason: outcome === 'failed' ? 'failed' : 'slow' })),
    remove() {
      clearTimeout(holdTimer);
      to?.host.remove();
      from?.host.remove();
    },
  };
}
