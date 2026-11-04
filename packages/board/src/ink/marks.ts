import type { AnnotationMark } from '@astra/contracts';
import { type InkDrawing, type InkPosition, getSpread, makeSeededRandom, makeStroke } from './ink-stroke.ts';

export interface MarkBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

const RING = { steps: 26, paddingX: 4.5, paddingY: 4, wobble: 0.035, largestWanderPx: 2.5, overlapRadians: 0.5, startRadians: -2.2 };
const RING_ROUNDNESS = [2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96];
const UNDERLINE = { steps: 8, gap: 3, wobble: 1.1 };
const TICK = { sizeEms: 0.7, largestSize: 26, gap: 8 };

export interface MarkReach {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const getTickSize = (box: MarkBox) => Math.min(box.height * TICK.sizeEms, TICK.largestSize);

// An ellipse leaves a wide box's corners outside it, so the ring squares up until the whole box is inside, even at its smallest wander.
function getRingRoundness(box: MarkBox, wander: { x: number; y: number }): number {
  const across = box.width / 2 / (box.width / 2 + RING.paddingX - wander.x);
  const down = box.height / 2 / (box.height / 2 + RING.paddingY - wander.y);
  return RING_ROUNDNESS.find((power) => across ** power + down ** power <= 1) ?? (RING_ROUNDNESS.at(-1) as number);
}

const getRingWander = (radius: number) => Math.min(radius * RING.wobble, RING.largestWanderPx);

function getRing(box: MarkBox, random: () => number): InkDrawing['strokes'] {
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  const radiusX = box.width / 2 + RING.paddingX;
  const radiusY = box.height / 2 + RING.paddingY;
  const wander = { x: getRingWander(radiusX), y: getRingWander(radiusY) };
  const power = 2 / getRingRoundness(box, wander);
  const squared = (value: number) => Math.sign(value) * Math.abs(value) ** power;
  const points: InkPosition[] = Array.from({ length: RING.steps + 1 }, (_, step) => {
    const angle = RING.startRadians + (step / RING.steps) * (2 * Math.PI + RING.overlapRadians);
    const drift = getSpread(random, 1) / 2 + (step / RING.steps) / 2;
    return { x: centerX + squared(Math.cos(angle)) * (radiusX + drift * wander.x), y: centerY + squared(Math.sin(angle)) * (radiusY + drift * wander.y) };
  });
  return [makeStroke(points)];
}

function getUnderline(box: MarkBox, random: () => number): InkDrawing['strokes'] {
  const y = box.y + box.height + UNDERLINE.gap;
  const points = Array.from({ length: UNDERLINE.steps + 1 }, (_, step) => ({ x: box.x + (step / UNDERLINE.steps) * box.width, y: y + getSpread(random, UNDERLINE.wobble) }));
  return [makeStroke(points)];
}

function getCheck(box: MarkBox): InkDrawing['strokes'] {
  const size = getTickSize(box);
  const x = box.x + box.width + TICK.gap;
  const y = box.y + box.height / 2;
  return [makeStroke([{ x, y }, { x: x + size * 0.35, y: y + size * 0.4 }, { x: x + size, y: y - size * 0.55 }])];
}

function getCross(box: MarkBox): InkDrawing['strokes'] {
  const size = getTickSize(box);
  const x = box.x + box.width + TICK.gap;
  const y = box.y + box.height / 2 - size / 2;
  return [makeStroke([{ x, y }, { x: x + size, y: y + size }]), makeStroke([{ x: x + size, y }, { x, y: y + size }])];
}

export function getMarkReach(mark: AnnotationMark, box: MarkBox): MarkReach {
  if (mark === 'circle') {
    const across = RING.paddingX + getRingWander(box.width / 2 + RING.paddingX);
    const down = RING.paddingY + getRingWander(box.height / 2 + RING.paddingY);
    return { left: across, top: down, right: across, bottom: down };
  }
  if (mark === 'underline') return { left: 0, top: 0, right: 0, bottom: UNDERLINE.gap + UNDERLINE.wobble };
  return { left: 0, top: 0, right: TICK.gap + getTickSize(box), bottom: 0 };
}

/** Draws a teacher's mark around a box, and the seed keeps a replay identical. */
export function drawMark({ mark, box, seed }: { mark: AnnotationMark; box: MarkBox; seed: string }): InkDrawing['strokes'] {
  const random = makeSeededRandom(seed);
  switch (mark) {
    case 'circle':
      return getRing(box, random);
    case 'underline':
      return getUnderline(box, random);
    case 'check':
      return getCheck(box);
    case 'cross':
      return getCross(box);
  }
}
