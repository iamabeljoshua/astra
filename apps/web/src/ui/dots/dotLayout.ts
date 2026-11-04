export interface DotClearing {
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
}

export interface DotLayout {
  gridGap: number;
  clearings: DotClearing[];
  shape: { centerX: number; centerY: number; scale: number; dotRadius: number; dotCount: number };
}

const PHONE_WIDTH_LIMIT = 761;
const STAGE_WIDTH = 560;
const STAGE_MARGIN = 32;
const SHAPE_REACH = 1.02;

function getPhoneLayout(width: number): DotLayout {
  const scale = Math.min(width * 0.42, 100);
  const centerY = 138;
  return {
    gridGap: 22,
    clearings: [
      { centerX: width / 2, centerY: 450, radiusX: width * 0.66, radiusY: 280 },
      { centerX: width / 2, centerY, radiusX: scale * 1.2, radiusY: scale * 1.2 },
    ],
    shape: { centerX: width / 2, centerY, scale, dotRadius: 1, dotCount: 700 },
  };
}

function getWideLayout(width: number, height: number): DotLayout {
  const scale = Math.min(width * 0.25, height * 0.38, (width - STAGE_WIDTH - STAGE_MARGIN) / 2);
  const centerX = Math.max(width * 0.7, STAGE_WIDTH + STAGE_MARGIN / 2 + scale);
  const centerY = height / 2;
  return {
    gridGap: 28,
    clearings: [
      { centerX: STAGE_WIDTH * 0.55, centerY: centerY + 12, radiusX: Math.min(width * 0.42, 440), radiusY: Math.min(height * 0.42, 300) },
      { centerX, centerY, radiusX: scale * 1.15, radiusY: scale * 1.05 },
    ],
    shape: { centerX, centerY, scale, dotRadius: 1.35, dotCount: 1300 },
  };
}

export function getDotLayout(width: number, height: number): DotLayout {
  return width < PHONE_WIDTH_LIMIT ? getPhoneLayout(width) : getWideLayout(width, height);
}

export function getShapeBoxSize(layout: DotLayout): number {
  return Math.ceil(layout.shape.scale * SHAPE_REACH * 2);
}
