import { getCanvasContext } from './canvasContext';
import type { DotPoint } from './dotPoint';

const PAPER_WIDTH = 960;
const PAPER_HEIGHT = 420;
const PIXELS_PER_SHAPE_UNIT = PAPER_WIDTH / 2;
const WIDEST_TEXT = 880;
const INK_FREE_EDGE = (PAPER_WIDTH - WIDEST_TEXT) / 4;
const LARGEST_FONT_SIZE = 300;
const SMALLEST_FONT_SIZE = 24;
const FONT_SIZE_STEP = 8;
const FONT_WEIGHT = 500;
const SAMPLE_EVERY_PIXELS = 3;
const SOLID_ALPHA = 128;
const ALPHA_OFFSET = 3;
const TEXT_DOT_SIZE = 1.05;
const FONT_FAMILY_TOKEN = '--font-voice';

export const NO_POINTS: readonly DotPoint[] = [];

function fitFont(context: CanvasRenderingContext2D, text: string, fontFamily: string) {
  let size = LARGEST_FONT_SIZE;
  context.font = `${FONT_WEIGHT} ${size}px ${fontFamily}`;
  while (context.measureText(text).width > WIDEST_TEXT && size > SMALLEST_FONT_SIZE) {
    size -= FONT_SIZE_STEP;
    context.font = `${FONT_WEIGHT} ${size}px ${fontFamily}`;
  }
}

function readDrawnText(text: string, fontFamily: string) {
  const paper = document.createElement('canvas');
  paper.width = PAPER_WIDTH;
  paper.height = PAPER_HEIGHT;
  const context = getCanvasContext(paper, { willReadFrequently: true });
  if (!context) return null;
  fitFont(context, text, fontFamily);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, PAPER_WIDTH / 2, PAPER_HEIGHT / 2);
  return context.getImageData(0, 0, PAPER_WIDTH, PAPER_HEIGHT).data;
}

// A name stops short of the paper's sides, so a solid pixel there means a hardened browser answered the read with noise.
function getInkPoints(data: Uint8ClampedArray): readonly DotPoint[] {
  const points: DotPoint[] = [];
  for (let y = 0; y < PAPER_HEIGHT; y += SAMPLE_EVERY_PIXELS) {
    for (let x = 0; x < PAPER_WIDTH; x += SAMPLE_EVERY_PIXELS) {
      const alpha = data[(y * PAPER_WIDTH + x) * 4 + ALPHA_OFFSET] ?? 0;
      if (alpha <= SOLID_ALPHA) continue;
      if (x < INK_FREE_EDGE || x >= PAPER_WIDTH - INK_FREE_EDGE) return NO_POINTS;
      points.push([(x - PAPER_WIDTH / 2) / PIXELS_PER_SHAPE_UNIT, (y - PAPER_HEIGHT / 2) / PIXELS_PER_SHAPE_UNIT, TEXT_DOT_SIZE]);
    }
  }
  return points;
}

// Waits for the font, because a canvas draws with whatever it has. Any refusal gives no points, and the chart's title still shows the name.
export async function textToDots(text: string): Promise<readonly DotPoint[]> {
  if (!text) return NO_POINTS;
  try {
    const fontFamily = getComputedStyle(document.documentElement).getPropertyValue(FONT_FAMILY_TOKEN);
    await document.fonts.load(`${FONT_WEIGHT} ${LARGEST_FONT_SIZE}px ${fontFamily}`, text).catch(() => undefined);
    const data = readDrawnText(text, fontFamily);
    return data ? getInkPoints(data) : NO_POINTS;
  } catch {
    return NO_POINTS;
  }
}
