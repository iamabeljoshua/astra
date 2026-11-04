import { crc32, deflateSync } from 'node:zlib';
import type { InkPoint } from '@astra/contracts';

const PIXELS_PER_BAND = 1400;
const LARGEST_SIDE = 1000;
const PADDING = 22;
const PEN_RADIUS = 3;
const MOST_POINTS = 6000;
const MOST_STAMPS = 60000;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const GREYSCALE_8_BIT = [8, 0, 0, 0, 0];

function makeChunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const check = Buffer.alloc(4);
  check.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, check]);
}

function encodeGreyPng(pixels: Uint8Array, width: number, height: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set(GREYSCALE_8_BIT, 8);
  const rows = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y += 1) rows.set(pixels.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
  return Buffer.concat([PNG_SIGNATURE, makeChunk('IHDR', header), makeChunk('IDAT', deflateSync(rows)), makeChunk('IEND', Buffer.alloc(0))]);
}

function stamp(pixels: Uint8Array, width: number, height: number, centerX: number, centerY: number): void {
  for (let y = Math.max(0, Math.floor(centerY - PEN_RADIUS)); y <= Math.min(height - 1, Math.ceil(centerY + PEN_RADIUS)); y += 1) {
    for (let x = Math.max(0, Math.floor(centerX - PEN_RADIUS)); x <= Math.min(width - 1, Math.ceil(centerX + PEN_RADIUS)); x += 1) {
      if (Math.hypot(x - centerX, y - centerY) <= PEN_RADIUS) pixels[y * width + x] = 0;
    }
  }
}

function drawStroke(pixels: Uint8Array, { width, height, stampsLeft }: { width: number; height: number; stampsLeft: number }, points: readonly { x: number; y: number }[]): number {
  let left = stampsLeft;
  points.forEach((point, index) => {
    const before = points[index - 1] ?? point;
    const steps = Math.max(1, Math.ceil(Math.hypot(point.x - before.x, point.y - before.y) / PEN_RADIUS));
    for (let step = 0; step <= steps && left > 0; step += 1) {
      stamp(pixels, width, height, before.x + ((point.x - before.x) * step) / steps, before.y + ((point.y - before.y) * step) / steps);
      left -= 1;
    }
  });
  return left;
}

/** Draws only the ink, cropped and on white, so the picture costs a few hundred tokens. */
export function rasterizeInk(strokes: readonly (readonly InkPoint[])[]): Buffer | null {
  const all = strokes.flat().slice(0, MOST_POINTS);
  if (all.length === 0) return null;
  const [xs, ys] = [all.map((point) => point[0]), all.map((point) => point[1])];
  const [left, right, top, bottom] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const scale = Math.min(PIXELS_PER_BAND, (LARGEST_SIDE - 2 * PADDING) / Math.max(right - left, bottom - top, 1 / PIXELS_PER_BAND));
  const width = Math.ceil((right - left) * scale) + 2 * PADDING;
  const height = Math.ceil((bottom - top) * scale) + 2 * PADDING;
  const pixels = new Uint8Array(width * height).fill(255);
  let budget = MOST_POINTS;
  let stampsLeft = MOST_STAMPS;
  for (const stroke of strokes) {
    const kept = stroke.slice(0, Math.max(0, budget));
    budget -= kept.length;
    stampsLeft = drawStroke(pixels, { width, height, stampsLeft }, kept.map(([x, y]) => ({ x: (x - left) * scale + PADDING, y: (y - top) * scale + PADDING })));
  }
  return encodeGreyPng(pixels, width, height);
}
