import { type Box, doBoxesOverlap, type FigureMark, isBoxInside, type MarkTone, type Point, type TextAnchor } from './figure-marks.ts';

export const LABEL_FONT = { size: 12, lineHeight: 15, ascent: 11 };

const CHARACTER_WIDTHS = [
  { characters: /[ijlIrtf.,:;'!|()[\]\s]/, ems: 0.34 },
  { characters: /[mwMW@%]/, ems: 0.96 },
  { characters: /[A-Z]/, ems: 0.7 },
  { characters: /[\u0000-ɏ−°]/, ems: 0.6 },
] as const;
const OTHER_CHARACTER_EMS = 1.05;
const BOX_PADDING = 1.5;
const GAP_STEPS = [1, 2, 3.5, 5.5];
const FALLBACK_STEP = 24;
const MOST_LINES = 4;

/** Slightly wider than the font on purpose, so a label that fits here fits on the page, with no read from the page. */
export function estimateTextWidth(text: string): number {
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
  /** A tick number can go when the room is taken. A name the tutor gave cannot. */
  isOptional?: boolean;
  /** Keeps its anchor's place and never moves off it, for a tick. */
  isFixed?: boolean;
}

export interface LabelRoom {
  bounds: Box;
  /** Other marks it must never cover. */
  solid: readonly Box[];
  /** Lines it should stay off when it can. It has a halo for when it cannot. */
  soft: readonly Box[];
}

interface Shape {
  lines: string[];
  width: number;
  height: number;
}

function getTextShape(text: string, maxWidth: number): Shape {
  const lines = wrapLabel(text, maxWidth);
  return { lines, width: Math.max(...lines.map(estimateTextWidth)), height: lines.length * LABEL_FONT.lineHeight };
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

const growBox = (box: Box): Box => ({ left: box.left - BOX_PADDING, top: box.top - BOX_PADDING, right: box.right + BOX_PADDING, bottom: box.bottom + BOX_PADDING });

function isClear(box: Box, others: readonly Box[]): boolean {
  return !others.some((other) => doBoxesOverlap(box, other));
}

function findPlace(shape: Shape, request: LabelRequest, room: LabelRoom, taken: readonly Box[]): { box: Box; side: LabelSide } | null {
  const steps = request.isFixed ? [1] : GAP_STEPS;
  const solid = [...room.solid, ...taken];
  for (const others of request.isFixed ? [solid] : [[...solid, ...room.soft], solid]) {
    for (const step of steps) {
      for (const side of request.sides) {
        const box = getBoxAtSide(shape, request.anchor, side, request.gap * step);
        if (isBoxInside(box, room.bounds) && isClear(growBox(box), others)) return { box, side };
      }
    }
  }
  return null;
}

// Nothing near its anchor is free, so it takes the first free spot on the figure rather than cover anything.
function findAnyPlace({ width, height }: Shape, room: LabelRoom, taken: readonly Box[]): Box | null {
  const others = [...room.solid, ...taken];
  for (let top = room.bounds.top; top + height <= room.bounds.bottom; top += LABEL_FONT.lineHeight) {
    for (let left = room.bounds.right - width; left >= room.bounds.left; left -= FALLBACK_STEP) {
      const box = { left, top, right: left + width, bottom: top + height };
      if (isClear(growBox(box), others)) return box;
    }
  }
  return null;
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
    const box = found?.box ?? (request.isOptional ? null : findAnyPlace(shape, room, taken));
    if (!box) return [];
    taken.push(box);
    return [getTextMark(request, shape, box, found?.side ?? null)];
  });
}
