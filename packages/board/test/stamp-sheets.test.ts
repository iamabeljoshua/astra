import { describe, expect, it } from 'vitest';
import { STAMP_NAMES, STAMP_SHEETS, type StampName } from '../src/sketch/stamp-sheets.ts';

const SHEET_WIDTH = 100;

const PART_NAMES: Record<StampName, readonly string[]> = {
  ball: ['ball'],
  person: ['head', 'hand', 'foot'],
  car: ['body', 'front-wheel', 'back-wheel'],
  table: ['top', 'leg'],
  ramp: ['slope', 'top'],
  hill: ['top', 'slope'],
  house: ['roof', 'door', 'wall'],
  tree: ['top', 'trunk'],
  sun: ['sun'],
};

const RESTS_ON_ITS_CENTRE: readonly StampName[] = ['ball', 'sun'];

type Position = { x: number; y: number };

const isOnSheet = (height: number) => ({ x, y }: Position) => x >= 0 && x <= SHEET_WIDTH && y >= 0 && y <= height;

describe.each(STAMP_NAMES)('the %s stamp', (name) => {
  const sheet = STAMP_SHEETS[name];
  const ink = sheet.strokes.flat();

  it('draws at least one stroke, all of it on a 100 wide sheet', () => {
    expect(sheet.height).toBeGreaterThan(0);
    expect(sheet.strokes.length).toBeGreaterThan(0);
    expect(sheet.strokes.filter((stroke) => stroke.length < 2)).toEqual([]);
    expect(ink.filter((point) => !isOnSheet(sheet.height)(point))).toEqual([]);
  });

  it('has no NaN or infinity anywhere', () => {
    const numbers = [sheet.height, ...[...ink, sheet.base, ...sheet.surface].flatMap(({ x, y }) => [x, y]), ...Object.values(sheet.parts).flatMap(({ x, y, radius }) => [x, y, radius])];
    expect(numbers.filter((value) => !Number.isFinite(value))).toEqual([]);
  });

  it('names its parts and keeps each one inside the sheet', () => {
    expect(Object.keys(sheet.parts).sort()).toEqual([...PART_NAMES[name]].sort());
    const outside = Object.entries(sheet.parts).filter(([, { x, y, radius }]) => radius <= 0 || x - radius < 0 || x + radius > SHEET_WIDTH || y - radius < 0 || y + radius > sheet.height);
    expect(outside).toEqual([]);
  });

  it('rests on a base inside the sheet', () => {
    expect(isOnSheet(sheet.height)(sheet.base)).toBe(true);
    const lowest = Math.max(...ink.map(({ y }) => y));
    const highest = Math.min(...ink.map(({ y }) => y));
    expect(sheet.base.y).toBeCloseTo(RESTS_ON_ITS_CENTRE.includes(name) ? (highest + lowest) / 2 : lowest, 1);
  });

  it('offers a surface that runs left to right inside the sheet', () => {
    expect(sheet.surface.length).toBeGreaterThanOrEqual(2);
    expect(sheet.surface.filter((point) => !isOnSheet(sheet.height)(point))).toEqual([]);
    expect(sheet.surface.slice(1).filter((point, index) => point.x <= (sheet.surface[index] as Position).x)).toEqual([]);
  });
});
