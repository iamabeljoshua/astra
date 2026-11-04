import { prefersReducedMotion } from '../motion';
import type { DotPoint } from './dotDrawings';
import { type DotClearing, type DotLayout, getDotLayout, getShapeBoxSize } from './dotLayout';
import { createDotSwarm, type DotSwarm, getDotPosition, isSwarmSettled, placeDots, sendDots } from './dotSwarm';

const LARGEST_PIXEL_RATIO = 2;
const FULL_TURN = Math.PI * 2;
const GRID_DOT_RADIUS = 1.15;
const GRID_OPACITY = { light: 0.26, dark: 0.3 };
const GRID_FADE_RATE = 1.6;
const SHAPE_OPACITY = 0.82;
const THEME_ATTRIBUTE = 'data-theme';

interface DotPainterParts {
  stage: HTMLElement;
  gridCanvas: HTMLCanvasElement;
  shapeCanvas: HTMLCanvasElement;
}

export interface DotPainter {
  showShape: (points: readonly DotPoint[]) => void;
  stop: () => void;
}

function sizeCanvas(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, width: number, height: number) {
  const pixelRatio = Math.min(window.devicePixelRatio || 1, LARGEST_PIXEL_RATIO);
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
}

function getGridDotFade(x: number, y: number, clearings: DotClearing[]) {
  const reach = Math.min(...clearings.map(({ centerX, centerY, radiusX, radiusY }) => ((x - centerX) / radiusX) ** 2 + ((y - centerY) / radiusY) ** 2));
  return Math.min(1, Math.max(0, (reach - 1) * GRID_FADE_RATE));
}

function paintGrid(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, stage: HTMLElement, layout: DotLayout) {
  const [width, height] = [stage.clientWidth, stage.clientHeight];
  sizeCanvas(canvas, context, width, height);
  context.fillStyle = getComputedStyle(canvas).color;
  const opacity = document.documentElement.dataset.theme === 'dark' ? GRID_OPACITY.dark : GRID_OPACITY.light;
  for (let y = layout.gridGap / 2; y < height; y += layout.gridGap) {
    for (let x = layout.gridGap / 2; x < width; x += layout.gridGap) {
      const fade = getGridDotFade(x, y, layout.clearings);
      if (fade === 0) continue;
      context.globalAlpha = opacity * fade;
      context.beginPath();
      context.arc(x, y, GRID_DOT_RADIUS, 0, FULL_TURN);
      context.fill();
    }
  }
}

function placeShapeCanvas(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, layout: DotLayout) {
  const boxSize = getShapeBoxSize(layout);
  canvas.style.width = `${boxSize}px`;
  canvas.style.height = `${boxSize}px`;
  canvas.style.left = `${layout.shape.centerX - boxSize / 2}px`;
  canvas.style.top = `${layout.shape.centerY - boxSize / 2}px`;
  sizeCanvas(canvas, context, boxSize, boxSize);
  context.fillStyle = getComputedStyle(canvas).color;
  context.globalAlpha = SHAPE_OPACITY;
}

function paintSwarm(context: CanvasRenderingContext2D, swarm: DotSwarm, layout: DotLayout, now: number) {
  const boxSize = getShapeBoxSize(layout);
  const { scale, dotRadius } = layout.shape;
  context.clearRect(0, 0, boxSize, boxSize);
  context.beginPath();
  for (let dot = 0; dot < swarm.count; dot += 1) {
    const [x, y] = getDotPosition(swarm, dot, now);
    const [pixelX, pixelY] = [boxSize / 2 + x * scale, boxSize / 2 + y * scale];
    context.moveTo(pixelX + dotRadius, pixelY);
    context.arc(pixelX, pixelY, dotRadius, 0, FULL_TURN);
  }
  context.fill();
}

// A frame loop runs only while dots are on their way.
export function createDotPainter({ stage, gridCanvas, shapeCanvas }: DotPainterParts): DotPainter | null {
  const gridContext = gridCanvas.getContext('2d');
  const shapeContext = shapeCanvas.getContext('2d');
  if (!gridContext || !shapeContext) return null;

  let layout = getDotLayout(stage.clientWidth, stage.clientHeight);
  let swarm = createDotSwarm(layout.shape.dotCount);
  let currentPoints: readonly DotPoint[] = [];
  let frame = 0;

  const paintFrame = () => {
    const now = performance.now();
    paintSwarm(shapeContext, swarm, layout, now);
    frame = isSwarmSettled(swarm, now) ? 0 : requestAnimationFrame(paintFrame);
  };

  const paintAll = () => {
    layout = getDotLayout(stage.clientWidth, stage.clientHeight);
    paintGrid(gridCanvas, gridContext, stage, layout);
    placeShapeCanvas(shapeCanvas, shapeContext, layout);
    if (swarm.count !== layout.shape.dotCount) {
      swarm = createDotSwarm(layout.shape.dotCount);
      placeDots(swarm, currentPoints);
    }
    paintSwarm(shapeContext, swarm, layout, performance.now());
  };

  const showShape = (points: readonly DotPoint[]) => {
    if (points.length === 0) return;
    const isFirstShape = currentPoints.length === 0;
    currentPoints = points;
    if (isFirstShape || prefersReducedMotion()) {
      cancelAnimationFrame(frame);
      frame = 0;
      placeDots(swarm, points);
      paintAll();
      return;
    }
    sendDots(swarm, points, performance.now());
    if (!frame) frame = requestAnimationFrame(paintFrame);
  };

  const resizeObserver = new ResizeObserver(paintAll);
  resizeObserver.observe(stage);
  const themeObserver = new MutationObserver(paintAll);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: [THEME_ATTRIBUTE] });

  return {
    showShape,
    stop: () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      themeObserver.disconnect();
    },
  };
}
