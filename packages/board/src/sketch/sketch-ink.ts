import type { Branch, Point } from '../figure/figure-marks.ts';
import { getSpread } from '../ink/ink-stroke.ts';

const PEN = { bowPx: 0.9, wigglePx: 0.35, stepPx: 4, ringOverlapRadians: 0.4, ringSteps: 56, ringWander: 0.025, ringLargestWanderPx: 1.4, headPx: 10, headSpread: 0.5 };

const along = (from: Point, to: Point, share: number): Point => ({ x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share });

export function getPenLine(from: Point, to: Point, random: () => number): Point[] {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(2, Math.ceil(length / PEN.stepPx));
  const normal = { x: -(to.y - from.y) / (length || 1), y: (to.x - from.x) / (length || 1) };
  const bow = getSpread(random, Math.min(PEN.bowPx, length / 40));
  const waves = 1 + random() * 1.5;
  const phase = random() * 2 * Math.PI;
  return Array.from({ length: steps + 1 }, (_, step) => {
    const share = step / steps;
    const point = along(from, to, share);
    const drift = Math.sin(Math.PI * share) * (bow + PEN.wigglePx * Math.sin(2 * Math.PI * waves * share + phase));
    return { x: point.x + normal.x * drift, y: point.y + normal.y * drift };
  });
}

export function getPenRing(center: Point, radius: number, random: () => number): Point[] {
  const start = -2.2 + getSpread(random, 0.3);
  const wander = Math.min(radius * PEN.ringWander, PEN.ringLargestWanderPx);
  const phases = [random() * 2 * Math.PI, random() * 2 * Math.PI];
  return Array.from({ length: PEN.ringSteps + 1 }, (_, step) => {
    const angle = start + (step / PEN.ringSteps) * (2 * Math.PI + PEN.ringOverlapRadians);
    const reach = radius + wander * (Math.sin(angle + (phases[0] as number)) + 0.5 * Math.sin(2 * angle + (phases[1] as number)) + step / PEN.ringSteps);
    return { x: center.x + Math.cos(angle) * reach, y: center.y + Math.sin(angle) * reach };
  });
}

export function getPenPolygon(corners: readonly Point[], random: () => number): Point[] {
  const closed = [...corners, corners[0] as Point];
  return closed.slice(1).flatMap((corner, index) => getPenLine(closed[index] as Point, corner, random).slice(index === 0 ? 0 : 1));
}

export function getArrowHead(points: Branch): Branch {
  const tip = points.at(-1);
  const before = points.at(-2);
  if (!tip || !before) return [];
  const angle = Math.atan2(tip.y - before.y, tip.x - before.x);
  const barb = (side: number): Point => ({ x: tip.x - Math.cos(angle + side * PEN.headSpread) * PEN.headPx, y: tip.y - Math.sin(angle + side * PEN.headSpread) * PEN.headPx });
  return [barb(1), tip, barb(-1)];
}

export function getCurveThrough(points: readonly Point[], stepsPerSpan = 12): Point[] {
  if (points.length < 3) return [...points];
  const at = (index: number) => points[Math.max(0, Math.min(points.length - 1, index))] as Point;
  return points.slice(0, -1).flatMap((_, index) => {
    const [before, from, to, after] = [at(index - 1), at(index), at(index + 1), at(index + 2)];
    return Array.from({ length: stepsPerSpan + (index === points.length - 2 ? 1 : 0) }, (__, step) => {
      const t = step / stepsPerSpan;
      const t2 = t * t;
      const t3 = t2 * t;
      const blend = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      return { x: blend(before.x, from.x, to.x, after.x), y: blend(before.y, from.y, to.y, after.y) };
    });
  });
}

function getAcross(from: Point, to: Point) {
  const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  return { length, normal: { x: -(to.y - from.y) / length, y: (to.x - from.x) / length } };
}

export function getWave(from: Point, to: Point, { height, cycles }: { height: number; cycles: number }): Point[] {
  const { length, normal } = getAcross(from, to);
  const steps = Math.max(16, Math.ceil(length / 3));
  return Array.from({ length: steps + 1 }, (_, step) => {
    const point = along(from, to, step / steps);
    const lift = Math.sin((step / steps) * cycles * 2 * Math.PI) * height;
    return { x: point.x + normal.x * lift, y: point.y + normal.y * lift };
  });
}

export function getSpring(from: Point, to: Point, { width, coils }: { width: number; coils: number }): Point[] {
  const { normal } = getAcross(from, to);
  const lead = 0.12;
  const zigzags = coils * 2;
  const middle = Array.from({ length: zigzags + 1 }, (_, step) => {
    const point = along(from, to, lead + (step / zigzags) * (1 - 2 * lead));
    const side = step === 0 || step === zigzags ? 0 : step % 2 === 0 ? -1 : 1;
    return { x: point.x + normal.x * side * width, y: point.y + normal.y * side * width };
  });
  return [from, ...middle, to];
}

export function getBracket(from: Point, to: Point, depth: number): Point[] {
  const { normal } = getAcross(from, to);
  const out = (point: Point, share: number) => ({ x: point.x + normal.x * depth * share, y: point.y + normal.y * depth * share });
  const middle = along(from, to, 0.5);
  return getCurveThrough([from, out(along(from, to, 0.08), 0.5), out(along(from, to, 0.42), 0.5), out(middle, 1), out(along(from, to, 0.58), 0.5), out(along(from, to, 0.92), 0.5), to], 6);
}
