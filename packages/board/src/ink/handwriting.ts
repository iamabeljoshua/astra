import { type InkDrawing, type InkPosition, type InkStroke, getSpread, makeSeededRandom, makeStroke } from './ink-stroke.ts';
import { STROKE_FONT_GLYPHS, STROKE_FONT_METRICS } from './stroke-font-data.ts';

interface StrokeGlyph {
  advance: number;
  strokes: readonly (readonly number[])[];
}

/** A Map, so a character can never reach Object.prototype. */
const GLYPHS: ReadonlyMap<string, StrokeGlyph> = new Map(STROKE_FONT_GLYPHS.map(([character, advance, strokes]) => [character, { advance, strokes }]));

const LINE_HEIGHT_EMS = 1.25;
const BASELINE_EMS = 0.85;
const DESCENT_EMS = 0.3;
const WOBBLE = { baselineEms: 0.012, scale: 0.025, slopeRadians: 0.018 };
const WHITESPACE = /\s+/;

export function canWriteByHand(text: string): boolean {
  for (const character of text.replace(/\s/g, '')) if (!GLYPHS.has(character)) return false;
  return true;
}

export interface HandwritingRequest {
  text: string;
  fontSize: number;
  maxWidth: number;
  /** The same seed gives the same wobble, so a replay draws the same line. */
  seed: string;
}

const getAdvance = (character: string, fontSize: number) => ((GLYPHS.get(character)?.advance ?? 0) / STROKE_FONT_METRICS.unitsPerEm) * fontSize;
const getWidth = (text: string, fontSize: number) => [...text].reduce((sum, character) => sum + getAdvance(character, fontSize), 0);
const getSpaceWidth = (fontSize: number) => (STROKE_FONT_METRICS.spaceAdvance / STROKE_FONT_METRICS.unitsPerEm) * fontSize;

// A word wider than the board breaks by character, so a long string can never leave it.
function splitLongWord(word: string, { fontSize, maxWidth }: Pick<HandwritingRequest, 'fontSize' | 'maxWidth'>): string[] {
  const pieces: string[] = [];
  let piece = '';
  for (const character of word) {
    if (piece !== '' && getWidth(piece + character, fontSize) > maxWidth) {
      pieces.push(piece);
      piece = '';
    }
    piece += character;
  }
  return [...pieces, piece];
}

function getLines({ text, fontSize, maxWidth }: Pick<HandwritingRequest, 'text' | 'fontSize' | 'maxWidth'>): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(WHITESPACE).filter(Boolean).flatMap((whole) => splitLongWord(whole, { fontSize, maxWidth }))) {
    const candidate = line === '' ? word : `${line} ${word}`;
    if (line !== '' && getWidth(candidate.replaceAll(' ', ''), fontSize) + (candidate.split(' ').length - 1) * getSpaceWidth(fontSize) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  return line === '' ? lines : [...lines, line];
}

function writeGlyph(glyph: StrokeGlyph, { originX, baselineY, fontSize, random }: { originX: number; baselineY: number; fontSize: number; random: () => number }): InkStroke[] {
  const scale = (fontSize / STROKE_FONT_METRICS.unitsPerEm) * (1 + getSpread(random, WOBBLE.scale));
  const slope = getSpread(random, WOBBLE.slopeRadians);
  const shift = getSpread(random, WOBBLE.baselineEms) * fontSize;
  return glyph.strokes.map((flat) => {
    const points: InkPosition[] = [];
    for (let index = 0; index < flat.length; index += 2) {
      const fontX = (flat[index] as number) * scale;
      const fontY = (flat[index + 1] as number) * scale;
      points.push({ x: originX + fontX + fontY * slope, y: baselineY + shift - fontY + fontX * slope });
    }
    return makeStroke(points);
  });
}

/** Lays words out as pen strokes. Returns null for a character the stroke set lacks, and the caller shows the words as plain text. */
export function writeByHand({ text, fontSize, maxWidth, seed }: HandwritingRequest): InkDrawing | null {
  if (!canWriteByHand(text)) return null;
  const random = makeSeededRandom(seed);
  const strokes: InkStroke[] = [];
  const lines = getLines({ text, fontSize, maxWidth });
  let width = 0;
  lines.forEach((line, lineIndex) => {
    let originX = 0;
    const baselineY = (BASELINE_EMS + lineIndex * LINE_HEIGHT_EMS) * fontSize;
    for (const character of line) {
      const glyph = GLYPHS.get(character);
      if (glyph) strokes.push(...writeGlyph(glyph, { originX, baselineY, fontSize, random }));
      originX += character === ' ' ? getSpaceWidth(fontSize) : getAdvance(character, fontSize);
    }
    width = Math.max(width, originX);
  });
  const height = lines.length === 0 ? 0 : (BASELINE_EMS + (lines.length - 1) * LINE_HEIGHT_EMS + DESCENT_EMS) * fontSize;
  return { strokes: strokes.filter((stroke) => stroke.points.length > 0), width, height };
}
