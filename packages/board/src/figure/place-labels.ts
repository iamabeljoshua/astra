import { type Box, doBoxesOverlap, type FigureMark, isBoxInside, type MarkTone, type Point, type TextAnchor } from './figure-marks.ts';

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

function findPlace(shape: Shape, request: LabelRequest, room: LabelRoom, taken: readonly Box[]): { box: Box; side: LabelSide } | null {
  const steps = request.isFixed ? [1] : GAP_STEPS;
  const mustAvoid = [...room.mustAvoid, ...taken];
  for (const others of request.isFixed ? [mustAvoid] : [[...mustAvoid, ...room.shouldAvoid], mustAvoid]) {
    for (const step of steps) {
      for (const side of request.sides) {
        const box = getBoxAtSide(shape, request.anchor, side, request.gap * step);
        if (isBoxInside(box, room.bounds) && isClear(growBox(box, BOX_PADDING + shape.room), others)) return { box, side };
      }
    }
  }
  return null;
}

// The free spot nearest the point the label names, so one with no room beside its mark still reads as belonging to it.
function findAnyPlace({ width, height, room: extraRoom }: Shape, { anchor, room, taken }: { anchor: Point; room: LabelRoom; taken: readonly Box[] }): Box | null {
  const others = [...room.mustAvoid, ...taken];
  let nearest: { box: Box; distance: number } | null = null;
  for (let top = room.bounds.top; top + height <= room.bounds.bottom; top += LABEL_FONT.lineHeight) {
    for (let left = room.bounds.right - width; left >= room.bounds.left; left -= FALLBACK_STEP) {
      const box = { left, top, right: left + width, bottom: top + height };
      const distance = Math.hypot(left + width / 2 - anchor.x, top + height / 2 - anchor.y);
      if ((!nearest || distance < nearest.distance) && isClear(growBox(box, BOX_PADDING + extraRoom), others)) nearest = { box, distance };
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
    const shape = getTextShape(request.text, maxWidth);
    const found = findPlace(shape, request, room, taken);
    const box = found?.box ?? (request.isOptional ? null : findAnyPlace(shape, { anchor: request.anchor, room, taken }));
    if (!box) {
      if (!request.isOptional) room.onNoRoom?.(request.text);
      return [];
    }
    taken.push(growBox(box, shape.room));
    return [getTextMark(request, shape, box, found?.side ?? null)];
  });
}
