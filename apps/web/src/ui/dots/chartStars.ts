import { CHART_LABELS } from '../../strings';
import type { ChartLayout, ChartPoint } from './chartLayout';

export interface LitStar {
  label: string;
  spot: number;
}

export interface LitStarOnChart extends LitStar {
  litAt: number;
}

export interface ChartColors {
  ink: string;
  paper: string;
  isDark: boolean;
}

type ChartSpot = readonly [x: number, y: number];

const FULL_TURN = Math.PI * 2;

export interface SubjectStar {
  spot: ChartSpot;
  labelSide: 'left' | 'right';
  labelPlace: 'above' | 'level' | 'below';
}

export const SUBJECT_STARS: readonly SubjectStar[] = [
  { spot: [-0.86, 0.52], labelSide: 'right', labelPlace: 'below' },
  { spot: [-0.66, -0.16], labelSide: 'right', labelPlace: 'below' },
  { spot: [-0.3, -0.52], labelSide: 'right', labelPlace: 'below' },
  { spot: [0.14, -0.66], labelSide: 'right', labelPlace: 'above' },
  { spot: [0.62, -0.5], labelSide: 'right', labelPlace: 'above' },
  { spot: [0.9, -0.06], labelSide: 'left', labelPlace: 'level' },
  { spot: [0.66, 0.42], labelSide: 'left', labelPlace: 'above' },
  { spot: [0.16, 0.62], labelSide: 'left', labelPlace: 'above' },
];

// One spot for each interest. chartStars.test.ts keeps each clear of the path, the subject stars, and the other labels.
export const LIT_STAR_SPOTS: { wide: readonly ChartSpot[]; band: readonly ChartSpot[] } = {
  wide: [
    [0.028, -0.332],
    [-0.026, 0.348],
    [0.076, 0.523],
    [-0.351, 0.395],
    [0.277, -0.504],
    [-0.634, -0.014],
    [-0.244, 0.572],
    [0.66, 0.005],
    [0.317, 0.348],
    [-0.335, -0.332],
    [0.407, -0.344],
    [-0.051, -0.509],
  ],
  band: [
    [-0.01, -0.28],
    [-0.136, 0.346],
    [-1.04, -0.216],
    [-0.699, 0.337],
    [1.055, -0.389],
    [0.708, 0.056],
    [-0.35, 0.517],
    [-0.378, -0.286],
    [0.467, 0.619],
    [-0.582, -0.578],
    [1.055, 0.735],
    [-0.533, 0.768],
  ],
};

export const PATH_LEG_COUNT = SUBJECT_STARS.length - 1;

const FAINT_PATH = { gap: 7, radius: 0.9, opacity: 0.34 };
const DRAWN_PATH = { gap: 5, radius: 1.5, opacity: 1 };
const STAR = {
  wide: { lit: 6, unlit: 4, interest: 4.5, labelSize: 11 },
  band: { lit: 4.5, unlit: 3, interest: 3.5, labelSize: 9.5 },
  haloRoom: 3.5,
  labelGap: 7,
  labelOffsets: { above: -5, level: 4, below: 11 },
  labelSpacing: '1.6px',
  unlitLabelOpacity: 0.62,
  flipFromSpread: 0.5,
  ringRoom: 3,
  ringOpacity: 0.7,
  lightUpMs: 420,
};
const UNREACHED_STAR_MARGIN = 0.01;

function getSpotPixel([spotX, spotY]: ChartSpot, { center, starSpread }: ChartLayout): ChartPoint {
  return { x: center.x + spotX * starSpread.x, y: center.y + spotY * starSpread.y };
}

function paintDottedLine(context: CanvasRenderingContext2D, from: ChartPoint, to: ChartPoint, { gap, radius, opacity }: typeof FAINT_PATH) {
  const dotCount = Math.max(1, Math.floor(Math.hypot(to.x - from.x, to.y - from.y) / gap));
  context.globalAlpha = opacity;
  context.beginPath();
  for (let dot = 0; dot <= dotCount; dot += 1) {
    const [x, y] = [from.x + ((to.x - from.x) * dot) / dotCount, from.y + ((to.y - from.y) * dot) / dotCount];
    context.moveTo(x + radius, y);
    context.arc(x, y, radius, 0, FULL_TURN);
  }
  context.fill();
}

