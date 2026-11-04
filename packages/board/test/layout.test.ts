import { describe, expect, it } from 'vitest';
import { type LayoutBox, type Placement, placeElements, placeMovingElements } from '../src/layout/place-elements.ts';

const LAPTOP = { width: 760, height: 620, padding: 24, gap: 16 };
const PHONE = { width: 358, height: 480, padding: 12, gap: 12 };

const line = (id: string, width: number, height: number): LayoutBox => ({ id, fit: 'line', width, height });
const figure = (id: string): LayoutBox => ({ id, fit: 'figure', width: 1000, height: 650 });

function overlaps(first: Placement, second: Placement): boolean {
  return first.x < second.x + second.width && second.x < first.x + first.width && first.y < second.y + second.height && second.y < first.y + first.height;
}

function getProblems(placements: readonly Placement[], area: typeof LAPTOP): string[] {
  const visible = placements.filter((placement) => placement.isVisible);
  const problems: string[] = [];
  visible.forEach((placement, index) => {
    if (placement.x < 0 || placement.y < 0 || placement.x + placement.width > area.width + 1e-6 || placement.y + placement.height > area.height + 1e-6) problems.push(`${placement.id} leaves the board`);
    for (const other of visible.slice(index + 1)) if (overlaps(placement, other)) problems.push(`${placement.id} overlaps ${other.id}`);
  });
  return problems;
}

// A small seeded generator, so a failure names a board that can be run again.
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function makeBoard(seed: number): LayoutBox[] {
  const random = makeRandom(seed);
  const count = 1 + Math.floor(random() * 14);
  return Array.from({ length: count }, (_, index) => {
    if (random() < 0.15) return figure(`figure-${index}`);
    return line(`line-${index}`, 20 + random() * 1600, 18 + random() * 900);
  });
}

describe('placeElements', () => {
  it('writes from the top down, and a new line leaves the older lines where they are', () => {
    const first = placeElements([line('a', 200, 40)], LAPTOP);
    const second = placeElements([line('a', 200, 40), line('b', 300, 60)], LAPTOP);
    expect(first[0]).toMatchObject({ x: 24, y: 24, scale: 1 });
    expect(second[0]).toEqual(first[0]);
    expect(second[1]).toMatchObject({ x: 24, y: 80, isVisible: true });
  });

  it('shrinks only what is wider than the board', () => {
    const [wide, narrow] = placeElements([line('wide', 1000, 40), line('narrow', 200, 40)], PHONE);
    expect(wide?.scale).toBeCloseTo(334 / 1000);
    expect(wide?.width).toBeCloseTo(334);
    expect(narrow?.scale).toBe(1);
  });

  it('fits an element taller than the board', () => {
    const [tall] = placeElements([line('tall', 100, 2000)], PHONE);
    expect(tall?.height).toBeCloseTo(456);
    expect(tall?.isVisible).toBe(true);
  });

  it('lets the oldest go whole when the board is full, and keeps the newest', () => {
    const boxes = Array.from({ length: 12 }, (_, index) => line(`line-${index}`, 200, 60));
    const placed = placeElements(boxes, PHONE);
    expect(placed.at(-1)?.isVisible).toBe(true);
    expect(placed[0]?.isVisible).toBe(false);
    expect(placed.filter((placement) => placement.isVisible)).toHaveLength(6);
    expect(getProblems(placed, PHONE)).toEqual([]);
  });

  it('gives a figure the height the lines leave, and keeps its shape', () => {
    const [title, scene] = placeElements([line('title', 200, 40), figure('scene')], LAPTOP);
    expect(scene?.y).toBe((title?.y ?? 0) + 40 + LAPTOP.gap);
    expect(scene?.width).toBeCloseTo(LAPTOP.width - 2 * LAPTOP.padding);
    expect((scene?.height ?? 0) / (scene?.width ?? 1)).toBeCloseTo(0.65);
  });

  it.each(Array.from({ length: 300 }, (_, seed) => [seed]))('never overlaps or leaves the board, seed %i', (seed) => {
    for (const area of [LAPTOP, PHONE]) expect(getProblems(placeElements(makeBoard(seed), area), area)).toEqual([]);
  });

  it('does not fail on an empty board or an empty box', () => {
    expect(placeElements([], PHONE)).toEqual([]);
    expect(getProblems(placeElements([line('empty', 0, 0)], PHONE), PHONE)).toEqual([]);
  });
});

describe('placeMovingElements', () => {
  const a = line('a', 200, 100);
  const small = line('b', 200, 40);
  const tall = line('b', 200, 120);
  const c = line('c', 200, 40);

  it('moves the lines below a growing element from the clock', () => {
    const boxes = [{ to: a, from: a }, { to: tall, from: small }, { to: c, from: c }];
    const place = (progress: number) => placeMovingElements(boxes, LAPTOP, progress).find((placement) => placement.id === 'c')?.y;
    expect(place(0)).toBe(24 + 100 + 16 + 40 + 16);
    expect(place(1)).toBe(24 + 100 + 16 + 120 + 16);
    expect(place(0.5)).toBe(24 + 100 + 16 + 80 + 16);
  });

  it('keeps an old line still when a new line arrives with room to spare', () => {
    const placed = placeMovingElements([{ to: a, from: a }, { to: c, from: null }], LAPTOP, 0.25);
    expect(placed[0]?.y).toBe(24);
    expect(placed[1]).toMatchObject({ y: 24 + 100 + 16, opacity: 1 });
  });

  it('slides an element leaving because the board filled up with the others, fading as it goes', () => {
    const lines = Array.from({ length: 6 }, (_, index) => line(`line-${index}`, 200, 60));
    const arriving = line('new', 200, 60);
    const boxes = [...lines.map((box) => ({ to: box, from: box })), { to: arriving, from: null }];
    const halfway = placeMovingElements(boxes, PHONE, 0.5);
    expect(halfway[0]).toMatchObject({ isVisible: true, opacity: 0.5, y: 12 - 36 });
    expect(halfway[1]?.y).toBeCloseTo(12 + 72 - 36);
    const done = placeMovingElements(boxes, PHONE, 1);
    expect(done[0]?.isVisible).toBe(false);
    expect(getProblems(done, PHONE)).toEqual([]);
  });

  it('never overlaps at any point of a rearrangement', () => {
    const boxes = [{ to: a, from: a }, { to: tall, from: small }, { to: c, from: c }];
    for (let step = 0; step <= 20; step += 1) expect(getProblems(placeMovingElements(boxes, LAPTOP, step / 20), LAPTOP)).toEqual([]);
  });
});
