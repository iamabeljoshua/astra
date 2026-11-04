import { type ChartLayout, type ChartPoint, isInChart, isNearPlanet } from './chartLayout';
import { createSeededRandom } from './dotPoint';

const FULL_TURN = Math.PI * 2;

const GRID = { dotRadius: 1.15, fadeRate: 1.6, opacity: { light: 0.26, dark: 0.3 } };
const CHART_REACH = 1.02;
const RINGS = { radii: [0.72, 1.06, 1.4], dotGap: 7, dotRadius: 0.7, opacity: 0.34 };
const SPOKES = { count: 12, firstDot: 14, dotCount: 34, reach: 1.4, dotRadius: 0.6, opacity: 0.2 };
const SCATTER = { seed: 23, wideCount: 230, bandCount: 110, reach: 1.34, clearOfHeader: 62 };
const BRIGHT_STARS = [
  { fromMagnitude: 0.93, radius: 2.5, opacity: 0.8 },
  { fromMagnitude: 0.72, radius: 1.6, opacity: 0.8 },
];
const FAINT_STAR = { radius: 0.95, opacity: 0.5 };

function getChartRadius({ starSpread }: ChartLayout) {
  return Math.min(starSpread.x, starSpread.y) * CHART_REACH;
}

function getGridDotFade({ x, y }: ChartPoint, { clearing }: ChartLayout) {
  const reach = ((x - clearing.x) / clearing.radiusX) ** 2 + ((y - clearing.y) / clearing.radiusY) ** 2;
  return Math.min(1, Math.max(0, (reach - 1) * GRID.fadeRate));
}

function paintGrid(context: CanvasRenderingContext2D, layout: ChartLayout, isDark: boolean) {
  const opacity = isDark ? GRID.opacity.dark : GRID.opacity.light;
  for (let y = layout.gridGap / 2; y < layout.height; y += layout.gridGap) {
    for (let x = layout.gridGap / 2; x < layout.width; x += layout.gridGap) {
      const fade = getGridDotFade({ x, y }, layout);
      if (fade === 0) continue;
      context.globalAlpha = opacity * fade;
      context.beginPath();
      context.arc(x, y, GRID.dotRadius, 0, FULL_TURN);
      context.fill();
    }
  }
}

function addChartDot(context: CanvasRenderingContext2D, layout: ChartLayout, point: ChartPoint, radius: number) {
  if (!isInChart(layout, point) || isNearPlanet(layout, point)) return;
  context.moveTo(point.x + radius, point.y);
  context.arc(point.x, point.y, radius, 0, FULL_TURN);
}

function paintRings(context: CanvasRenderingContext2D, layout: ChartLayout) {
  const chartRadius = getChartRadius(layout);
  context.globalAlpha = RINGS.opacity;
  for (const ring of RINGS.radii) {
    const dotCount = Math.floor((FULL_TURN * ring * chartRadius) / RINGS.dotGap);
    context.beginPath();
    for (let dot = 0; dot < dotCount; dot += 1) {
      const angle = (dot / dotCount) * FULL_TURN;
      addChartDot(context, layout, { x: layout.center.x + Math.cos(angle) * ring * chartRadius, y: layout.center.y + Math.sin(angle) * ring * chartRadius }, RINGS.dotRadius);
    }
    context.fill();
  }
}

function paintSpokes(context: CanvasRenderingContext2D, layout: ChartLayout) {
  const chartRadius = getChartRadius(layout) * SPOKES.reach;
  context.globalAlpha = SPOKES.opacity;
  for (let spoke = 0; spoke < SPOKES.count; spoke += 1) {
    const angle = (spoke / SPOKES.count) * FULL_TURN;
    context.beginPath();
    for (let dot = SPOKES.firstDot; dot < SPOKES.dotCount; dot += 1) {
      const distance = (dot / SPOKES.dotCount) * chartRadius;
      addChartDot(context, layout, { x: layout.center.x + Math.cos(angle) * distance, y: layout.center.y + Math.sin(angle) * distance }, SPOKES.dotRadius);
    }
    context.fill();
  }
}

function paintScatteredStars(context: CanvasRenderingContext2D, layout: ChartLayout) {
  const random = createSeededRandom(SCATTER.seed);
  const chartRadius = getChartRadius(layout) * SCATTER.reach;
  const count = layout.isWide ? SCATTER.wideCount : SCATTER.bandCount;
  for (let star = 0; star < count; star += 1) {
    const angle = random() * FULL_TURN;
    const distance = Math.sqrt(random()) * chartRadius;
    const magnitude = random();
    const point = { x: layout.center.x + Math.cos(angle) * distance, y: layout.center.y + Math.sin(angle) * distance };
    if (point.y < SCATTER.clearOfHeader) continue;
    const { radius, opacity } = BRIGHT_STARS.find(({ fromMagnitude }) => magnitude > fromMagnitude) ?? FAINT_STAR;
    context.globalAlpha = opacity;
    context.beginPath();
    addChartDot(context, layout, point, radius);
    context.fill();
  }
}

// Drawn once for a size and theme, so nothing here moves.
export function paintBackdrop(context: CanvasRenderingContext2D, layout: ChartLayout, { ink, isDark }: { ink: string; isDark: boolean }) {
  context.clearRect(0, 0, layout.width, layout.height);
  context.fillStyle = ink;
  paintGrid(context, layout, isDark);
  paintRings(context, layout);
  paintSpokes(context, layout);
  paintScatteredStars(context, layout);
  context.globalAlpha = 1;
}
