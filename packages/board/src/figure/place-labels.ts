import { type Box, type Branch, doBoxesOverlap, type FigureMark, isBoxInside, type MarkTone, type Point, type TextAnchor } from './figure-marks.ts';

export const LABEL_FONT = { size: 12, lineHeight: 15, ascent: 11 };

const CHARACTER_WIDTHS = [
  { characters: /[ijlIrtf.,:;'!|()[\]\s]/, ems: 0.34 },
  { characters: /[mwMW@%]/, ems: 0.96 },
  { characters: /[A-Z]/, ems: 0.7 },
  { characters: /[!-\u024F\u2212\u00B0]/, ems: 0.6 },
  { characters: /[\uFDF0-\uFDFF]/, ems: 8 },
  { characters: /\p{Script=Cuneiform}/u, ems: 5 },
  { characters: /[\uFB50-\uFDEF\u0600-\u0605\u2E3A\u2E3B]/, ems: 3 },
  { characters: /\p{Extended_Pictographic}/u, ems: 1.4 },
] as const;
const OTHER_CHARACTER_EMS = 1.05;
const NOT_THE_KNOWN_LETTERS = /[^\s!-\u024F\u2212\u00B0]/;
const MEASURED_ROOM = 1.05;
/** A font a device falls back to can stand far taller than ours, and only its width gets measured. */
const FALLBACK_FONT_ROOM = 8;
const MOST_MEASURES_KEPT = 4000;

let measureOnPage: ((text: string) => number) | null = null;
const measuredWidths = new Map<string, number>();

/** A glyph outside the known letters runs from a hair to more than 6 em, depending on the font each device falls back to, so a browser measures it, while the known letters stay an estimate that is the same on every device. */
export function setLabelMeasure(measure: ((text: string) => number) | null): void {
  measureOnPage = measure;
  measuredWidths.clear();
}

function getMeasuredWidth(measure: (text: string) => number, text: string): number {
  const known = measuredWidths.get(text);
  if (known !== undefined) return known;
  if (measuredWidths.size >= MOST_MEASURES_KEPT) measuredWidths.clear();
  const width = measure(text) * MEASURED_ROOM;
  measuredWidths.set(text, width);
  return width;
}
const BOX_PADDING = 1.5;
const GAP_STEPS = [1, 2, 3.5, 5.5];
const FALLBACK_STEP = 24;
const MOST_LINES = 4;
const NARROWER_SHARES = [0.6, 0.4, 0.25];

/** Slightly wider than the font on purpose, so a label that fits here fits on the page. */
export function estimateTextWidth(text: string): number {
  if (measureOnPage && NOT_THE_KNOWN_LETTERS.test(text)) return getMeasuredWidth(measureOnPage, text);
  let ems = 0;
  for (const character of text) ems += CHARACTER_WIDTHS.find(({ characters }) => characters.test(character))?.ems ?? OTHER_CHARACTER_EMS;
  return ems * LABEL_FONT.size;
}

function breakWord(word: string, maxWidth: number): string[] {
  const pieces: string[] = [];
  let piece = '';
  for (const character of word) {
    if (piece !== '' && estimateTextWidth(piece + character) > maxWidth) {
      pieces.push(piece);
      piece = '';
    }
    piece += character;
  }
  return [...pieces, piece];
}

export function wrapLabel(text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).flatMap((whole) => breakWord(whole, maxWidth))) {
    const candidate = line === '' ? word : `${line} ${word}`;
    if (estimateTextWidth(candidate) <= maxWidth) {
      line = candidate;
      continue;
    }
    lines.push(line);
    line = word;
  }
  return [...lines, line].slice(0, MOST_LINES);
}

export type LabelSide = 'right' | 'left' | 'above' | 'below' | 'above-right' | 'above-left' | 'below-right' | 'below-left';

export const ALL_SIDES: readonly LabelSide[] = ['above-right', 'right', 'below-right', 'above', 'below', 'above-left', 'left', 'below-left'];

export interface LabelRequest {
  key: string;
  text: string;
  anchor: Point;
  gap: number;
  sides: readonly LabelSide[];
  tone: MarkTone;
  isOptional?: boolean;
  isFixed?: boolean;
}

export interface LabelRoom {
  bounds: Box;
  mustAvoid: readonly Box[];
  shouldAvoid: readonly Box[];
  /** Lines a label may not touch. A tick number sits on its axis and is the only text that skips this. */
  linesToClear?: readonly Branch[];
  onNoRoom?(text: string): void;
}

interface Shape {
  lines: string[];
  width: number;
  height: number;
  room: number;
}

function getTextShape(text: string, maxWidth: number): Shape {
  const lines = wrapLabel(text, maxWidth);
  return { lines, width: Math.max(...lines.map(estimateTextWidth)), height: lines.length * LABEL_FONT.lineHeight, room: NOT_THE_KNOWN_LETTERS.test(text) ? FALLBACK_FONT_ROOM : 0 };
}

const withoutSpaces = (text: string) => text.replace(/\s+/g, '');

// A label too long for the free room can stack its words, as long as every word still fits.
function getShapesToTry(request: LabelRequest, maxWidth: number): Shape[] {
  const whole = getTextShape(request.text, maxWidth);
  if (request.isOptional || request.isFixed) return [whole];
  const narrower = NARROWER_SHARES.map((share) => getTextShape(request.text, maxWidth * share)).filter(({ lines }) => withoutSpaces(lines.join('')) === withoutSpaces(request.text));
  return [whole, ...narrower];
}

