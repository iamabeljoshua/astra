import type { AnnotationMark } from '@astra/contracts';
import { type InkDrawing, type InkPosition, getSpread, makeSeededRandom, makeStroke } from './ink-stroke.ts';

export interface MarkBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

const RING = { steps: 26, paddingX: 7, paddingY: 4, wobble: 0.035, overlapRadians: 0.5, startRadians: -2.2 };
const UNDERLINE = { steps: 8, gap: 3, wobble: 1.1 };
const TICK = { sizeEms: 0.7, gap: 8 , largest: 30 };

function getRing(box: MarkBox, random: () => number): InkDrawing['strokes'] {
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  const radiusX = box.width / 2 + RING.paddingX;
  const radiusY = box.height / 2 + RING.paddingY;
  const points: InkPosition[] = Array.from({ length: RING.steps + 1 }, (_, step) => {
    const angle = RING.startRadians + (step / RING.steps) * (2 * Math.PI + RING.overlapRadians);
    const wander = 1 + getSpread(random, RING.wobble) + (step / RING.steps) * RING.wobble;
    return { x: centerX + Math.cos(angle) * radiusX * wander, y: centerY + Math.sin(angle) * radiusY * wander };
  });
  return [makeStroke(points)];
}

function getUnderline(box: MarkBox, random: () => number): InkDrawing['strokes'] {
  const y = box.y + box.height + UNDERLINE.gap;
  const points = Array.from({ length: UNDERLINE.steps + 1 }, (_, step) => ({ x: box.x + (step / UNDERLINE.steps) * box.width, y: y + getSpread(random, UNDERLINE.wobble) }));
  return [makeStroke(points)];
}

// A tick is the size of a line of writing, even on something tall, such as a list of slots.
const getTickSize = (box: MarkBox) => Math.min(box.height * TICK.sizeEms, TICK.largest);

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
