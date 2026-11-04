import { type BoardElement, type BoardState, getMotionValue } from '@astra/board';
import { type MarkBox, type MovingPlacement, type TermQuery, writeStyle } from '@astra/board/drawing';
import { createBoardMarks, type MarkWithoutTarget } from './boardMarks';
import { type BoardItem, createBoardItem, hasOwnPlace, type ItemContext } from './boardItems';
import { isInGutter } from './boardRows';

/** The prototype's graph is at most this wide, and a tall figure must leave room for the lines around it. */
const LARGEST_FIGURE = { width: 620, height: 420 };

interface RowPaintingOptions {
  overlay: SVGSVGElement;
  getWrapper(id: string): HTMLElement | undefined;
  onMarkProblem?(problem: MarkWithoutTarget): void;
}

function sizeWrapper(wrapper: HTMLElement, element: BoardElement, size: { width: number; height: number }, fit: string, columnWidth: number): number {
  const content = wrapper.parentElement as HTMLElement;
  if (fit === 'figure') {
    const scale = Math.min(1, Math.min(columnWidth, LARGEST_FIGURE.width) / size.width, LARGEST_FIGURE.height / size.height);
    writeStyle(wrapper, 'transform', `scale(${scale.toFixed(4)})`);
    content.style.height = `${Math.ceil(size.height * scale)}px`;
    return scale;
  }
  // A math tree is absolute, so its row takes the size the painter measured.
  if (element.math) {
    wrapper.style.width = `${size.width}px`;
    wrapper.style.height = `${size.height}px`;
  }
  return 1;
}

// Paints one frame of the shared board's rows from its state and the clock alone. The rows sit in normal flow, like lines on a page, and the marks follow where they landed.
export function createBoardRowPainting({ overlay, getWrapper, onMarkProblem }: RowPaintingOptions) {
  const items = new Map<string, { kind: string; item: BoardItem }>();
  const marks = createBoardMarks(overlay, onMarkProblem);
  let lastPlacements: ReadonlyMap<string, MovingPlacement> = new Map();

  const syncItems = (placed: readonly BoardElement[]) => {
    const live = new Set(placed.map((element) => element.id as string));
    for (const [id, { item }] of items) {
      if (live.has(id)) continue;
      item.remove();
      items.delete(id);
    }
    for (const element of placed) {
      const wrapper = getWrapper(element.id);
      if (!wrapper || items.get(element.id)?.kind === element.content.kind) continue;
      items.get(element.id)?.item.remove();
      items.set(element.id, { kind: element.content.kind, item: createBoardItem(element, wrapper) });
    }
  };

  const paintRow = (element: BoardElement, { atMs, isReducedMotion }: { atMs: number; isReducedMotion: boolean }): MovingPlacement | null => {
    const entry = items.get(element.id);
    const wrapper = getWrapper(element.id);
    if (!entry || !wrapper) return null;
    const columnWidth = (wrapper.parentElement as HTMLElement).clientWidth;
    const fontSize = Number.parseFloat(getComputedStyle(wrapper).fontSize) || 30;
    const context: ItemContext = { element, atMs, progress: getMotionValue(element.entrance, atMs), maxWidth: columnWidth, fontSize, isReducedMotion };
    const sizes = entry.item.prepare(context);
    const scale = sizes.size ? sizeWrapper(wrapper, element, sizes.size, sizes.fit, columnWidth) : 1;
    entry.item.paint(context);
    const opacity = entry.item.getEntranceOpacity?.(context) ?? 1;
    writeStyle(wrapper, 'opacity', opacity < 1 ? String(Number(opacity.toFixed(3))) : '');
    const origin = overlay.getBoundingClientRect();
    const box = wrapper.getBoundingClientRect();
    return { id: element.id, x: box.left - origin.left, y: box.top - origin.top, width: (sizes.size?.width ?? wrapper.offsetWidth) * scale, height: (sizes.size?.height ?? wrapper.offsetHeight) * scale, scale, isVisible: true, opacity: 1 } as MovingPlacement;
  };

  return {
    paint({ board, atMs, isReducedMotion }: { board: BoardState; atMs: number; isReducedMotion: boolean }) {
      const elements = [...board.elements.values()];
      const placed = elements.filter((element) => hasOwnPlace(element.content) && getWrapper(element.id));
      syncItems(placed);
      const placements = new Map(placed.flatMap((element) => {
        const placement = paintRow(element, { atMs, isReducedMotion });
        return placement ? [[element.id as string, placement] as const] : [];
      }));
      lastPlacements = placements;
      marks.paint({ elements: elements.filter((element) => !isInGutter(element)), focus: board.focus, placements, getItem: (id) => items.get(id)?.item, atMs, isReducedMotion });
    },
    /** Where a part of an element sits on the board now, for a student to pick it. */
    getPartBox(id: string, query: TermQuery): MarkBox | null {
      const placement = lastPlacements.get(id);
      const box = placement ? items.get(id)?.item.getTermBoxes?.(query).to : null;
      if (!placement || !box) return null;
      return { x: placement.x + box.x * placement.scale, y: placement.y + box.y * placement.scale, width: box.width * placement.scale, height: box.height * placement.scale };
    },
  };
}
