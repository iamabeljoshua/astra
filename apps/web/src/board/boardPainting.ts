import { type BoardElement, type BoardState, getMotionValue } from '@astra/board';
import { easeInOut, type LayoutArea, type MarkBox, type MathFontProblem, type MovingBox, type MovingPlacement, placeMovingElements, type TermQuery, writeStyle } from '@astra/board/drawing';
import { createBoardMarks, type MarkWithoutTarget } from './boardMarks';
import { type BoardItem, createBoardItem, hasOwnPlace, type ItemContext, type ItemSizes } from './boardItems';

const PHONE_BOARD_WIDTH = 500;
const SPACING = { laptop: { padding: 24, gap: 20 }, phone: { padding: 16, gap: 16 } };
const ENTRANCE_SHARE_MAKING_ROOM = 1 / 3;
/** A note goes under its line on a phone, so the line keeps this much room for it. */
const NOTE_ROOM = 26;

export interface BoardFrame {
  board: BoardState;
  atMs: number;
  isReducedMotion: boolean;
}

/** The board drew what it could and something a tutor asked for is not as asked. Math the board refused goes to `onMathRefused`. */
export type BoardProblem = MarkWithoutTarget | ({ kind: 'fontFallback' } & MathFontProblem);

export interface BoardPaintingOptions {
  boardElement: HTMLElement;
  overlay: SVGSVGElement;
  getWrapper(id: string): HTMLElement | undefined;
  onMathRefused?(tex: string): void;
  onBoardProblem?(problem: BoardProblem): void;
}

function getArea(boardElement: HTMLElement): LayoutArea {
  const width = boardElement.clientWidth;
  const { padding, gap } = width < PHONE_BOARD_WIDTH ? SPACING.phone : SPACING.laptop;
  return { width, height: boardElement.clientHeight, padding, gap };
}

function getMovingBox(context: ItemContext, sizes: ItemSizes & { size: NonNullable<ItemSizes['size']> }, extraHeight: number): MovingBox {
  const to = { id: context.element.id, fit: sizes.fit, ...sizes.size, height: sizes.size.height + extraHeight };
  const isArriving = context.progress < 1 && context.element.morphFrom === null;
  return { to, from: isArriving ? null : sizes.fromSize ? { ...to, ...sizes.fromSize } : to };
}

function getProgressAfterRoom({ element, progress }: ItemContext): number {
  return element.morphFrom === null ? Math.max(0, (progress - ENTRANCE_SHARE_MAKING_ROOM) / (1 - ENTRANCE_SHARE_MAKING_ROOM)) : progress;
}

function applyPlacement(wrapper: HTMLElement, placement: MovingPlacement, itemOpacity: number): void {
  const opacity = Math.min(placement.opacity, itemOpacity);
  writeStyle(wrapper, 'transform', `translate(${Math.round(placement.x)}px, ${Math.round(placement.y)}px) scale(${placement.scale.toFixed(4)})`);
  writeStyle(wrapper, 'visibility', placement.isVisible ? '' : 'hidden');
  writeStyle(wrapper, 'opacity', opacity < 1 ? String(Number(opacity.toFixed(3))) : '');
}

// Paints one frame from the board's state and the clock alone, so a frozen board writes nothing and a replay lands on the same pixels.
export function createBoardPainting({ boardElement, overlay, getWrapper, onMathRefused, onBoardProblem }: BoardPaintingOptions) {
  const items = new Map<string, { kind: string; item: BoardItem }>();
  const marks = createBoardMarks(overlay, onBoardProblem);
  const reportedRefusals = new Set<string>();
  const reportedFonts = new Set<string>();
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

  const reportRefused = (item: BoardItem) => {
    const tex = item.getRefusedTex?.();
    if (!tex || reportedRefusals.has(tex)) return;
    reportedRefusals.add(tex);
    onMathRefused?.(tex);
  };

  const reportFonts = (item: BoardItem) => {
    for (const { font, reason } of item.getFontProblems?.() ?? []) {
      const key = `${reason}|${font}`;
      if (reportedFonts.has(key)) continue;
      reportedFonts.add(key);
      onBoardProblem?.({ kind: 'fontFallback', font, reason });
    }
  };

  const getSharedProgress = (contexts: readonly ItemContext[], isReducedMotion: boolean) => {
    const moving = contexts.filter(({ progress }) => progress < 1).map(({ progress }) => progress);
    return moving.length === 0 || isReducedMotion ? 1 : easeInOut(Math.min(1, Math.min(...moving) / ENTRANCE_SHARE_MAKING_ROOM));
  };

  const prepareBoxes = (contexts: readonly ItemContext[], notedOnPhone: ReadonlySet<string>): MovingBox[] =>
    contexts.flatMap((context) => {
      const entry = items.get(context.element.id);
      if (!entry) return [];
      const sizes = entry.item.prepare(context);
      reportRefused(entry.item);
      reportFonts(entry.item);
      return sizes.size ? [getMovingBox(context, { ...sizes, size: sizes.size }, notedOnPhone.has(context.element.id) ? NOTE_ROOM : 0)] : [];
    });

  const paintItem = (context: ItemContext, placement: MovingPlacement | undefined, isMakingRoom: boolean) => {
    const { id } = context.element;
    const entry = items.get(id);
    const wrapper = getWrapper(id);
    if (!entry || !wrapper) return;
    if (placement) applyPlacement(wrapper, placement, entry.item.getEntranceOpacity?.(context) ?? 1);
    else writeStyle(wrapper, 'visibility', 'hidden');
    entry.item.paint(isMakingRoom && !context.isReducedMotion ? { ...context, progress: getProgressAfterRoom(context) } : context);
  };

  return {
    paint({ board, atMs, isReducedMotion }: BoardFrame) {
      const elements = [...board.elements.values()];
      const placed = elements.filter((element) => hasOwnPlace(element.content) && getWrapper(element.id));
      syncItems(placed);
      const area = getArea(boardElement);
      const fontSize = Number.parseFloat(getComputedStyle(boardElement).fontSize) || 16;
      const maxWidth = Math.max(0, area.width - 2 * area.padding);
      const contexts = placed.map((element): ItemContext => ({ element, atMs, progress: getMotionValue(element.entrance, atMs), maxWidth, fontSize, isReducedMotion }));
      const notedOnPhone = new Set(area.width < PHONE_BOARD_WIDTH ? elements.flatMap(({ content }) => (content.kind === 'note' ? [content.target as string] : [])) : []);
      const { placements, isMakingRoom } = placeMovingElements(prepareBoxes(contexts, notedOnPhone), area, getSharedProgress(contexts, isReducedMotion));
      const placementsById = new Map(placements.map((placement) => [placement.id, placement]));
      for (const context of contexts) paintItem(context, placementsById.get(context.element.id), isMakingRoom);
      marks.paint({ elements, focus: board.focus, placements: placementsById, getItem: (id) => items.get(id)?.item, atMs, isReducedMotion });
      lastPlacements = placementsById;
    },
    /** Where a part of an element sits on the board now, for a student to pick it. */
    getPartBox(id: string, query: TermQuery): MarkBox | null {
      const placement = lastPlacements.get(id);
      const box = placement?.isVisible ? items.get(id)?.item.getTermBoxes?.(query).to : null;
      if (!placement || !box) return null;
      return { x: placement.x + box.x * placement.scale, y: placement.y + box.y * placement.scale, width: box.width * placement.scale, height: box.height * placement.scale };
    },
  };
}
