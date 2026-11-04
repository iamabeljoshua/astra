import type { AnnotationMark } from '@astra/contracts';
import { type InkDrawing, type InkPosition, getSpread, makeSeededRandom, makeStroke } from './ink-stroke.ts';

export interface MarkBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

const RING = { paddingX: 5, paddingY: 2, steps: 44, startRadians: -2.2, overlapRadians: 0.55, wobble: 0.035, wobbleRate: 0.7, wobblePhase: 0.6, growth: 0.05 };
const UNDERLINE = { steps: 8, gap: 3, wobble: 1.1 };
const TICK = { sizeEms: 0.7, gap: 8 };

// A loose loop in one stroke, a little past where it began, so it reads as a pen and not a shape.
function getRing(box: MarkBox, random: () => number): InkDrawing['strokes'] {
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  const radiusX = box.width / 2 + RING.paddingX;
  const radiusY = box.height / 2 + RING.paddingY;
  const phase = random() * RING.wobblePhase;
  const points: InkPosition[] = Array.from({ length: RING.steps + 1 }, (_, step) => {
    const angle = RING.startRadians + (step / RING.steps) * (2 * Math.PI + RING.overlapRadians);
    const wander = 1 + RING.wobble * Math.sin(step * RING.wobbleRate + phase) + (step / RING.steps) * RING.growth;
    return { x: centerX + Math.cos(angle) * radiusX * wander, y: centerY + Math.sin(angle) * radiusY * wander };
  });
  return [makeStroke(points)];
}

function getUnderline(box: MarkBox, random: () => number): InkDrawing['strokes'] {
  const y = box.y + box.height + UNDERLINE.gap;
  const points = Array.from({ length: UNDERLINE.steps + 1 }, (_, step) => ({ x: box.x + (step / UNDERLINE.steps) * box.width, y: y + getSpread(random, UNDERLINE.wobble) }));
  return [makeStroke(points)];
}

function getCheck(box: MarkBox): InkDrawing['strokes'] {
  const size = box.height * TICK.sizeEms;
  const x = box.x + box.width + TICK.gap;
  const y = box.y + box.height / 2;
  return [makeStroke([{ x, y }, { x: x + size * 0.35, y: y + size * 0.4 }, { x: x + size, y: y - size * 0.55 }])];
}

function getCross(box: MarkBox): InkDrawing['strokes'] {
  const size = box.height * TICK.sizeEms;
  const x = box.x + box.width + TICK.gap;
  const y = box.y + box.height / 2 - size / 2;
  return [makeStroke([{ x, y }, { x: x + size, y: y + size }]), makeStroke([{ x: x + size, y }, { x, y: y + size }])];
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
