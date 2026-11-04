import { describe, expect, it } from 'vitest';
import { STUDENT_INTEREST_LABELS } from '../../strings';
import { type ChartLayout, getChartLayout } from './chartLayout';
import { LIT_STAR_SPOTS, SUBJECT_STARS } from './chartStars';

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
const PATH_SAMPLES = 60;

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

function getPathDots({ center, starSpread }: ChartLayout) {
  const stars = SUBJECT_STARS.map(({ spot }) => ({ x: center.x + spot[0] * starSpread.x, y: center.y + spot[1] * starSpread.y }));
  return stars.slice(1).flatMap((to, leg) => {
    const from = stars[leg] ?? to;
    return Array.from({ length: PATH_SAMPLES }, (_unused, sample) => {
      const progress = sample / PATH_SAMPLES;
      return { x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * progress };
    });
  });
}

function findStarsOnThePath(layout: ChartLayout) {
  const spots = layout.isWide ? LIT_STAR_SPOTS.wide : LIT_STAR_SPOTS.band;
  const pathDots = getPathDots(layout);
  return INTEREST_NAMES.filter((name, index) => {
    const boxes = getStarBoxes(spots[index] ?? [0, 0], name, layout);
    return boxes.some((box) => pathDots.some(({ x, y }) => x > box.left && x < box.right && y > box.top && y < box.bottom));
  });
}

describe('the lit stars', () => {
  it.each([['wide', LIT_STAR_SPOTS.wide], ['band', LIT_STAR_SPOTS.band]])('gives every interest its own %s spot', (_name, spots) => {
    expect(spots).toHaveLength(INTEREST_NAMES.length);
    expect(new Set(spots.map(String)).size).toBe(spots.length);
  });

  it.each([[1280, 720], [1280, 800], [1366, 768], [1440, 900], [1920, 1080], [360, 780], [390, 844], [430, 932]])('keeps all twelve labels apart at %i by %i', (width, height) => {
    expect(findOverlaps(getChartLayout(width, height))).toEqual([]);
  });

  it.each([[1280, 720], [1280, 800], [1366, 768], [1440, 900], [1920, 1080], [360, 780], [390, 844], [430, 932]])('keeps every star and label off the path at %i by %i', (width, height) => {
    expect(findStarsOnThePath(getChartLayout(width, height))).toEqual([]);
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
