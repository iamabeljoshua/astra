import { prefersReducedMotion } from '../motion';
import { getCanvasContext } from './canvasContext';
import { paintBackdrop } from './chartBackdrop';
import { type ChartLayout, getChartLayout } from './chartLayout';
import { type ChartColors, isAnyStarLightingUp, type LitStar, type LitStarOnChart, paintLitStars, paintPath, paintSubjectStars } from './chartStars';
import type { DotPoint } from './dotPoint';
import { createDotSwarm, type DotSwarm, getDotPosition, isSwarmSettled, placeDots, scatterDots, sendDots } from './dotSwarm';
import { getGlideValue, type Glide, isGlideMoving } from './glide';

const DOT_COUNT = 3000;
const DOT_OPACITY = 0.86;
const LARGEST_PIXEL_RATIO = 2;
const FULL_TURN = Math.PI * 2;
const THEME_ATTRIBUTE = 'data-theme';
const LABEL_FONT_TOKEN = '--font-ui';
const LABEL_FONT_SAMPLE = '500 11px';
const ALREADY_LIT = Number.NEGATIVE_INFINITY;

export interface StageChart {
  shape: readonly DotPoint[];
  legsDrawn: number;
  litStars: readonly LitStar[];
}

interface DotPainterParts {
  stage: HTMLElement;
  backdropCanvas: HTMLCanvasElement;
  liveCanvas: HTMLCanvasElement;
  formsOnArrival: boolean;
}

export interface DotPainter {
  show: (chart: StageChart) => void;
  stop: () => void;
}

interface ShowMoment {
  isCalm: boolean;
  isFirst: boolean;
  now: number;
}

function sizeCanvas(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, { width, height }: ChartLayout) {
  const pixelRatio = Math.min(window.devicePixelRatio || 1, LARGEST_PIXEL_RATIO);
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
}

function readChartColors(canvas: HTMLCanvasElement): ChartColors {
  const { color, backgroundColor } = getComputedStyle(canvas);
  return { ink: color, paper: backgroundColor, isDark: document.documentElement.dataset.theme === 'dark' };
}

function paintSwarm(context: CanvasRenderingContext2D, swarm: DotSwarm, layout: ChartLayout, now: number) {
  const { center, planetScale, dotRadius } = layout;
  context.globalAlpha = DOT_OPACITY;
  context.beginPath();
  for (let dot = 0; dot < swarm.count; dot += 1) {
    const [x, y, size] = getDotPosition(swarm, dot, now);
    const [pixelX, pixelY, radius] = [center.x + x * planetScale, center.y + y * planetScale, dotRadius * size];
    context.moveTo(pixelX + radius, pixelY);
    context.arc(pixelX, pixelY, radius, 0, FULL_TURN);
  }
  context.fill();
}

// A frame loop runs only while something on the chart is on its way.
export function createDotPainter({ stage, backdropCanvas, liveCanvas, formsOnArrival }: DotPainterParts): DotPainter | null {
  const backdropContext = getCanvasContext(backdropCanvas);
  const liveContext = getCanvasContext(liveCanvas);
  if (!backdropContext || !liveContext) return null;

  const swarm = createDotSwarm(DOT_COUNT);
  const fontFamily = getComputedStyle(document.documentElement).getPropertyValue(LABEL_FONT_TOKEN);
  let layout = getChartLayout(stage.clientWidth, stage.clientHeight);
  let colors = readChartColors(backdropCanvas);
  let legs: Glide = { from: 0, to: 0, startedAt: 0 };
  let litStars: LitStarOnChart[] = [];
  let currentShape: readonly DotPoint[] = [];
  let frame = 0;

  const paintLive = (now: number) => {
    const legsDrawn = getGlideValue(legs, now);
    liveContext.clearRect(0, 0, layout.width, layout.height);
    liveContext.fillStyle = colors.ink;
    paintSwarm(liveContext, swarm, layout, now);
    paintPath(liveContext, layout, legsDrawn);
    paintSubjectStars(liveContext, layout, colors, { legsDrawn, fontFamily });
    paintLitStars(liveContext, layout, colors, { stars: litStars, fontFamily, now });
  };

  const isMoving = (now: number) => !isSwarmSettled(swarm, now) || isGlideMoving(legs, now) || isAnyStarLightingUp(litStars, now);

  const paintFrame = () => {
    const now = performance.now();
    paintLive(now);
    frame = isMoving(now) ? requestAnimationFrame(paintFrame) : 0;
  };

  const paintAll = () => {
    layout = getChartLayout(stage.clientWidth, stage.clientHeight);
    colors = readChartColors(backdropCanvas);
    sizeCanvas(backdropCanvas, backdropContext, layout);
    sizeCanvas(liveCanvas, liveContext, layout);
    paintBackdrop(backdropContext, layout, colors);
    paintLive(performance.now());
  };

  const moveDotsTo = (shape: readonly DotPoint[], { isCalm, isFirst, now }: ShowMoment) => {
    if (shape.length === 0 || shape === currentShape) return;
    currentShape = shape;
    if (isCalm || (isFirst && !formsOnArrival)) {
      placeDots(swarm, shape);
      return;
    }
    if (isFirst) scatterDots(swarm);
    sendDots(swarm, shape, now);
  };

  const moveLegsTo = (legsDrawn: number, { isCalm, isFirst, now }: ShowMoment) => {
    if (legs.to === legsDrawn) return;
    const isPlaced = isCalm || (isFirst && !formsOnArrival);
    legs = isPlaced ? { from: legsDrawn, to: legsDrawn, startedAt: now } : { from: getGlideValue(legs, now), to: legsDrawn, startedAt: now };
  };

  const updateLitStars = (next: readonly LitStar[], { isCalm, isFirst, now }: ShowMoment) => {
    const litAt = isCalm || isFirst ? ALREADY_LIT : now;
    litStars = next.map((star) => litStars.find(({ spot }) => spot === star.spot) ?? { ...star, litAt });
  };

  const show = ({ shape, legsDrawn, litStars: nextLitStars }: StageChart) => {
    const now = performance.now();
    const moment = { isCalm: prefersReducedMotion(), isFirst: currentShape.length === 0, now };
    moveDotsTo(shape, moment);
    moveLegsTo(legsDrawn, moment);
    updateLitStars(nextLitStars, moment);
    if (moment.isFirst) paintAll();
    else paintLive(now);
    if (isMoving(now) && !frame) frame = requestAnimationFrame(paintFrame);
  };

  const resizeObserver = new ResizeObserver(paintAll);
  resizeObserver.observe(stage);
  const themeObserver = new MutationObserver(paintAll);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: [THEME_ATTRIBUTE] });
  const paintWithLoadedFont = () => paintLive(performance.now());
  void document.fonts.load(`${LABEL_FONT_SAMPLE} ${fontFamily}`).then(paintWithLoadedFont, paintWithLoadedFont);

  return {
    show,
    stop: () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      themeObserver.disconnect();
    },
  };
}
