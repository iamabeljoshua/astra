/** The drawable part of the board, in pixels. */
export interface LayoutArea {
  width: number;
  height: number;
  padding: number;
  gap: number;
}

/** What an element needs. A line keeps its size. A figure stretches into the height the lines leave. */
export interface LayoutBox {
  id: string;
  fit: 'line' | 'figure';
  width: number;
  height: number;
}

export interface Placement {
  id: string;
  x: number;
  y: number;
  /** Size on the board, after `scale`. */
  width: number;
  height: number;
  scale: number;
  /** False once newer elements have filled the board. An element is whole or gone, never cut. */
  isVisible: boolean;
}

const SMALLEST_FIGURE_SHARE = 0.4;
const LEAVING_SHARE = 0.5;

const getInnerWidth = (area: LayoutArea) => Math.max(0, area.width - 2 * area.padding);
const getInnerHeight = (area: LayoutArea) => Math.max(0, area.height - 2 * area.padding);

function getLineScale(box: LayoutBox, area: LayoutArea): number {
  const widthScale = box.width > 0 ? getInnerWidth(area) / box.width : 1;
  const heightScale = box.height > 0 ? getInnerHeight(area) / box.height : 1;
  return Math.min(1, widthScale, heightScale);
}

function getFullFigureHeight(box: LayoutBox, area: LayoutArea): number {
  return box.width > 0 ? (box.height / box.width) * getInnerWidth(area) : box.height;
}

function getSmallestHeight(box: LayoutBox, area: LayoutArea): number {
  if (box.fit === 'line') return box.height * getLineScale(box, area);
  return Math.min(getFullFigureHeight(box, area), getInnerHeight(area) * SMALLEST_FIGURE_SHARE);
}

function getFirstVisibleIndex(boxes: readonly LayoutBox[], area: LayoutArea): number {
  const newest = boxes.length - 1;
  let used = newest < 0 ? 0 : getSmallestHeight(boxes[newest] as LayoutBox, area);
  for (let index = newest - 1; index >= 0; index -= 1) {
    used += getSmallestHeight(boxes[index] as LayoutBox, area) + area.gap;
    if (used > getInnerHeight(area)) return index + 1;
  }
  return 0;
}

function getFigureHeights(visible: readonly LayoutBox[], area: LayoutArea): Map<string, number> {
  const figures = visible.filter((box) => box.fit === 'figure');
  const lines = visible.filter((box) => box.fit === 'line');
  const usedByLines = lines.reduce((sum, box) => sum + box.height * getLineScale(box, area), 0);
  const gaps = Math.max(0, visible.length - 1) * area.gap;
  const share = Math.max(0, getInnerHeight(area) - usedByLines - gaps) / Math.max(1, figures.length);
  return new Map(figures.map((box) => [box.id, Math.max(getSmallestHeight(box, area), Math.min(share, getFullFigureHeight(box, area)))]));
}

function makeHiddenPlacement(box: LayoutBox, area: LayoutArea): Placement {
  return { id: box.id, x: area.padding, y: area.padding, width: 0, height: 0, scale: 1, isVisible: false };
}

/** Places everything from the top of the board down, so a new element never moves the ones above it until the board is full. */
export function placeElements(boxes: readonly LayoutBox[], area: LayoutArea): Placement[] {
  const firstVisible = getFirstVisibleIndex(boxes, area);
  const figureHeights = getFigureHeights(boxes.slice(firstVisible), area);
  let y = area.padding;
  return boxes.map((box, index) => {
    if (index < firstVisible) return makeHiddenPlacement(box, area);
    const figureHeight = figureHeights.get(box.id);
    const scale = figureHeight === undefined ? getLineScale(box, area) : box.height > 0 ? figureHeight / box.height : 1;
    const placement = { id: box.id, x: area.padding, y, width: box.width * scale, height: box.height * scale, scale, isVisible: true };
    y += placement.height + area.gap;
    return placement;
  });
}

/** One element between two sizes, as its entrance runs. A null `from` means it was not there. */
export interface MovingBox {
  to: LayoutBox;
  from: LayoutBox | null;
}

export interface MovingPlacement extends Placement {
  /** Below 1 only for an element leaving because the board filled. */
  opacity: number;
}

const interpolate = (from: number, to: number, progress: number) => from + (to - from) * progress;

// When nothing stays, the new element is as if it had been below the last of the old ones.
function getUpwardShift({ before, after, gap }: { before: ReadonlyMap<string, Placement>; after: readonly Placement[]; gap: number }): number {
  const stays = after.find((placement) => placement.isVisible && before.get(placement.id)?.isVisible);
  if (stays) return stays.y - (before.get(stays.id) as Placement).y;
  const leavingBottoms = [...before.values()].filter((placement) => placement.isVisible).map((placement) => placement.y + placement.height + gap);
  const arriving = after.find((placement) => placement.isVisible);
  return arriving && leavingBottoms.length > 0 ? arriving.y - Math.max(...leavingBottoms) : 0;
}

// What leaves fades where it stands, and only then does the rest move up, so nothing slides under the board's top edge or across what is going.
function interpolatePlacement({ before, after, progress, shift }: { before: Placement | undefined; after: Placement; progress: number; shift: number }): MovingPlacement {
  const moved = shift === 0 ? progress : Math.max(0, (progress - LEAVING_SHARE) / (1 - LEAVING_SHARE));
  if (!before?.isVisible) return { ...after, y: after.y - shift * (1 - moved), opacity: after.isVisible ? 1 : 0 };
  if (!after.isVisible) return { ...before, isVisible: progress < LEAVING_SHARE, opacity: Math.max(0, 1 - progress / LEAVING_SHARE) };
  return { id: after.id, x: after.x, y: interpolate(before.y, after.y, moved), width: interpolate(before.width, after.width, moved), height: interpolate(before.height, after.height, moved), scale: interpolate(before.scale, after.scale, moved), isVisible: true, opacity: 1 };
}

// What arrives waits below what is still shrinking, so no two elements cross while the board makes room.
function keepArrivalsBelow(placements: readonly MovingPlacement[], { before, gap }: { before: ReadonlyMap<string, Placement>; gap: number }): MovingPlacement[] {
  let bottom = Number.NEGATIVE_INFINITY;
  return placements.map((placement) => {
    if (!placement.isVisible) return placement;
    const y = before.get(placement.id)?.isVisible ? placement.y : Math.max(placement.y, bottom + gap);
    bottom = y + placement.height;
    return { ...placement, y };
  });
}

/** Pure in the sizes and the progress, so a frozen or replayed board lands in the same place. */
export function placeMovingElements(boxes: readonly MovingBox[], area: LayoutArea, progress: number): { placements: MovingPlacement[]; isMakingRoom: boolean } {
  const after = placeElements(boxes.map((box) => box.to), area);
  const before = new Map(placeElements(boxes.flatMap((box) => (box.from ? [box.from] : [])), area).map((placement) => [placement.id, placement]));
  const shift = getUpwardShift({ before, after, gap: area.gap });
  const moving = after.map((placement) => interpolatePlacement({ before: before.get(placement.id), after: placement, progress, shift }));
  const isAnyResizing = after.some((placement) => before.get(placement.id)?.isVisible && (before.get(placement.id) as Placement).height !== placement.height);
  return { placements: keepArrivalsBelow(moving, { before, gap: area.gap }), isMakingRoom: shift !== 0 || isAnyResizing };
}
