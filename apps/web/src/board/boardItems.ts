import { type BoardElement, getMotionValue } from '@astra/board';
import { canWriteByHand, createInkPainter, createMathPainter, drawDiagram, type InkPainter, type LayoutBox, type MathPainter, type TermBoxes, type TermQuery, writeByHand, writeStyle } from '@astra/board/drawing';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const HANDWRITING_SCALE = 1.3;
const DIAGRAM_SCALE = 1.1;
export const FIGURE_SIZE = { width: 1000, height: 650 };

export interface ItemContext {
  element: BoardElement;
  atMs: number;
  /** From 0 to 1, how far its entrance or latest rearrangement has run. */
  progress: number;
  maxWidth: number;
  fontSize: number;
  isReducedMotion: boolean;
}

type Size = { width: number; height: number };

export interface ItemSizes {
  fit: LayoutBox['fit'];
  /** Null while it has nothing to show, so it takes no room. */
  size: Size | null;
  /** The size it is moving from, when it is rearranging. */
  fromSize: Size | null;
}

/** One element of the board that takes a place of its own. */
export interface BoardItem {
  prepare(context: ItemContext): ItemSizes;
  paint(context: ItemContext): void;
  /** How see-through the whole element is, when only its opacity carries its entrance. */
  getOpacity?(context: ItemContext): number;
  getTermBoxes?(query: TermQuery): TermBoxes;
  getRefusedTex?(): string | null;
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
    remove: () => painter.remove(),
  };
}

// Strokes hold no text, so the words go in a label for a screen reader. An attribute cannot run.
function createInkSvg({ width, height }: Size, label: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  svg.classList.add('board-ink');
  return svg;
}

interface InkBuild {
  key: string;
  svg: SVGSVGElement;
  painters: InkPainter[];
  size: Size;
}

// Ink depends on the width it may fill, so it is drawn again only when the board changes size.
function createInkItem({ wrapper, label, draw, getProgress }: { wrapper: HTMLElement; label: string; draw(context: ItemContext): { strokeGroups: readonly Parameters<typeof createInkPainter>[1][]; size: Size }; getProgress(context: ItemContext, groupCount: number): number[] }): BoardItem {
  let built: InkBuild | null = null;
  const build = (context: ItemContext): InkBuild => {
    const key = `${context.maxWidth}|${context.fontSize}`;
    if (built?.key === key) return built;
    built?.svg.remove();
    const { strokeGroups, size } = draw(context);
    const svg = createInkSvg(size, label);
    wrapper.append(svg);
    built = { key, svg, painters: strokeGroups.map((strokes) => createInkPainter(svg, strokes)), size };
    return built;
  };
  return {
    prepare: (context) => ({ fit: 'line', size: build(context).size, fromSize: null }),
    paint(context) {
      const { painters } = build(context);
      getProgress(context, painters.length).forEach((progress, index) => painters[index]?.paint(context.isReducedMotion && progress > 0 ? 1 : progress));
    },
    getOpacity: ({ isReducedMotion, progress, element }) => (isReducedMotion && !element.revealedUpTo ? progress : 1),
    remove: () => built?.svg.remove(),
  };
}

function createHandwrittenItem(wrapper: HTMLElement, text: string): BoardItem {
  return createInkItem({
    wrapper,
    label: text,
    draw({ element, maxWidth, fontSize }) {
      const drawing = writeByHand({ text, fontSize: fontSize * HANDWRITING_SCALE, maxWidth, seed: element.id });
      return { strokeGroups: [drawing?.strokes ?? []], size: { width: drawing?.width ?? 0, height: drawing?.height ?? 0 } };
    },
    getProgress: ({ progress }) => [progress],
  });
}

function createDiagramItem(wrapper: HTMLElement, content: Extract<BoardElement['content'], { kind: 'diagram' }>): BoardItem {
  return createInkItem({
    wrapper,
    label: content.nodes.map((node) => node.label).join(', '),
    draw({ element, maxWidth, fontSize }) {
      const drawn = drawDiagram(content, { fontSize: fontSize * DIAGRAM_SCALE, maxWidth, seed: element.id });
      return { strokeGroups: drawn.steps.map((step) => step.strokes), size: { width: drawn.width, height: drawn.height } };
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
    getOpacity: ({ progress }) => progress,
    remove: () => {},
  };
}

function createFigureItem(): BoardItem {
  return { prepare: () => ({ fit: 'figure', size: FIGURE_SIZE, fromSize: null }), paint: () => {}, remove: () => {} };
}

/** The elements that take a place of their own, in a table so a new kind adds one line. */
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
