import { type BoardElement, type BoardState, canPaintAt, createTierWatch, getMotionValue, landsDrawingsAtOnce, type QualityTier } from '@astra/board';
import { easeInOut, type LayoutArea, type MathFontProblem, type MovingBox, type MovingPlacement, placeMovingElements, writeStyle } from '@astra/board/drawing';
import { createBoardMarks, type MarkWithoutTarget } from './boardMarks';
import { type BoardItem, createBoardItem, hasOwnPlace, type ItemContext, type ItemSizes, type SliderHandlers } from './boardItems';

const PHONE_BOARD_WIDTH = 500;
const SPACING = { laptop: { padding: 24, gap: 20 }, phone: { padding: 16, gap: 16 } };
const ENTRANCE_SHARE_MAKING_ROOM = 1 / 3;
const SMALLEST_READABLE_PX = 9;

export interface BoardFrame {
  board: BoardState;
  atMs: number;
  isReducedMotion: boolean;
  canMoveSliders: boolean;
  /** Holds one tier, for a proof that compares frames. With none, the measured frame rate sets it. */
  fixedTier?: QualityTier;
}

/** The board drew what it could and something a tutor asked for is not as asked. Math the board refused goes to `onMathRefused`. */
export type BoardProblem = MarkWithoutTarget | ({ kind: 'fontFallback' } & MathFontProblem) | { kind: 'labelWithoutRoom'; text: string } | { kind: 'curveTooFine'; target: string } | { kind: 'sliderOverlaps'; sliderId: string; target: string } | { kind: 'sliderWithoutConstant'; sliderId: string; target: string; constant: string } | { kind: 'tooSmallToRead'; elementId: string } | { kind: 'imageMissing'; elementId: string };

export interface BoardPaintingOptions extends SliderHandlers {
  boardElement: HTMLElement;
  overlay: SVGSVGElement;
  getWrapper(id: string): HTMLElement | undefined;
  onMathRefused?(tex: string): void;
  onBoardProblem?(problem: BoardProblem): void;
  onQualityTier?(tier: QualityTier): void;
}

function getArea(boardElement: HTMLElement): LayoutArea {
  const width = boardElement.clientWidth;
  const { padding, gap } = width < PHONE_BOARD_WIDTH ? SPACING.phone : SPACING.laptop;
  return { width, height: boardElement.clientHeight, padding, gap };
}

function getMovingBox(context: ItemContext, sizes: ItemSizes & { size: NonNullable<ItemSizes['size']> }): MovingBox {
  const to = { id: context.element.id, fit: sizes.fit, ...sizes.size };
  const isArriving = context.progress < ENTRANCE_SHARE_MAKING_ROOM && context.element.morphFrom === null && !context.element.placedScene?.reshapingFrom;
  return { to, from: isArriving ? null : sizes.fromSize ? { ...to, ...sizes.fromSize } : to };
}

function getProgressAfterRoom({ element, progress }: ItemContext): number {
  return element.morphFrom === null ? Math.max(0, (progress - ENTRANCE_SHARE_MAKING_ROOM) / (1 - ENTRANCE_SHARE_MAKING_ROOM)) : progress;
}

function applyPlacement(wrapper: HTMLElement, placement: MovingPlacement, { itemOpacity, scale }: { itemOpacity: number; scale: number }): void {
  const opacity = Math.min(placement.opacity, itemOpacity);
  writeStyle(wrapper, 'transform', `translate(${Math.round(placement.x)}px, ${Math.round(placement.y)}px) scale(${scale.toFixed(4)})`);
  writeStyle(wrapper, 'visibility', placement.isVisible ? '' : 'hidden');
  writeStyle(wrapper, 'opacity', opacity < 1 ? String(Number(opacity.toFixed(3))) : '');
}

// A slider sits under what it changes, wherever it arrived in the lesson.
function getPlacingOrder(placed: readonly BoardElement[]): BoardElement[] {
  const sliders = placed.filter((element) => element.content.kind === 'slider');
  const getSlidersOn = (id: string) => sliders.filter(({ content }) => 'target' in content && content.target === id);
  const others = placed.filter((element) => element.content.kind !== 'slider');
  const homeless = sliders.filter(({ content }) => !others.some((element) => 'target' in content && element.id === content.target));
  return [...others.flatMap((element) => [element, ...getSlidersOn(element.id)]), ...homeless];
}

// Items close over their command, so new content under an id rebuilds the item, except math, whose painter follows the line it is given.
function canKeepItem(first: BoardElement['content'], second: BoardElement['content']): boolean {
  if (first === second) return true;
  if (first.kind !== second.kind) return false;
  return first.kind === 'writeMath' || JSON.stringify(first) === JSON.stringify(second);
}

