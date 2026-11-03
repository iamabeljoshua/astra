import { ARTWORK_LABELS } from '../strings';

export interface DrawingProps {
  className?: string;
}

interface Point {
  x: number;
  y: number;
}

export const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

const ARROW_HEAD = { length: 10, angle: 0.5 };
const FORCES_START: Point = { x: 144, y: 99 };

const GROWTH_CURVE = { rate: 1.1, years: 30, left: 16, widthPerYear: 5.6, bottom: 104, height: 90 };

const HELIX = { left: 8, width: 184, midline: 60, amplitude: 34, turnsInRadians: Math.PI * 3 };
const HELIX_STRAND = { pointCount: 47, pointSpacing: 4 };
const HELIX_RUNGS = { count: 15, left: 16, spacing: 12 };

export function ArcDrawing({ className }: DrawingProps) {
  return (
    <svg viewBox="0 0 640 380" role="img" aria-label={ARTWORK_LABELS.arc} className={className}>
      <path d="M24 344 L616 344" strokeWidth={1.5} {...STROKE} />
      <path d="M566 344 L566 62" strokeWidth={2} {...STROKE} />
      <ellipse cx={516} cy={128} rx={36} ry={7} strokeWidth={2} {...STROKE} />
      <circle cx={112} cy={262} r={15} fill="currentColor" />
      <path d="M112 262 Q314 76 516 128" strokeWidth={3} {...STROKE} />
    </svg>
  );
}

function getArrowPath({ from, to }: { from: Point; to: Point }) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const getHeadPoint = (offset: number) =>
    `${(to.x - ARROW_HEAD.length * Math.cos(angle + offset)).toFixed(1)} ${(to.y - ARROW_HEAD.length * Math.sin(angle + offset)).toFixed(1)}`;
  return `M${from.x} ${from.y} L${to.x} ${to.y} M${getHeadPoint(ARROW_HEAD.angle)} L${to.x} ${to.y} L${getHeadPoint(-ARROW_HEAD.angle)}`;
}

function ForceLetter({ x, y, letter }: { x: number; y: number; letter: string }) {
  return (
    <text x={x} y={y} fill="currentColor" fontWeight={500} fontSize={12} letterSpacing={1.4}>
      {letter}
    </text>
  );
}

export function ForcesDrawing({ className }: DrawingProps) {
  return (
    <svg viewBox="0 0 300 180" role="img" aria-label={ARTWORK_LABELS.forces} className={className}>
      <path d="M18 164 L288 164 L288 72 Z" strokeWidth={1.5} {...STROKE} />
      <g transform="translate(150 118) rotate(-18.8)">
        <rect x={-30} y={-38} width={60} height={38} strokeWidth={2} {...STROKE} />
      </g>
      <path d={getArrowPath({ from: FORCES_START, to: { x: 144, y: 166 } })} strokeWidth={2} {...STROKE} />
      <path d={getArrowPath({ from: FORCES_START, to: { x: 121, y: 34 } })} strokeWidth={2} {...STROKE} />
      <path d={getArrowPath({ from: FORCES_START, to: { x: 212, y: 76 } })} strokeWidth={2} {...STROKE} />
      <ForceLetter x={150} y={174} letter={ARTWORK_LABELS.forceWeight} />
      <ForceLetter x={106} y={34} letter={ARTWORK_LABELS.forceNormal} />
      <ForceLetter x={216} y={70} letter={ARTWORK_LABELS.forceFriction} />
    </svg>
  );
}

function getGrowthCurvePath() {
  const { rate, years, left, widthPerYear, bottom, height } = GROWTH_CURVE;
  const fullGrowth = rate ** years - 1;
  const points = Array.from({ length: years + 1 }, (_unused, year) => {
    const x = left + year * widthPerYear;
    const y = bottom - (height * (rate ** year - 1)) / fullGrowth;
    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  return `M${points.join(' L')}`;
}

export function GrowthDrawing({ className }: DrawingProps) {
  return (
    <svg viewBox="0 0 200 120" role="img" aria-label={ARTWORK_LABELS.growth} className={className}>
      <path d="M16 8 L16 104 L192 104" strokeWidth={1.5} {...STROKE} />
      <path d={getGrowthCurvePath()} strokeWidth={2.5} {...STROKE} />
    </svg>
  );
}

function getHelixHeight(x: number, phase: number) {
  return HELIX.midline + HELIX.amplitude * Math.sin(((x - HELIX.left) / HELIX.width) * HELIX.turnsInRadians + phase);
}

function getHelixStrandPath(phase: number) {
  const points = Array.from({ length: HELIX_STRAND.pointCount }, (_unused, step) => {
    const x = HELIX.left + step * HELIX_STRAND.pointSpacing;
    return `${x} ${getHelixHeight(x, phase).toFixed(1)}`;
  });
  return `M${points.join(' L')}`;
}

function getHelixRungsPath() {
  const rungs = Array.from({ length: HELIX_RUNGS.count }, (_unused, step) => {
    const x = HELIX_RUNGS.left + step * HELIX_RUNGS.spacing;
    const top = getHelixHeight(x, 0);
    const bottom = HELIX.midline * 2 - top;
    return `M${x} ${top.toFixed(1)} L${x} ${bottom.toFixed(1)}`;
  });
  return rungs.join(' ');
}

export function HelixDrawing({ className }: DrawingProps) {
  return (
    <svg viewBox="0 0 200 120" role="img" aria-label={ARTWORK_LABELS.helix} className={className}>
      <path d={getHelixRungsPath()} strokeWidth={1} {...STROKE} />
      <path d={getHelixStrandPath(0)} strokeWidth={2.5} {...STROKE} />
      <path d={getHelixStrandPath(Math.PI)} strokeWidth={2.5} {...STROKE} />
    </svg>
  );
}