function getBoxAtSide({ width, height }: Shape, anchor: Point, side: LabelSide, gap: number): Box {
  const isLeft = side === 'left' || side.endsWith('-left');
  const isRight = side === 'right' || side.endsWith('-right');
  const isAbove = side.startsWith('above');
  const isBelow = side.startsWith('below');
  const left = isRight ? anchor.x + gap : isLeft ? anchor.x - gap - width : anchor.x - width / 2;
  const top = isAbove ? anchor.y - gap - height : isBelow ? anchor.y + gap : anchor.y - height / 2;
  return { left, top, right: left + width, bottom: top + height };
}

const growBox = (box: Box, by = BOX_PADDING): Box => ({ left: box.left - by, top: box.top - by, right: box.right + by, bottom: box.bottom + by });

function isClear(box: Box, others: readonly Box[]): boolean {
  return !others.some((other) => doBoxesOverlap(box, other));
}

const LINE_CELL = 3;
const CELL_ROW = 65536;
const cellsByLine = new WeakMap<Branch, ReadonlySet<number>>();

// A resting curve keeps its array, so its cells cost nothing after the first frame.
function getLineCells(line: Branch): ReadonlySet<number> {
  const known = cellsByLine.get(line);
  if (known) return known;
  const cells = new Set<number>();
  line.forEach((point, index) => {
    const next = line[index + 1] ?? point;
    const steps = Math.max(1, Math.ceil(Math.hypot(next.x - point.x, next.y - point.y) / LINE_CELL));
    for (let step = 0; step <= steps; step += 1) cells.add(Math.floor((point.x + ((next.x - point.x) * step) / steps) / LINE_CELL) * CELL_ROW + Math.floor((point.y + ((next.y - point.y) * step) / steps) / LINE_CELL));
  });
  cellsByLine.set(line, cells);
  return cells;
}

function touchesLine(box: Box, lines: readonly Branch[]): boolean {
  const cells = lines.map(getLineCells);
  for (let x = Math.floor(box.left / LINE_CELL); x <= Math.floor(box.right / LINE_CELL); x += 1) {
    for (let y = Math.floor(box.top / LINE_CELL); y <= Math.floor(box.bottom / LINE_CELL); y += 1) {
      if (cells.some((cell) => cell.has(x * CELL_ROW + y))) return true;
    }
  }
  return false;
}

function findPlace(shape: Shape, request: LabelRequest, room: LabelRoom, taken: readonly Box[]): { box: Box; side: LabelSide } | null {
  const steps = request.isFixed ? [1] : GAP_STEPS;
  const mustAvoid = [...room.mustAvoid, ...taken];
  const lines = request.isOptional ? [] : (room.linesToClear ?? []);
  for (const others of request.isFixed ? [mustAvoid] : [[...mustAvoid, ...room.shouldAvoid], mustAvoid]) {
    for (const step of steps) {
      for (const side of request.sides) {
        const box = getBoxAtSide(shape, request.anchor, side, request.gap * step);
        const grown = growBox(box, BOX_PADDING + shape.room);
        if (isBoxInside(box, room.bounds) && isClear(grown, others) && !touchesLine(grown, lines)) return { box, side };
      }
    }
  }
  return null;
}

// The free spot nearest the point the label names, so one with no room beside its mark still reads as belonging to it.
function findAnyPlace({ width, height, room: extraRoom }: Shape, { anchor, room, taken }: { anchor: Point; room: LabelRoom; taken: readonly Box[] }): Box | null {
  const others = [...room.mustAvoid, ...taken];
  const lines = room.linesToClear ?? [];
  let nearest: { box: Box; distance: number } | null = null;
  for (let top = room.bounds.top; top + height <= room.bounds.bottom; top += LABEL_FONT.lineHeight) {
    for (let left = room.bounds.right - width; left >= room.bounds.left; left -= FALLBACK_STEP) {
      const box = { left, top, right: left + width, bottom: top + height };
      const distance = Math.hypot(left + width / 2 - anchor.x, top + height / 2 - anchor.y);
      const grown = growBox(box, BOX_PADDING + extraRoom);
      if ((!nearest || distance < nearest.distance) && isClear(grown, others) && !touchesLine(grown, lines)) nearest = { box, distance };
    }
  }
  return nearest?.box ?? null;
}

function getAnchor(side: LabelSide | null): TextAnchor {
  return side === 'above' || side === 'below' ? 'middle' : 'start';
}

function getTextMark(request: LabelRequest, shape: Shape, box: Box, side: LabelSide | null): FigureMark {
  const anchor = getAnchor(side);
  return { kind: 'text', key: request.key, at: { x: anchor === 'middle' ? (box.left + box.right) / 2 : box.left, y: box.top + LABEL_FONT.ascent }, lines: shape.lines, anchor, tone: request.tone };
}

/** Sets labels in order, each clear of everything before it, so text on a figure can never sit on other text. */
export function placeLabels(requests: readonly LabelRequest[], room: LabelRoom): FigureMark[] {
  const taken: Box[] = [];
  const maxWidth = room.bounds.right - room.bounds.left;
  return requests.flatMap((request) => {
    const shapes = getShapesToTry(request, maxWidth);
    const beside = shapes.flatMap((shape) => {
      const found = findPlace(shape, request, room, taken);
      return found ? [{ shape, ...found }] : [];
    })[0];
    const anywhere = beside || request.isOptional ? null : shapes.flatMap((shape) => {
      const box = findAnyPlace(shape, { anchor: request.anchor, room, taken });
      return box ? [{ shape, box, side: null }] : [];
    })[0];
    const placed = beside ?? anywhere;
    if (!placed) {
      if (!request.isOptional) room.onNoRoom?.(request.text);
      return [];
    }
    taken.push(growBox(placed.box, placed.shape.room));
    return [getTextMark(request, placed.shape, placed.box, placed.side)];
  });
}
