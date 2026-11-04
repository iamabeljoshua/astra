export interface PaintBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One thing KaTeX painted: a glyph, or a shape such as a fraction bar. */
export interface PaintInfo {
  /** The term it belongs to, when the source could be mapped. */
  termId: string | null;
  /** The characters, or null for a shape. */
  glyph: string | null;
  box: PaintBox;
  fontSize: number;
}

export interface Flight {
  fromIndex: number;
  toIndex: number;
  /** Crosses other terms on its way, so it lifts clear of them rather than passing through. */
  isCrossing: boolean;
}

export interface PaintPlan {
  flights: Flight[];
  leaving: number[];
  arriving: number[];
}

const groupByTerm = (paints: readonly PaintInfo[]) => {
  const groups = new Map<string, number[]>();
  paints.forEach((paint, index) => {
    if (paint.termId !== null) groups.set(paint.termId, [...(groups.get(paint.termId) ?? []), index]);
  });
  return groups;
};

function pairKeptTerms(from: readonly PaintInfo[], to: readonly PaintInfo[], movedTermIds: ReadonlySet<string>): Flight[] {
  const fromTerms = groupByTerm(from);
  return [...groupByTerm(to)].flatMap(([termId, toIndexes]) => {
    const fromIndexes = fromTerms.get(termId);
    if (fromIndexes?.length !== toIndexes.length) return [];
    return toIndexes.map((toIndex, position) => ({ fromIndex: fromIndexes[position] as number, toIndex, isCrossing: movedTermIds.has(termId) }));
  });
}

// A glyph whose term changed still travels, so the 2 in "2x = 8" becomes the 2 under the 8 in "x = 8/2".
function pairLooseGlyphs(from: readonly PaintInfo[], to: readonly PaintInfo[], kept: readonly Flight[]): Flight[] {
  const takenFrom = new Set(kept.map((flight) => flight.fromIndex));
  const takenTo = new Set(kept.map((flight) => flight.toIndex));
  const flights: Flight[] = [];
  to.forEach((paint, toIndex) => {
    if (takenTo.has(toIndex) || paint.glyph === null) return;
    const fromIndex = from.findIndex((candidate, index) => candidate.glyph === paint.glyph && !takenFrom.has(index));
    if (fromIndex === -1) return;
    takenFrom.add(fromIndex);
    flights.push({ fromIndex, toIndex, isCrossing: true });
  });
  return flights;
}

/** Decides what travels, what fades out, and what fades in when an equation rearranges. */
export function planPaints({ from, to, movedTermIds }: { from: readonly PaintInfo[]; to: readonly PaintInfo[]; movedTermIds: ReadonlySet<string> }): PaintPlan {
  const kept = pairKeptTerms(from, to, movedTermIds);
  const flights = [...kept, ...pairLooseGlyphs(from, to, kept)];
  const flownFrom = new Set(flights.map((flight) => flight.fromIndex));
  const flownTo = new Set(flights.map((flight) => flight.toIndex));
  return {
    flights,
    leaving: from.flatMap((_, index) => (flownFrom.has(index) ? [] : [index])),
    arriving: to.flatMap((_, index) => (flownTo.has(index) ? [] : [index])),
  };
}

const LIFT = { shareOfTravel: 0.4, mostEms: 0.8 };

interface FlightEnds {
  from: PaintInfo;
  to: PaintInfo;
  isCrossing: boolean;
}

function getFlightPosition({ from, to, isCrossing }: FlightEnds, progress: number): { x: number; y: number } {
  const travelX = to.box.x - from.box.x;
  const travelY = to.box.y - from.box.y;
  const lift = isCrossing ? Math.min(Math.hypot(travelX, travelY) * LIFT.shareOfTravel, from.fontSize * LIFT.mostEms) * Math.sin(Math.PI * progress) : 0;
  return { x: travelX * progress, y: travelY * progress + (travelY > 0 ? lift : -lift) };
}

const toPixels = (value: number) => (Math.abs(value) < 0.005 ? '0.00' : value.toFixed(2));

/** Where a flying paint is, from 0 at its old place to 1 at its new one. It depends on nothing but `progress`, so a frozen frame stays exactly there. */
export function getFlightTransform(ends: FlightEnds, progress: number): string {
  const { x, y } = getFlightPosition(ends, progress);
  const scale = 1 + (ends.to.fontSize / ends.from.fontSize - 1) * progress;
  return `translate(${toPixels(x)}px, ${toPixels(y)}px) scale(${scale.toFixed(4)})`;
}

/** How far a flying paint still is from where it will land. */
export function getFlightOffset(ends: FlightEnds, progress: number): { x: number; y: number } {
  const { x, y } = getFlightPosition(ends, progress);
  return { x: ends.from.box.x + x - ends.to.box.x, y: ends.from.box.y + y - ends.to.box.y };
}

export const easeInOut = (progress: number) => progress * progress * (3 - 2 * progress);

export function getBoxUnion(boxes: readonly PaintBox[]): PaintBox | null {
  if (boxes.length === 0) return null;
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}
