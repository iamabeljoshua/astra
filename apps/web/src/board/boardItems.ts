import { type BoardElement, getMotionValue } from '@astra/board';
import { canWriteByHand, createInkPainter, createMathPainter, type DiagramTextLabel, drawDiagram, type InkPainter, type LayoutBox, type MathFontProblem, type MathPainter, type MeasureText, type TermBoxes, type TermQuery, writeByHand, writeStyle } from '@astra/board/drawing';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const HANDWRITING_SCALE = 1.3;
const DIAGRAM_SCALE = 1.1;
export const FIGURE_SIZE = { width: 1000, height: 650 };

export interface ItemContext {
  element: BoardElement;
  atMs: number;
  progress: number;
  maxWidth: number;
  fontSize: number;
  isReducedMotion: boolean;
}

type Size = { width: number; height: number };

export interface ItemSizes {
  fit: LayoutBox['fit'];
  size: Size | null;
  fromSize: Size | null;
}

export interface BoardItem {
  prepare(context: ItemContext): ItemSizes;
  paint(context: ItemContext): void;
  getEntranceOpacity?(context: ItemContext): number;
  getTermBoxes?(query: TermQuery): TermBoxes;
  getRefusedTex?(): string | null;
  getFontProblems?(): readonly MathFontProblem[];
  remove(): void;
}

function createMathItem(wrapper: HTMLElement): BoardItem {
  const painter: MathPainter = createMathPainter(wrapper);
  const getFrame = ({ element, progress, maxWidth, isReducedMotion }: ItemContext) => ({ line: element.math as NonNullable<BoardElement['math']>, morphFrom: element.morphFrom, progress, maxWidth, isReducedMotion });
  return {
    prepare(context) {
      const { size, fromSize } = painter.prepare(getFrame(context));
      return { fit: 'line', size, fromSize };
    },
    paint: (context) => painter.paint(getFrame(context)),
    getTermBoxes: (query) => painter.getTermBox(query),
    getRefusedTex: () => painter.getRefusedTex(),
    getFontProblems: () => painter.getFontProblems(),
    remove: () => painter.remove(),
  };
}

function createInkSvg({ width, height }: Size, label: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  svg.classList.add('board-ink');
  return svg;
}

// Text nodes only, so a label has no way to become markup.
function createTextLabel(svg: SVGSVGElement, { lines, baselines, x, y, fontSize }: DiagramTextLabel): SVGTextElement {
  const text = document.createElementNS(SVG_NAMESPACE, 'text');
  text.classList.add('board-ink-text');
  text.setAttribute('font-size', String(fontSize));
  lines.forEach((line, index) => {
    const span = document.createElementNS(SVG_NAMESPACE, 'tspan');
    span.setAttribute('x', String(x));
    span.setAttribute('y', String(y + (baselines[index] as number)));
    span.textContent = line;
    text.append(span);
  });
  writeStyle(text, 'visibility', 'hidden');
  svg.append(text);
  return text;
}

function paintTextLabel(text: SVGTextElement, drawn: number): void {
  writeStyle(text, 'visibility', drawn === 0 ? 'hidden' : '');
  writeStyle(text, 'opacity', drawn > 0 && drawn < 1 ? drawn.toFixed(3) : '');
}

interface InkGroup {
  strokes: Parameters<typeof createInkPainter>[1];
  textLabels: readonly DiagramTextLabel[];
}

interface InkBuild {
  key: string;
  svg: SVGSVGElement;
  painters: InkPainter[];
  texts: SVGTextElement[][];
  size: Size;
}

