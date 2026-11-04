import { describe, expect, it } from 'vitest';
import { STUDENT_INTEREST_LABELS } from '../../strings';
import { type ChartLayout, getChartLayout } from './chartLayout';
import { LIT_STAR_SPOTS } from './chartStars';

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const INTEREST_NAMES = Object.values(STUDENT_INTEREST_LABELS).map((label) => label.toUpperCase());
const STAR_REACH = 8;
const LABEL_GAP = 7;
const LABEL_ABOVE_STAR = 5;
const LABEL_CHARACTER_WIDTH = { wide: 8.4, band: 7.5 };
const LABEL_HEIGHT = { wide: 11, band: 9.5 };

function getStarBoxes(spot: readonly [number, number], name: string, layout: ChartLayout): Box[] {
  const [x, y] = [layout.center.x + spot[0] * layout.starSpread.x, layout.center.y + spot[1] * layout.starSpread.y];
  const labelWidth = name.length * (layout.isWide ? LABEL_CHARACTER_WIDTH.wide : LABEL_CHARACTER_WIDTH.band);
  const isFlipped = x > layout.center.x + layout.starSpread.x * 0.5;
  const labelStart = isFlipped ? x - STAR_REACH - LABEL_GAP - labelWidth : x + STAR_REACH + LABEL_GAP;
  const labelBottom = y - LABEL_ABOVE_STAR;
  const labelHeight = layout.isWide ? LABEL_HEIGHT.wide : LABEL_HEIGHT.band;
  return [
    { left: x - STAR_REACH, right: x + STAR_REACH, top: y - STAR_REACH, bottom: y + STAR_REACH },
    { left: labelStart, right: labelStart + labelWidth, top: labelBottom - labelHeight, bottom: labelBottom },
  ];
}

function doBoxesTouch(first: Box, second: Box) {
  return first.left < second.right && second.left < first.right && first.top < second.bottom && second.top < first.bottom;
}

function findOverlaps(layout: ChartLayout) {
  const spots = layout.isWide ? LIT_STAR_SPOTS.wide : LIT_STAR_SPOTS.band;
  const stars = spots.map((spot, index) => ({ name: INTEREST_NAMES[index] ?? '', boxes: getStarBoxes(spot, INTEREST_NAMES[index] ?? '', layout) }));
  return stars.flatMap((first, index) =>
    stars
      .slice(index + 1)
      .filter((second) => first.boxes.some((box) => second.boxes.some((other) => doBoxesTouch(box, other))))
      .map((second) => `${first.name} over ${second.name}`),
  );
}

describe('the lit stars', () => {
  it.each([['wide', LIT_STAR_SPOTS.wide], ['band', LIT_STAR_SPOTS.band]])('gives every interest its own %s spot', (_name, spots) => {
    expect(spots).toHaveLength(INTEREST_NAMES.length);
    expect(new Set(spots.map(String)).size).toBe(spots.length);
  });

  it.each([[1280, 720], [1280, 800], [1366, 768], [1440, 900], [1920, 1080], [360, 780], [390, 844], [430, 932]])('keeps all twelve labels apart at %i by %i', (width, height) => {
    expect(findOverlaps(getChartLayout(width, height))).toEqual([]);
  });

  it.each([[390, 844], [1280, 800]])('keeps every star inside the page at %i by %i', (width, height) => {
    const layout = getChartLayout(width, height);
    const spots = layout.isWide ? LIT_STAR_SPOTS.wide : LIT_STAR_SPOTS.band;

    for (const [index, spot] of spots.entries()) {
      for (const box of getStarBoxes(spot, INTEREST_NAMES[index] ?? '', layout)) {
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(width);
      }
    }
  });
});
