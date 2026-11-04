import { getCanvasContext } from './canvasContext';
import type { DotPoint } from './dotPoint';

const PAPER_WIDTH = 960;
const PAPER_HEIGHT = 420;
const PIXELS_PER_SHAPE_UNIT = PAPER_WIDTH / 2;
const WIDEST_TEXT = 880;
const LARGEST_FONT_SIZE = 300;
const SMALLEST_FONT_SIZE = 24;
const FONT_SIZE_STEP = 8;
const FONT_WEIGHT = 500;
const SAMPLE_EVERY_PIXELS = 3;
const SOLID_ALPHA = 128;
const ALPHA_OFFSET = 3;
const TEXT_DOT_SIZE = 1.05;
const FONT_FAMILY_TOKEN = '--font-voice';

function fitFont(context: CanvasRenderingContext2D, text: string, fontFamily: string) {
  let size = LARGEST_FONT_SIZE;
  context.font = `${FONT_WEIGHT} ${size}px ${fontFamily}`;
  while (context.measureText(text).width > WIDEST_TEXT && size > SMALLEST_FONT_SIZE) {
    size -= FONT_SIZE_STEP;
    context.font = `${FONT_WEIGHT} ${size}px ${fontFamily}`;
  }
}

// Draws the text on a hidden canvas and keeps a point wherever the ink landed.
export function textToDots(text: string): DotPoint[] {
  const paper = document.createElement('canvas');
  paper.width = PAPER_WIDTH;
  paper.height = PAPER_HEIGHT;
  const context = getCanvasContext(paper, { willReadFrequently: true });
  if (!context) return [];
  fitFont(context, text, getComputedStyle(document.documentElement).getPropertyValue(FONT_FAMILY_TOKEN));
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, PAPER_WIDTH / 2, PAPER_HEIGHT / 2);
  const { data } = context.getImageData(0, 0, PAPER_WIDTH, PAPER_HEIGHT);
  const points: DotPoint[] = [];
  for (let y = 0; y < PAPER_HEIGHT; y += SAMPLE_EVERY_PIXELS) {
    for (let x = 0; x < PAPER_WIDTH; x += SAMPLE_EVERY_PIXELS) {
      const alpha = data[(y * PAPER_WIDTH + x) * 4 + ALPHA_OFFSET] ?? 0;
      if (alpha > SOLID_ALPHA) points.push([(x - PAPER_WIDTH / 2) / PIXELS_PER_SHAPE_UNIT, (y - PAPER_HEIGHT / 2) / PIXELS_PER_SHAPE_UNIT, TEXT_DOT_SIZE]);
    }
  }
  return points;
}
