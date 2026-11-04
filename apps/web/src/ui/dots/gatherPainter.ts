import { getCanvasContext } from './canvasContext';
import { createGathering, getGatherDot, RETURN_MS } from './gatherDots';

const LARGEST_PIXEL_RATIO = 2;
const FULL_TURN = Math.PI * 2;
const GRID_DOT_RADIUS = 1;
const GRID_OPACITY = 0.28;
const DOT_RADIUS = 1.15;
const THEME_ATTRIBUTE = 'data-theme';
const SHADES = 4;
const NUMBERS_IN_A_DOT = 4;

export interface GatherPainter {
  handOver(): void;
  stop(): void;
}

interface GatherPainterOptions {
  canvas: HTMLCanvasElement;
  isReducedMotion: boolean;
  onReturned(): void;
}

// Runs a frame loop only while the dots gather, and a picture that does not move paints once.
export function createGatherPainter({ canvas, isReducedMotion, onReturned }: GatherPainterOptions): GatherPainter | null {
  const context = getCanvasContext(canvas);
  if (!context) return null;
  const startedAt = performance.now();
  let handedOverAt: number | null = null;
  let frame = 0;
  let gathering = createGathering(0, 0);
  let width = 0;
  let height = 0;
  let ink = '';
  let gridInk = '';

  const paint = (now: number) => {
    context.clearRect(0, 0, width, height);
    context.fillStyle = gridInk;
    context.globalAlpha = GRID_OPACITY;
    context.beginPath();
    for (const { x, y } of gathering.grid) {
      context.moveTo(x + GRID_DOT_RADIUS, y);
      context.arc(x, y, GRID_DOT_RADIUS, 0, FULL_TURN);
    }
    context.fill();
    context.fillStyle = ink;
    const moment = { gatheredMs: isReducedMotion ? null : now - startedAt, returnedMs: handedOverAt === null ? null : now - handedOverAt, turnedMs: isReducedMotion ? 0 : now - startedAt };
    const placedDots = gathering.dots.flatMap((dot) => getGatherDot(gathering, dot, moment) ?? []) as number[];
    // Each dot darkens as it leaves the grid, and a few shared shades keep one fill for many dots.
    for (let shade = 1; shade <= SHADES; shade += 1) {
      context.globalAlpha = GRID_OPACITY + (1 - GRID_OPACITY) * (shade / SHADES);
      context.beginPath();
      for (let index = 0; index < placedDots.length; index += NUMBERS_IN_A_DOT) {
        const [x, y, size, share] = [placedDots[index], placedDots[index + 1], placedDots[index + 2], placedDots[index + 3]] as [number, number, number, number];
        if (Math.max(1, Math.ceil(share * SHADES)) !== shade) continue;
        const radius = GRID_DOT_RADIUS + (DOT_RADIUS * size - GRID_DOT_RADIUS) * share;
        context.moveTo(x + radius, y);
        context.arc(x, y, radius, 0, FULL_TURN);
      }
      context.fill();
    }
  };

  const paintFrame = (now: number) => {
    paint(now);
    if (handedOverAt !== null && now - handedOverAt >= RETURN_MS) {
      frame = 0;
      onReturned();
      return;
    }
    frame = requestAnimationFrame(paintFrame);
  };

  const measure = () => {
    const box = canvas.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, LARGEST_PIXEL_RATIO);
    width = box.width;
    height = box.height;
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    gathering = createGathering(width, height);
    const styles = getComputedStyle(canvas);
    ink = styles.color;
    gridInk = styles.getPropertyValue('--color-ink-2') || ink;
    paint(performance.now());
  };

  const resizeObserver = new ResizeObserver(measure);
  resizeObserver.observe(canvas);
  const themeObserver = new MutationObserver(measure);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: [THEME_ATTRIBUTE] });
  measure();
  if (!isReducedMotion) frame = requestAnimationFrame(paintFrame);

  return {
    handOver() {
      if (handedOverAt !== null) return;
      if (isReducedMotion) {
        onReturned();
        return;
      }
      handedOverAt = performance.now();
    },
    stop() {
      cancelAnimationFrame(frame);
      frame = 0;
      resizeObserver.disconnect();
      themeObserver.disconnect();
    },
  };
}
