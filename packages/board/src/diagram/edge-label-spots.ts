import type { InkPosition } from '../ink/ink-stroke.ts';

export interface Axes {
  across: 'x' | 'y';
  along: 'y' | 'x';
  acrossSize: 'width' | 'height';
  alongSize: 'height' | 'width';
}

interface Size {
  width: number;
  height: number;
}

export interface LabelRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface LabelGap {
  start: number;
  size: number;
  lanes: number;
  laneSize: number;
}

export interface LabelSearch {
  size: Size;
  ownLine: readonly InkPosition[];
  allLines: readonly (readonly InkPosition[])[];
  taken: readonly LabelRect[];
  gap: LabelGap;
  axes: Axes;
}

const SEARCH_STEP = 6;
const MOST_STEPS = 500;
const LINE_ROOM = 5;
const LABEL_ROOM = 4;
const SIDES = [1, -1];

const inflate = ({ left, top, right, bottom }: LabelRect, by: number): LabelRect => ({ left: left - by, top: top - by, right: right + by, bottom: bottom + by });

const doRectsOverlap = (first: LabelRect, second: LabelRect) => first.left < second.right && second.left < first.right && first.top < second.bottom && second.top < first.bottom;

function doesSegmentEnter(from: InkPosition, to: InkPosition, { left, top, right, bottom }: LabelRect): boolean {
  const moves = [[from.x - to.x, from.x - left], [to.x - from.x, right - from.x], [from.y - to.y, from.y - top], [to.y - from.y, bottom - from.y]] as const;
  let enter = 0;
  let leave = 1;
  for (const [speed, room] of moves) {
    if (speed === 0 && room < 0) return false;
    if (speed < 0) enter = Math.max(enter, room / speed);
    if (speed > 0) leave = Math.min(leave, room / speed);
  }
  return enter <= leave;
}

const doesLineEnter = (line: readonly InkPosition[], rect: LabelRect) => line.slice(1).some((point, index) => doesSegmentEnter(line[index] as InkPosition, point, rect));

function getCrossing(line: readonly InkPosition[], along: number, { across, along: alongKey }: Axes): number {
  for (let index = 1; index < line.length; index += 1) {
    const from = line[index - 1] as InkPosition;
    const to = line[index] as InkPosition;
    const span = to[alongKey] - from[alongKey];
    const share = span === 0 ? -1 : (along - from[alongKey]) / span;
    if (share >= 0 && share <= 1) return from[across] + (to[across] - from[across]) * share;
  }
  return (line[Math.floor(line.length / 2)] as InkPosition)[across];
}

function getRect(spot: { across: number; along: number }, { size, axes }: Pick<LabelSearch, 'size' | 'axes'>): LabelRect {
  const x = axes.across === 'x' ? spot.across : spot.along;
  const y = axes.across === 'x' ? spot.along : spot.across;
  return { left: x, top: y, right: x + size.width, bottom: y + size.height };
}

const isClear = (rect: LabelRect, { allLines, taken }: Pick<LabelSearch, 'allLines' | 'taken'>) => !taken.some((other) => doRectsOverlap(inflate(rect, LABEL_ROOM), other)) && !allLines.some((line) => doesLineEnter(line, inflate(rect, LINE_ROOM)));

function getLaneSpot(lane: number, { size, gap, axes }: Pick<LabelSearch, 'size' | 'gap' | 'axes'>): number {
  return gap.start + (gap.size - gap.lanes * gap.laneSize) / 2 + lane * gap.laneSize + (gap.laneSize - size[axes.alongSize]) / 2;
}

export function findLabelSpot(search: LabelSearch): LabelRect {
  const { size, ownLine, gap, axes } = search;
  for (let step = 0; step < MOST_STEPS; step += 1) {
    for (let lane = 0; lane < Math.max(1, gap.lanes); lane += 1) {
      const along = getLaneSpot(lane, search);
      const crossing = getCrossing(ownLine, along + size[axes.alongSize] / 2, axes);
      for (const side of SIDES) {
        const across = side > 0 ? crossing + LINE_ROOM + step * SEARCH_STEP : crossing - LINE_ROOM - size[axes.acrossSize] - step * SEARCH_STEP;
        const rect = getRect({ across, along }, search);
        if (isClear(rect, search)) return rect;
      }
    }
  }
  return getRect({ across: getCrossing(ownLine, gap.start, axes), along: getLaneSpot(0, search) }, search);
}
