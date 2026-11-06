import { describe, expect, it } from 'vitest';
import { getAlongPath, getFallPath, getOrbitPath, getRollOffPath, getSwingPath, getTiltPath, GRAVITY } from '../src/sketch/sketch-paths.ts';

const sample = (durationSeconds: number, count = 40) => Array.from({ length: count + 1 }, (_, index) => (index / count) * durationSeconds);

describe('a ball rolling off a table', () => {
  const start = { x: 2, y: 3 };
  const path = getRollOffPath({ start, edgeX: 5, floorY: 6, radius: 0.25, landsAfter: 2, gravity: GRAVITY });

  it('rolls level to the edge, then falls on a true parabola', () => {
    const speed = 2 / Math.sqrt((2 * (6 - 0.25 - 3)) / GRAVITY);
    for (const seconds of sample(path.durationSeconds)) {
      const { at } = path.getPoint(seconds);
      if (at.x <= 5) expect(at.y).toBeCloseTo(3, 9);
      else expect(at.y - 3).toBeCloseTo((GRAVITY / (2 * speed * speed)) * (at.x - 5) ** 2, 9);
    }
  });

  it('leaves the edge at its named moment and comes to rest on the floor where it was aimed', () => {
    expect(path.getPoint(path.moments.edge as number).at.x).toBeCloseTo(5, 9);
    expect(path.getPoint(path.durationSeconds).at).toEqual({ x: expect.closeTo(7, 9), y: expect.closeTo(5.75, 9) });
    expect(path.getPoint(path.durationSeconds + 5).at).toEqual(path.getPoint(path.durationSeconds).at);
  });
});

describe('a fall', () => {
  it('takes the time a real drop of that height takes', () => {
    const path = getFallPath({ start: { x: 1, y: 1 }, floorY: 5.9, radius: 0.1, gravity: GRAVITY });
    expect(path.durationSeconds).toBeCloseTo(Math.sqrt((2 * 4.8) / GRAVITY), 9);
    expect(path.getPoint(path.durationSeconds).at.y).toBeCloseTo(5.8, 9);
  });
});

describe('an orbit', () => {
  const path = getOrbitPath({ start: { x: 7, y: 4 }, center: { x: 5, y: 4 }, turns: 1, secondsPerTurn: 6 });

  it('keeps its distance from the centre and comes back to where it began', () => {
    for (const seconds of sample(path.durationSeconds)) {
      const { at } = path.getPoint(seconds);
      expect(Math.hypot(at.x - 5, at.y - 4)).toBeCloseTo(2, 9);
    }
    expect(path.getPoint(path.durationSeconds).at.x).toBeCloseTo(7, 9);
  });

  it('goes counterclockwise on the board, so a quarter turn from the right lands on top', () => {
    expect(path.getPoint(1.5).at).toEqual({ x: expect.closeTo(5, 9), y: expect.closeTo(2, 9) });
  });
});

describe('a pendulum', () => {
  const pivot = { x: 4, y: 1 };
  const path = getSwingPath({ start: { x: 4, y: 3.45 }, pivot, amplitudeRadians: 0.4, swings: 2, gravity: GRAVITY });

  it('swings with the period a real string of that length has', () => {
    expect(path.durationSeconds).toBeCloseTo(2 * 2 * Math.PI * Math.sqrt(2.45 / GRAVITY), 9);
  });

  it('keeps the bob at the end of its string and back at the bottom after each swing', () => {
    for (const seconds of sample(path.durationSeconds)) {
      const { at } = path.getPoint(seconds);
      expect(Math.hypot(at.x - pivot.x, at.y - pivot.y)).toBeCloseTo(2.45, 9);
    }
    expect(path.getPoint(path.moments.back as number).at.x).toBeCloseTo(4, 9);
  });

  it('reaches its full angle at the top of the swing and no further', () => {
    const angles = sample(path.durationSeconds, 400).map((seconds) => {
      const { at } = path.getPoint(seconds);
      return Math.atan2(at.x - pivot.x, at.y - pivot.y);
    });
    expect(Math.max(...angles)).toBeCloseTo(0.4, 4);
    expect(Math.min(...angles)).toBeCloseTo(-0.4, 4);
  });
});

describe('moving along a line and tipping about a pivot', () => {
  it('ends on the last point of the line', () => {
    const path = getAlongPath({ points: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 4 }], speed: 2 });
    expect(path.durationSeconds).toBeCloseTo(3.5, 9);
    expect(path.getPoint(1.5).at).toEqual({ x: 3, y: 0 });
    expect(path.getPoint(path.durationSeconds).at).toEqual({ x: 3, y: 4 });
  });

  it('keeps every point of a tipping beam at its distance from the pivot', () => {
    const path = getTiltPath({ start: { x: 7, y: 4 }, pivot: { x: 5, y: 4 }, radians: 0.3, seconds: 1 });
    const end = path.getPoint(1).at;
    expect(Math.hypot(end.x - 5, end.y - 4)).toBeCloseTo(2, 9);
    expect(Math.atan2(end.y - 4, end.x - 5)).toBeCloseTo(0.3, 9);
  });
});