function createInkItem({ wrapper, label, draw, getProgress }: { wrapper: HTMLElement; label: string; draw(context: ItemContext): { groups: readonly InkGroup[]; size: Size }; getProgress(context: ItemContext, groupCount: number): number[] }): BoardItem {
  let built: InkBuild | null = null;
  const build = (context: ItemContext): InkBuild => {
    const key = `${context.maxWidth}|${context.fontSize}`;
    if (built?.key === key) return built;
    built?.svg.remove();
    const { groups, size } = draw(context);
    const svg = createInkSvg(size, label);
    wrapper.append(svg);
    built = { key, svg, painters: groups.map(({ strokes }) => createInkPainter(svg, strokes)), texts: groups.map(({ textLabels }) => textLabels.map((textLabel) => createTextLabel(svg, textLabel))), size };
    return built;
  };
  return {
    prepare: (context) => ({ fit: 'line', size: build(context).size, fromSize: null }),
    paint(context) {
      const { painters, texts } = build(context);
      getProgress(context, painters.length).forEach((progress, index) => {
        const drawn = context.isReducedMotion && progress > 0 ? 1 : progress;
        painters[index]?.paint(drawn);
        for (const text of texts[index] ?? []) paintTextLabel(text, drawn);
      });
    },
    getEntranceOpacity: ({ isReducedMotion, progress, element }) => (isReducedMotion && !element.revealedUpTo ? progress : 1),
    remove: () => built?.svg.remove(),
  };
}

function createHandwrittenItem(wrapper: HTMLElement, text: string): BoardItem {
  return createInkItem({
    wrapper,
    label: text,
    draw({ element, maxWidth, fontSize }) {
      const drawing = writeByHand({ text, fontSize: fontSize * HANDWRITING_SCALE, maxWidth, seed: element.id });
      return { groups: [{ strokes: drawing?.strokes ?? [], textLabels: [] }], size: { width: drawing?.width ?? 0, height: drawing?.height ?? 0 } };
    },
    getProgress: ({ progress }) => [progress],
  });
}

function getTextMeasure(wrapper: HTMLElement): { measureText?: MeasureText } {
  const context = document.createElement('canvas').getContext('2d');
  if (!context) return {};
  const { fontFamily } = getComputedStyle(wrapper);
  return {
    measureText(text, fontSize) {
      context.font = `${fontSize}px ${fontFamily}`;
      return context.measureText(text).width;
    },
  };
}

function createDiagramItem(wrapper: HTMLElement, content: Extract<BoardElement['content'], { kind: 'diagram' }>): BoardItem {
  return createInkItem({
    wrapper,
    label: content.nodes.map((node) => node.label).join(', '),
    draw({ element, maxWidth, fontSize }) {
      const drawn = drawDiagram(content, { fontSize: fontSize * DIAGRAM_SCALE, maxWidth, seed: element.id, ...getTextMeasure(wrapper) });
      return { groups: drawn.steps, size: { width: drawn.width, height: drawn.height } };
    },
    getProgress({ element, atMs, progress }, groupCount) {
      const reached = element.revealedUpTo ? getMotionValue(element.revealedUpTo, atMs) : progress * groupCount;
      return Array.from({ length: groupCount }, (_, index) => Math.min(1, Math.max(0, reached - index)));
    },
  });
}

function createPlainItem(wrapper: HTMLElement): BoardItem {
  return {
    prepare({ maxWidth }) {
      writeStyle(wrapper, 'maxWidth', `${maxWidth}px`);
      return { fit: 'line', size: { width: wrapper.offsetWidth, height: wrapper.offsetHeight }, fromSize: null };
    },
    paint: () => {},
    getEntranceOpacity: ({ progress }) => progress,
    remove: () => {},
  };
}

function createFigureItem(): BoardItem {
  return { prepare: () => ({ fit: 'figure', size: FIGURE_SIZE, fromSize: null }), paint: () => {}, remove: () => {} };
}

const ITEM_MAKERS: Partial<{ [Kind in BoardElement['content']['kind']]: (wrapper: HTMLElement, content: Extract<BoardElement['content'], { kind: Kind }>) => BoardItem }> = {
  writeMath: (wrapper) => createMathItem(wrapper),
  diagram: (wrapper, content) => createDiagramItem(wrapper, content),
  simulate: () => createFigureItem(),
  text: (wrapper, content) => (content.handwritten && canWriteByHand(content.text) ? createHandwrittenItem(wrapper, content.text) : createPlainItem(wrapper)),
};

export function hasOwnPlace(content: BoardElement['content']): boolean {
  return Object.hasOwn(ITEM_MAKERS, content.kind);
}

export function createBoardItem(element: BoardElement, wrapper: HTMLElement): BoardItem {
  const make = ITEM_MAKERS[element.content.kind] as (wrapper: HTMLElement, content: BoardElement['content']) => BoardItem;
  return make(wrapper, element.content);
}
