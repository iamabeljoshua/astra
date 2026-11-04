import { describe, expect, it } from 'vitest';
import { createGathering, getGatherDot, RETURN_MS } from './gatherDots';

const gathering = createGathering(900, 700);
const moment = (gatheredMs: number | null, returnedMs: number | null = null, turnedMs = gatheredMs ?? 0) => ({ gatheredMs, returnedMs, turnedMs });
const place = (dot: (typeof gathering.dots)[number], at: ReturnType<typeof moment>) => getGatherDot(gathering, dot, at);

describe('the dots gathering into Saturn', () => {
  it('starts every dot on a dot of the still grid', () => {
    for (const dot of gathering.dots) {
      const placed = place(dot, moment(0));
      if (!placed) continue;
      expect(gathering.grid.some(({ x, y }) => x === placed[0] && y === placed[1])).toBe(true);
    }
  });

  it('is only partly gathered at a second and a half, and whole by six seconds', () => {
    const body = gathering.dots.filter((dot) => dot.body);
    const distanceToSpot = (at: number) => body.reduce((sum, dot) => {
      const placed = place(dot, moment(at)) as [number, number, number, number];
      const whole = place(dot, moment(100_000, null, 0)) as [number, number, number, number];
      return sum + Math.hypot(placed[0] - whole[0], placed[1] - whole[1]);
    }, 0);
    expect(distanceToSpot(1500)).toBeGreaterThan(distanceToSpot(0) * 0.25);
    expect(distanceToSpot(6000)).toBe(0);
  });

  it('keeps its rings turning however long the wait, and its body still', () => {
    const body = gathering.dots.find((dot) => dot.body);
    const ring = gathering.dots.find((dot) => dot.ring && place(dot, moment(9000)) && place(dot, moment(9500)));
    expect(place(body as never, moment(9000))).toEqual(place(body as never, moment(60_000)));
    expect(place(ring as never, moment(9000))).not.toEqual(place(ring as never, moment(9500)));
  });

  it('brings every dot home to the grid when the tutor connects, however far it got', () => {
    for (const gatheredMs of [300, 1500, 8000]) {
      for (const dot of gathering.dots) {
        const placed = place(dot, moment(gatheredMs, RETURN_MS));
        if (placed) expect([placed[0], placed[1]]).toEqual([dot.home.x, dot.home.y]);
      }
    }
  });

  it('shows Saturn at once for a picture that does not move', () => {
    const body = gathering.dots.find((dot) => dot.body);
    expect(place(body as never, moment(null, null, 0))).toEqual(place(body as never, moment(100_000)));
  });

  it('fits a phone', () => {
    const small = createGathering(358, 400);
    expect(small.scale).toBeLessThan(small.center.x);
  });
});