export function paintPath(context: CanvasRenderingContext2D, layout: ChartLayout, legsDrawn: number) {
  const stars = SUBJECT_STARS.map(({ spot }) => getSpotPixel(spot, layout));
  stars.slice(1).forEach((to, leg) => {
    const from = stars[leg] ?? to;
    paintDottedLine(context, from, to, FAINT_PATH);
    const drawn = Math.min(1, legsDrawn - leg);
    if (drawn > 0) paintDottedLine(context, from, { x: from.x + (to.x - from.x) * drawn, y: from.y + (to.y - from.y) * drawn }, DRAWN_PATH);
  });
}

function paintDisc(context: CanvasRenderingContext2D, { x, y }: ChartPoint, radius: number, color: string) {
  context.fillStyle = color;
  context.beginPath();
  context.arc(x, y, radius, 0, FULL_TURN);
  context.fill();
}

function paintLabel(context: CanvasRenderingContext2D, { point, label, radius, side, place }: { point: ChartPoint; label: string; radius: number; side: SubjectStar['labelSide']; place: SubjectStar['labelPlace'] }) {
  context.textAlign = side === 'left' ? 'right' : 'left';
  const reach = radius + STAR.labelGap;
  context.fillText(label.toUpperCase(), point.x + (side === 'left' ? -reach : reach), point.y + STAR.labelOffsets[place]);
}

function prepareLabels(context: CanvasRenderingContext2D, layout: ChartLayout, fontFamily: string) {
  const { labelSize } = layout.isWide ? STAR.wide : STAR.band;
  context.textBaseline = 'alphabetic';
  context.letterSpacing = STAR.labelSpacing;
  context.font = `500 ${labelSize}px ${fontFamily}`;
}

export function paintSubjectStars(context: CanvasRenderingContext2D, layout: ChartLayout, colors: ChartColors, { legsDrawn, fontFamily }: { legsDrawn: number; fontFamily: string }) {
  const sizes = layout.isWide ? STAR.wide : STAR.band;
  prepareLabels(context, layout, fontFamily);
  SUBJECT_STARS.forEach(({ spot, labelSide, labelPlace }, star) => {
    const point = getSpotPixel(spot, layout);
    const isReached = legsDrawn >= star - UNREACHED_STAR_MARGIN;
    const radius = isReached ? sizes.lit : sizes.unlit;
    context.globalAlpha = 1;
    paintDisc(context, point, radius + STAR.haloRoom, colors.paper);
    paintDisc(context, point, radius, colors.ink);
    context.globalAlpha = isReached ? 1 : STAR.unlitLabelOpacity;
    paintLabel(context, { point, label: CHART_LABELS.subjectStars[star] ?? '', radius, side: labelSide, place: labelPlace });
  });
  context.globalAlpha = 1;
}

function getLightUpProgress(litAt: number, now: number) {
  return Math.min(1, Math.max(0, (now - litAt) / STAR.lightUpMs));
}

export function isAnyStarLightingUp(stars: readonly LitStarOnChart[], now: number) {
  return stars.some(({ litAt }) => getLightUpProgress(litAt, now) < 1);
}

export function paintLitStars(context: CanvasRenderingContext2D, layout: ChartLayout, colors: ChartColors, { stars, fontFamily, now }: { stars: readonly LitStarOnChart[]; fontFamily: string; now: number }) {
  const spots = layout.isWide ? LIT_STAR_SPOTS.wide : LIT_STAR_SPOTS.band;
  const radius = layout.isWide ? STAR.wide.interest : STAR.band.interest;
  prepareLabels(context, layout, fontFamily);
  for (const { spot, label, litAt } of stars) {
    const place = spots[spot];
    if (!place) continue;
    const point = getSpotPixel(place, layout);
    const progress = getLightUpProgress(litAt, now);
    context.globalAlpha = 1;
    paintDisc(context, point, (radius + STAR.ringRoom + STAR.haloRoom) * progress, colors.paper);
    paintDisc(context, point, radius * progress, colors.ink);
    context.globalAlpha = STAR.ringOpacity * progress;
    context.strokeStyle = colors.ink;
    context.lineWidth = 1;
    context.beginPath();
    context.arc(point.x, point.y, (radius + STAR.ringRoom) * progress, 0, FULL_TURN);
    context.stroke();
    context.fillStyle = colors.ink;
    context.globalAlpha = progress;
    const side = point.x > layout.center.x + layout.starSpread.x * STAR.flipFromSpread ? 'left' : 'right';
    paintLabel(context, { point, label, radius: radius + STAR.ringRoom, side, place: 'above' });
  }
  context.globalAlpha = 1;
}
