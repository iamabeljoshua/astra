export interface ChartPoint {
  x: number;
  y: number;
}

export interface ChartLayout {
  width: number;
  height: number;
  isWide: boolean;
  gridGap: number;
  clearing: ChartPoint & { radiusX: number; radiusY: number };
  center: ChartPoint;
  starSpread: ChartPoint;
  planetScale: number;
  dotRadius: number;
}

// The same width as the lg breakpoint in theme.css, where the page's own layout changes.
export const WIDE_LAYOUT_FROM = 1021;

const PHONE_WIDTH_LIMIT = 640;
const BAND_BOTTOM = 276;
const BACKDROP_LEFT_EDGE = 0.42;
const NEAR_PLANET = { reachX: 1.12, reachY: 0.7 };

function getWideLayout(width: number, height: number): ChartLayout {
  return {
    width,
    height,
    isWide: true,
    gridGap: 28,
    clearing: { x: width * 0.25, y: height * 0.54, radiusX: width * 0.27, radiusY: height * 0.46 },
    center: { x: width * 0.68, y: height * 0.52 },
    starSpread: { x: width * 0.3, y: height * 0.62 },
    planetScale: Math.min(width * 0.15, height * 0.25),
    dotRadius: 1.05,
  };
}

function getBandLayout(width: number, height: number): ChartLayout {
  return {
    width,
    height,
    isWide: false,
    gridGap: width < PHONE_WIDTH_LIMIT ? 22 : 28,
    clearing: { x: width * 0.5, y: height * 0.64, radiusX: width * 0.92, radiusY: height * 0.34 },
    center: { x: width * 0.5, y: 160 },
    starSpread: { x: width * 0.44, y: 135 },
    planetScale: Math.min(width * 0.24, 80),
    dotRadius: 0.8,
  };
}

export function getChartLayout(width: number, height: number): ChartLayout {
  return width < WIDE_LAYOUT_FROM ? getBandLayout(width, height) : getWideLayout(width, height);
}

export function isInChart({ isWide, width }: ChartLayout, { x, y }: ChartPoint) {
  return isWide ? x > width * BACKDROP_LEFT_EDGE : y < BAND_BOTTOM;
}

export function isNearPlanet({ center, planetScale }: ChartLayout, { x, y }: ChartPoint) {
  const reachX = (x - center.x) / (planetScale * NEAR_PLANET.reachX);
  const reachY = (y - center.y) / (planetScale * NEAR_PLANET.reachY);
  return reachX * reachX + reachY * reachY < 1;
}