// Paints one frame from the board's state and the clock alone, so a frozen board writes nothing and a replay lands on the same pixels.
export function createBoardPainting({ boardElement, overlay, getWrapper, onMathRefused, onBoardProblem, onQualityTier, onSliderMove, onSliderRelease }: BoardPaintingOptions) {
  const items = new Map<string, { content: BoardElement['content']; item: BoardItem }>();
  const marks = createBoardMarks(overlay, onBoardProblem);
  const reportedRefusals = new Set<string>();
  const reportedLabels = new Set<string>();
  const onLabelWithoutRoom = (text: string) => {
    if (reportedLabels.has(text)) return;
    reportedLabels.add(text);
    onBoardProblem?.({ kind: 'labelWithoutRoom', text });
  };
  const reportedFonts = new Set<string>();
  const reportedCurves = new Set<string>();
  const onCurveTooFine = ({ id, placedAtMs }: BoardElement) => {
    const placement = `${id}@${placedAtMs}`;
    if (reportedCurves.has(placement)) return;
    reportedCurves.add(placement);
    onBoardProblem?.({ kind: 'curveTooFine', target: id });
  };
  const reportedSliders = new Set<string>();
  const reportRefusedSliders = ({ refusedSliders }: BoardState) => {
    for (const slider of refusedSliders) {
      const { id, target } = slider;
      if (reportedSliders.has(id)) continue;
      reportedSliders.add(id);
      onBoardProblem?.('constant' in slider ? { kind: 'sliderWithoutConstant', sliderId: id, target, constant: slider.constant } : { kind: 'sliderOverlaps', sliderId: id, target });
    }
  };

  const reportedTooSmall = new Set<string>();
  const reportIfTooSmall = ({ element, fontSize, progress }: ItemContext, item: BoardItem, placement: MovingPlacement | undefined) => {
    if (!placement?.isVisible || item.ignoresPlacementScale || progress < 1 || reportedTooSmall.has(element.id)) return;
    if ((item.getTextPx?.() ?? fontSize) * placement.scale >= SMALLEST_READABLE_PX) return;
    reportedTooSmall.add(element.id);
    onBoardProblem?.({ kind: 'tooSmallToRead', elementId: element.id });
  };

  const syncItems = (placed: readonly BoardElement[]) => {
    const live = new Set(placed.map((element) => element.id as string));
    for (const [id, { item }] of items) {
      if (live.has(id)) continue;
      item.remove();
      items.delete(id);
    }
    for (const element of placed) {
      const wrapper = getWrapper(element.id);
      const known = items.get(element.id);
      if (!wrapper) continue;
      if (known && canKeepItem(known.content, element.content)) {
        known.content = element.content;
        continue;
      }
      known?.item.remove();
      items.set(element.id, { content: element.content, item: createBoardItem(element, wrapper, { onSliderMove, onSliderRelease, onImageMissing: (elementId) => onBoardProblem?.({ kind: 'imageMissing', elementId }) }) });
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

  const prepareBoxes = (contexts: readonly ItemContext[]): MovingBox[] =>
    contexts.flatMap((context) => {
      const entry = items.get(context.element.id);
      if (!entry) return [];
      const sizes = entry.item.prepare(context);
      reportRefused(entry.item);
      reportFonts(entry.item);
      return sizes.size ? [getMovingBox(context, { ...sizes, size: sizes.size })] : [];
    });

  const paintItem = (context: ItemContext, placement: MovingPlacement | undefined, isMakingRoom: boolean) => {
    const { id } = context.element;
    const entry = items.get(id);
    const wrapper = getWrapper(id);
    if (!entry || !wrapper) return;
    reportIfTooSmall(context, entry.item, placement);
    const entering = isMakingRoom && !context.isReducedMotion ? { ...context, progress: getProgressAfterRoom(context) } : context;
    if (placement) applyPlacement(wrapper, placement, { itemOpacity: entry.item.getEntranceOpacity?.(entering) ?? 1, scale: entry.item.ignoresPlacementScale ? 1 : placement.scale });
    else writeStyle(wrapper, 'visibility', 'hidden');
    entry.item.paint({ ...entering, placedSize: placement?.isVisible ? { width: placement.width, height: placement.height } : null });
  };

  const paintNow = ({ board, atMs, isReducedMotion, canMoveSliders }: BoardFrame) => {
      const elements = [...board.elements.values()];
      const placed = getPlacingOrder(elements.filter((element) => hasOwnPlace(element.content) && getWrapper(element.id)));
      syncItems(placed);
      reportRefusedSliders(board);
      const area = getArea(boardElement);
      const fontSize = Number.parseFloat(getComputedStyle(boardElement).fontSize) || 16;
      const maxWidth = Math.max(0, area.width - 2 * area.padding);
      const contexts = placed.map((element): ItemContext => ({ element, board, atMs, placedSize: null, canMoveSliders, onLabelWithoutRoom, onMarkWithoutPart: marks.reportMarkWithoutPart, onMarkDrawn: marks.noteMarkDrawn, onCurveTooFine, progress: getMotionValue(element.entrance, atMs), maxWidth, fontSize, isReducedMotion }));
      const { placements, isMakingRoom } = placeMovingElements(prepareBoxes(contexts), area, getSharedProgress(contexts, isReducedMotion));
      const placementsById = new Map(placements.map((placement) => [placement.id, placement]));
      for (const context of contexts) paintItem(context, placementsById.get(context.element.id), isMakingRoom);
      marks.paint({ elements, board: board.elements, focus: board.focus, placements: placementsById, getItem: (id) => items.get(id)?.item, atMs, isReducedMotion, area, onLabelWithoutRoom });
  };

  const tiers = createTierWatch(onQualityTier);
  let lastPaintMs = Number.NEGATIVE_INFINITY;
  let waitingFrame: { frame: BoardFrame; tier: QualityTier } | null = null;

  const paintWithTier = (frame: BoardFrame, tier: QualityTier) => {
    waitingFrame = null;
    lastPaintMs = performance.now();
    paintNow({ ...frame, isReducedMotion: frame.isReducedMotion || landsDrawingsAtOnce(tier) });
  };

  // A frame skipped to save work is still painted on the next animation frame, in case the board stops asking.
  const paintWhenDue = () => {
    if (waitingFrame) paintWithTier(waitingFrame.frame, waitingFrame.tier);
  };

  return {
    paint(frame: BoardFrame) {
      const tier = frame.fixedTier ?? tiers.noteFrame(performance.now());
      if (canPaintAt(tier, performance.now() - lastPaintMs)) {
        paintWithTier(frame, tier);
        return;
      }
      if (!waitingFrame) requestAnimationFrame(paintWhenDue);
      waitingFrame = { frame, tier };
    },
  };
}
