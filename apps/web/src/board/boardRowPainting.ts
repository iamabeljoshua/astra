import { type BoardElement, type BoardState, getMotionValue } from '@astra/board';
import { type MarkBox, type MovingPlacement, type TermQuery, writeStyle } from '@astra/board/drawing';
import { createBoardMarks } from './boardMarks';
import { type BoardItem, createBoardItem, hasOwnPlace, type ItemContext } from './boardItems';
import { type BoardProblem, canKeepItem, createProblemReports } from './boardPainting';
import { isInGutter } from './boardRows';

const LARGEST_FIGURE = { width: 620, height: 420 };
/** Room for a mark's label under the last row. A fixed amount, so a replay with no live line places it the same. */
const LABEL_ROOM_BELOW_ROWS = 120;

interface RowPaintingOptions {
  overlay: SVGSVGElement;
  roomForNotes: HTMLElement;
  getWrapper(id: string): HTMLElement | undefined;
  onBoardProblem?(problem: BoardProblem): void;
}

// Scales a figure to fit its column, and gives an absolute math tree the size the painter measured.
function sizeWrapper({ wrapper, element, item, size, fit, columnWidth }: { wrapper: HTMLElement; element: BoardElement; item: BoardItem; size: { width: number; height: number }; fit: string; columnWidth: number }): number {
  const content = wrapper.parentElement as HTMLElement;
  if (fit === 'figure') {
    // A row with no width yet has a size of 0, and 0 over 0 would paint broken numbers.
    const scale = size.width === 0 ? 1 : Math.min(1, Math.min(columnWidth, LARGEST_FIGURE.width) / size.width, LARGEST_FIGURE.height / size.height);
    if (!item.ignoresPlacementScale) writeStyle(wrapper, 'transform', `scale(${scale.toFixed(4)})`);
    content.style.height = `${Math.ceil(size.height * scale)}px`;
    return scale;
  }
  if (element.math) {
    wrapper.style.width = `${size.width}px`;
    wrapper.style.height = `${size.height}px`;
  }
  return 1;
}

const getRow = (wrapper: HTMLElement | undefined) => wrapper?.closest('.board-row') ?? null;

function getGutterWords(row: Element | null, flow: DOMRect) {
  return [...(row?.querySelector('.board-row-gutter')?.children ?? [])].map((word) => {
    const { left, top, right, bottom } = word.getBoundingClientRect();
    return { left: left - flow.left, top: top - flow.top, right: right - flow.left, bottom: bottom - flow.top };
  });
}

export function getMarksArea(overlay: SVGSVGElement, placements: ReadonlyMap<string, MovingPlacement>, rows: readonly (Element | null)[]) {
  const flow = overlay.getBoundingClientRect();
  const scroller = overlay.closest('.board-scroll');
  const board = scroller?.getBoundingClientRect() ?? flow;
  // Marks scroll with their rows, so a row scrolled out of sight still has its whole ring.
  const scrolledBy = scroller?.scrollTop ?? 0;
  return { left: board.left - flow.left, top: board.top - flow.top - scrolledBy, width: board.right - flow.left, height: Math.max(0, ...[...placements.values()].map(({ y, height }) => y + height)) + LABEL_ROOM_BELOW_ROWS, alsoTaken: rows.flatMap((row) => getGutterWords(row, flow)) };
}

// Paints one frame of the shared board's rows from its state and the clock alone.
export function createBoardRowPainting({ overlay, roomForNotes, getWrapper, onBoardProblem }: RowPaintingOptions) {
  const items = new Map<string, { content: BoardElement['content']; item: BoardItem }>();
  const marks = createBoardMarks(overlay, onBoardProblem);
  const reports = createProblemReports(onBoardProblem);
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
      const known = items.get(element.id);
      if (!wrapper) continue;
      if (known && canKeepItem(known.content, element.content)) {
        known.content = element.content;
        continue;
      }
      known?.item.remove();
      items.set(element.id, { content: element.content, item: createBoardItem(element, wrapper, { onImageMissing: reports.onImageMissing }) });
    }
  };

  const paintRow = (element: BoardElement, { board, atMs, isReducedMotion }: { board: BoardState; atMs: number; isReducedMotion: boolean }): MovingPlacement | null => {
    const entry = items.get(element.id);
    const wrapper = getWrapper(element.id);
    if (!entry || !wrapper) return null;
    const columnWidth = (wrapper.parentElement as HTMLElement).clientWidth;
    const fontSize = Number.parseFloat(getComputedStyle(wrapper).fontSize) || 30;
    const context: ItemContext = { element, board, atMs, placedSize: null, canMoveSliders: false, onLabelWithoutRoom: reports.onLabelWithoutRoom, onMarkWithoutPart: marks.reportMarkWithoutPart, onMarkDrawn: marks.noteMarkDrawn, onCurveTooFine: reports.onCurveTooFine, progress: getMotionValue(element.entrance, atMs), maxWidth: columnWidth, fontSize, isReducedMotion };
    const sizes = entry.item.prepare(context);
    const scale = sizes.size ? sizeWrapper({ wrapper, element, item: entry.item, size: sizes.size, fit: sizes.fit, columnWidth }) : 1;
    reports.reportIfTooSmall(context, entry.item, scale);
    entry.item.paint({ ...context, placedSize: sizes.size && { width: sizes.size.width * scale, height: sizes.size.height * scale } });
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
      reports.reportRefusedSliders(board);
      const placements = new Map(placed.flatMap((element) => {
        const placement = paintRow(element, { board, atMs, isReducedMotion });
        return placement ? [[element.id as string, placement] as const] : [];
      }));
      lastPlacements = placements;
      const rows = placed.map((element) => getRow(getWrapper(element.id)));
      marks.paint({ elements: elements.filter((element) => !isInGutter(element)), board: board.elements, focus: board.focus, placements, getItem: (id) => items.get(id)?.item, atMs, isReducedMotion, area: getMarksArea(overlay, placements, rows), onLabelWithoutRoom: reports.onLabelWithoutRoom });
      const flowTop = overlay.getBoundingClientRect().top;
      const lastRowBottom = Math.max(0, ...rows.map((row) => (row?.getBoundingClientRect().bottom ?? flowTop) - flowTop));
      const room = Math.max(0, Math.ceil(marks.getNotesBottom() - lastRowBottom));
      writeStyle(roomForNotes, 'display', room > 0 ? '' : 'none');
      writeStyle(roomForNotes, 'height', `${room}px`);
    },
    getPartBox(id: string, query: TermQuery): MarkBox | null {
      const placement = lastPlacements.get(id);
      const box = placement ? items.get(id)?.item.getTermBoxes?.(query).to : null;
      if (!placement || !box) return null;
      return { x: placement.x + box.x * placement.scale, y: placement.y + box.y * placement.scale, width: box.width * placement.scale, height: box.height * placement.scale };
    },
  };
}
