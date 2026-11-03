import type { ComponentType } from 'react';
import { DRAWING_LABELS } from '../strings';

interface DrawingProps {
  className?: string;
}

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

const GROWTH_RATE = 1.1;
const GROWTH_YEARS = 30;
const HELIX_TURNS_IN_RADIANS = Math.PI * 3;
const ARROW_HEAD_LENGTH = 10;
const ARROW_HEAD_ANGLE = 0.5;

function ArcDrawing({ className }: DrawingProps) {
  return (
    <svg viewBox="0 0 640 380" role="img" aria-label={DRAWING_LABELS.arc} className={className}>
      <path d="M24 344 L616 344" strokeWidth={1.5} {...STROKE} />
      <path d="M566 344 L566 62" strokeWidth={2} {...STROKE} />
      <ellipse cx={516} cy={128} rx={36} ry={7} strokeWidth={2} {...STROKE} />
      <circle cx={112} cy={262} r={15} fill="currentColor" />
      <path d="M112 262 Q314 76 516 128" strokeWidth={3} {...STROKE} />
    </svg>
  );
}

function getArrowPath(fromX: number, fromY: number, toX: number, toY: number) {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const getHeadPoint = (offset: number) =>
    `${(toX - ARROW_HEAD_LENGTH * Math.cos(angle + offset)).toFixed(1)} ${(toY - ARROW_HEAD_LENGTH * Math.sin(angle + offset)).toFixed(1)}`;
  return `M${fromX} ${fromY} L${toX} ${toY} M${getHeadPoint(ARROW_HEAD_ANGLE)} L${toX} ${toY} L${getHeadPoint(-ARROW_HEAD_ANGLE)}`;
}

function ForceLetter({ x, y, letter }: { x: number; y: number; letter: string }) {
  return (
    <text x={x} y={y} fill="currentColor" fontWeight={500} fontSize={12} letterSpacing={1.4}>
      {letter}
    </text>
  );
}

function ForcesDrawing({ className }: DrawingProps) {
  return (
    <svg viewBox="0 0 300 180" role="img" aria-label={DRAWING_LABELS.forces} className={className}>
      <path d="M18 164 L288 164 L288 72 Z" strokeWidth={1.5} {...STROKE} />
      <g transform="translate(150 118) rotate(-18.8)">
        <rect x={-30} y={-38} width={60} height={38} strokeWidth={2} {...STROKE} />
      </g>
      <path d={getArrowPath(144, 99, 144, 166)} strokeWidth={2} {...STROKE} />
      <path d={getArrowPath(144, 99, 121, 34)} strokeWidth={2} {...STROKE} />
      <path d={getArrowPath(144, 99, 212, 76)} strokeWidth={2} {...STROKE} />
      <ForceLetter x={150} y={174} letter={DRAWING_LABELS.forceWeight} />
      <ForceLetter x={106} y={34} letter={DRAWING_LABELS.forceNormal} />
      <ForceLetter x={216} y={70} letter={DRAWING_LABELS.forceFriction} />
    </svg>
  );
}

function getGrowthCurvePath() {
  const fullGrowth = GROWTH_RATE ** GROWTH_YEARS - 1;
  const points = Array.from({ length: GROWTH_YEARS + 1 }, (_unused, year) => {
    const x = 16 + year * 5.6;
    const y = 104 - (90 * (GROWTH_RATE ** year - 1)) / fullGrowth;
    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  return `M${points.join(' L')}`;
}

function GrowthDrawing({ className }: DrawingProps) {
  return (
    <svg viewBox="0 0 200 120" role="img" aria-label={DRAWING_LABELS.growth} className={className}>
      <path d="M16 8 L16 104 L192 104" strokeWidth={1.5} {...STROKE} />
      <path d={getGrowthCurvePath()} strokeWidth={2.5} {...STROKE} />
    </svg>
  );
}

function getHelixHeight(x: number, phase: number) {
  return 60 + 34 * Math.sin(((x - 8) / 184) * HELIX_TURNS_IN_RADIANS + phase);
}

function getHelixStrandPath(phase: number) {
  const points = Array.from({ length: 47 }, (_unused, step) => {
    const x = 8 + step * 4;
    return `${x} ${getHelixHeight(x, phase).toFixed(1)}`;
  });
  return `M${points.join(' L')}`;
}

function getHelixRungsPath() {
  const rungs = Array.from({ length: 15 }, (_unused, step) => {
    const x = 16 + step * 12;
    const top = getHelixHeight(x, 0);
    return `M${x} ${top.toFixed(1)} L${x} ${(120 - top).toFixed(1)}`;
  });
  return rungs.join(' ');
}

function HelixDrawing({ className }: DrawingProps) {
  return (
    <svg viewBox="0 0 200 120" role="img" aria-label={DRAWING_LABELS.helix} className={className}>
      <path d={getHelixRungsPath()} strokeWidth={1} {...STROKE} />
      <path d={getHelixStrandPath(0)} strokeWidth={2.5} {...STROKE} />
      <path d={getHelixStrandPath(Math.PI)} strokeWidth={2.5} {...STROKE} />
    </svg>
  );
}

export const DRAWINGS: Record<string, ComponentType<DrawingProps>> = {
  arc: ArcDrawing,
  forces: ForcesDrawing,
  growth: GrowthDrawing,
  helix: HelixDrawing,
};
