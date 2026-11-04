import { act, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readDrawnLabels, stubCanvas } from '../../test/fakeCanvas';
import { fakeFonts, notifyResizeObservers } from '../../test/fakeLayout';
import { getChartLayout, WIDE_LAYOUT_FROM } from './chartLayout';
import { LIT_STAR_SPOTS, PATH_LEG_COUNT } from './chartStars';
import { DOT_DRAWINGS } from './dotDrawings';
import type { DotPoint } from './dotPoint';
import { DotStage } from './DotStage';
import { createDotSwarm, getDotPosition, isSwarmSettled, placeDots, scatterDots, sendDots } from './dotSwarm';
import { textToDots } from './textToDots';

const LEFT_POINTS: DotPoint[] = [[-0.5, 0]];
const RIGHT_POINTS: DotPoint[] = [[0.5, 0]];
const POSITION_TOLERANCE = 0.02;
const DOTS_SURELY_ARRIVED_MS = 60_000;
const SPACE_STAR = [{ label: 'Space', spot: 6 }];

describe('the drawings', () => {
  it.each(Object.entries(DOT_DRAWINGS))('%s stays inside the shape box', (_name, points) => {
    expect(points.length).toBeGreaterThan(0);
    for (const [x, y] of points) {
      expect(Math.abs(x)).toBeLessThanOrEqual(1);
      expect(Math.abs(y)).toBeLessThanOrEqual(1);
    }
  });

  it('draws the planet with near dots larger than far ones', () => {
    const sizes = DOT_DRAWINGS.planet.map(([, , size]) => size ?? 1);

    expect(Math.max(...sizes)).toBeGreaterThan(1);
    expect(Math.min(...sizes)).toBeLessThan(0.7);
  });

  it('shades the planet by how many dots land on it, more on the lit side', () => {
    const sphere = DOT_DRAWINGS.planet.filter(([x, y]) => Math.hypot(x, y) < 0.42);
    const [litSide, darkSide] = [sphere.filter(([x, y]) => x + y < 0), sphere.filter(([x, y]) => x + y > 0)];

    expect(litSide.length).toBeGreaterThan(darkSide.length * 2);
  });

  it('keeps every far ring dot clear of the planet, so the rings pass behind it', () => {
    const farDots = DOT_DRAWINGS.planet.filter(([, , size]) => size === 0.72);

    expect(farDots.length).toBeGreaterThan(0);
    for (const [x, y] of farDots) expect(Math.hypot(x, y)).toBeGreaterThan(0.44);
  });
});

describe('getChartLayout', () => {
  it.each([[1021], [1280], [1440], [1920]])('keeps the first star clear of the question at %i wide', (width) => {
    const { center, starSpread } = getChartLayout(width, 800);

    expect(center.x + LIT_STAR_SPOTS.wide[5]![0] * starSpread.x).toBeGreaterThan(width * 0.42);
    expect(center.x - 0.86 * starSpread.x).toBeGreaterThanOrEqual(width * 0.42);
    expect(center.x + 0.9 * starSpread.x).toBeLessThanOrEqual(width);
  });

  it.each([[320], [390], [760], [WIDE_LAYOUT_FROM - 1]])('keeps a band across the top at %i wide, below the header', (width) => {
    const { isWide, center, starSpread } = getChartLayout(width, 844);

    expect(isWide).toBe(false);
    expect(center.y - 0.66 * starSpread.y).toBeGreaterThanOrEqual(62);
    expect(center.y + 0.62 * starSpread.y).toBeLessThanOrEqual(276);
    expect(center.x - 0.86 * starSpread.x).toBeGreaterThanOrEqual(0);
    expect(center.x + 0.9 * starSpread.x).toBeLessThanOrEqual(width);
  });

  it('changes layout at the breakpoint the page itself uses', () => {
    const themeCss = readFileSync(join(import.meta.dirname, '../../../../../packages/theme/src/theme.css'), 'utf8');

    expect(themeCss).toContain(`--breakpoint-lg: ${WIDE_LAYOUT_FROM}px;`);
  });

  it('draws smaller dots on a phone', () => {
    expect(getChartLayout(390, 844).dotRadius).toBeLessThan(getChartLayout(1280, 800).dotRadius);
  });
});

describe('the swarm', () => {
  it('sits where it was placed, with nothing left to do', () => {
    const swarm = createDotSwarm(1);
    placeDots(swarm, LEFT_POINTS);

    expect(getDotPosition(swarm, 0, 500)[0]).toBeCloseTo(-0.5, 1);
    expect(isSwarmSettled(swarm, 0)).toBe(true);
  });

  it('moves by the clock and arrives, then says it has settled', () => {
    const swarm = createDotSwarm(1);
    placeDots(swarm, LEFT_POINTS);
    const startedAt = 10_000;

    sendDots(swarm, RIGHT_POINTS, startedAt);

    expect(getDotPosition(swarm, 0, startedAt)[0]).toBeLessThan(-0.45);
    expect(isSwarmSettled(swarm, startedAt + 100)).toBe(false);
    expect(isSwarmSettled(swarm, startedAt + 3000)).toBe(true);
    expect(Math.abs(getDotPosition(swarm, 0, startedAt + 3000)[0] - 0.5)).toBeLessThan(POSITION_TOLERANCE);
  });

  it('turns from where a dot is when a new shape arrives on the way', () => {
    const swarm = createDotSwarm(1);
    placeDots(swarm, LEFT_POINTS);
    sendDots(swarm, RIGHT_POINTS, 10_000);
    const midway = getDotPosition(swarm, 0, 10_500)[0];

    sendDots(swarm, LEFT_POINTS, 10_500);

    expect(getDotPosition(swarm, 0, 10_500)[0]).toBeCloseTo(midway, 5);
  });

  it('carries a dot from its size to the size of its new place', () => {
    const swarm = createDotSwarm(1);
    placeDots(swarm, [[0, 0, 0.5]]);
    const startedAt = 10_000;

    sendDots(swarm, [[0, 0, 1.5]], startedAt);

    expect(getDotPosition(swarm, 0, startedAt)[2]).toBeCloseTo(0.5, 5);
    expect(getDotPosition(swarm, 0, startedAt + 3000)[2]).toBeCloseTo(1.5, 1);
  });

  it('starts scattered when asked, so the dots can gather', () => {
    const swarm = createDotSwarm(40);
    scatterDots(swarm);

    const positions = Array.from({ length: 40 }, (_unused, dot) => getDotPosition(swarm, dot, 0)[0]);

    expect(new Set(positions).size).toBeGreaterThan(30);
  });
});

function countPaintedArcs(context: CanvasRenderingContext2D, paint: () => void) {
  vi.mocked(context.arc).mockClear();
  paint();
  return vi.mocked(context.arc).mock.calls.length;
}

describe('DotStage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('gives a browser with no canvas a working page, with the chart title', () => {
    render(<DotStage shape={LEFT_POINTS} chartTitle="The title"><p>The question</p></DotStage>);

    screen.getByRole('main');
    screen.getByText('The question');
    screen.getByText('The title');
  });

  it('gives a browser that throws when asked for a canvas a working page', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      throw new Error('This browser refuses a canvas.');
    });

    render(<DotStage shape={LEFT_POINTS}><p>The question</p></DotStage>);

    screen.getByRole('main');
    screen.getByText('The question');
  });

  describe('with a canvas', () => {
    let requestFrame: ReturnType<typeof vi.fn>;
    let contexts: CanvasRenderingContext2D[];

    function getLiveContext() {
      return contexts[1]!;
    }

    function runFrameAfterEverythingArrived() {
      const paintFrame = requestFrame.mock.calls.at(-1)![0] as FrameRequestCallback;
      vi.spyOn(performance, 'now').mockReturnValue(performance.now() + DOTS_SURELY_ARRIVED_MS);
      paintFrame(0);
    }

    function stubReducedMotion() {
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
    }

    beforeEach(() => {
      contexts = stubCanvas();
      requestFrame = vi.fn(() => 1);
      vi.stubGlobal('requestAnimationFrame', requestFrame);
      vi.stubGlobal('cancelAnimationFrame', vi.fn());
    });

    it('asks for no frames at rest, however long it stays', () => {
      render(<DotStage shape={LEFT_POINTS} />);

      expect(requestFrame).not.toHaveBeenCalled();
    });

    it('labels all eight subject stars', () => {
      render(<DotStage shape={LEFT_POINTS} />);

      expect(readDrawnLabels(getLiveContext()).slice(0, 8)).toEqual(['MOTION', 'LIGHT', 'WAVES', 'MUSIC', 'CELLS', 'CODE', 'STARS', 'HISTORY']);
    });

    it('asks for frames when the shape changes, and only then', () => {
      const { rerender } = render(<DotStage shape={LEFT_POINTS} />);

      rerender(<DotStage shape={LEFT_POINTS} />);
      expect(requestFrame).not.toHaveBeenCalled();
      rerender(<DotStage shape={RIGHT_POINTS} />);

      expect(requestFrame).toHaveBeenCalledTimes(1);
    });

    it('stops asking for frames once the dots have arrived', () => {
      const { rerender } = render(<DotStage shape={LEFT_POINTS} />);
      rerender(<DotStage shape={RIGHT_POINTS} />);

      runFrameAfterEverythingArrived();

      expect(requestFrame).toHaveBeenCalledTimes(1);
    });

    it('keeps asking for frames while the dots are on their way', () => {
      const { rerender } = render(<DotStage shape={LEFT_POINTS} />);
      rerender(<DotStage shape={RIGHT_POINTS} />);
      const paintFrame = requestFrame.mock.calls[0]![0] as FrameRequestCallback;

      paintFrame(0);

      expect(requestFrame).toHaveBeenCalledTimes(2);
    });

    it('gathers the dots on arrival when the page asks, and still settles', () => {
      render(<DotStage shape={LEFT_POINTS} legsDrawn={1} formsOnArrival />);
      expect(requestFrame).toHaveBeenCalledTimes(1);

      runFrameAfterEverythingArrived();

      expect(requestFrame).toHaveBeenCalledTimes(1);
    });

    it('places everything at once under reduced motion, on arrival and on a change', () => {
      stubReducedMotion();
      const { rerender } = render(<DotStage shape={LEFT_POINTS} legsDrawn={1} formsOnArrival />);

      rerender(<DotStage shape={RIGHT_POINTS} legsDrawn={2} litStars={SPACE_STAR} />);

      expect(requestFrame).not.toHaveBeenCalled();
    });

    it('keeps the shape it has when given no points', () => {
      const { rerender } = render(<DotStage shape={LEFT_POINTS} />);

      rerender(<DotStage shape={[]} />);

      expect(requestFrame).not.toHaveBeenCalled();
    });

    it('draws more of the path for each leg, up to a finished path', () => {
      stubReducedMotion();
      const { rerender } = render(<DotStage shape={LEFT_POINTS} legsDrawn={1} />);

      const dotCounts = [2, 3, 4, 5, 6, PATH_LEG_COUNT].map((legsDrawn) => countPaintedArcs(getLiveContext(), () => rerender(<DotStage shape={LEFT_POINTS} legsDrawn={legsDrawn} />)));

      expect(dotCounts).toEqual([...dotCounts].sort((first, second) => first - second));
      expect(new Set(dotCounts).size).toBe(dotCounts.length);
    });

    it('glides to the next leg on the frames it asks for', () => {
      const { rerender } = render(<DotStage shape={LEFT_POINTS} legsDrawn={1} />);

      rerender(<DotStage shape={LEFT_POINTS} legsDrawn={2} />);
      expect(requestFrame).toHaveBeenCalledTimes(1);

      runFrameAfterEverythingArrived();
      expect(requestFrame).toHaveBeenCalledTimes(1);
    });

    it('lights a labelled star when one is added, and takes it away again', () => {
      const { rerender } = render(<DotStage shape={LEFT_POINTS} />);

      rerender(<DotStage shape={LEFT_POINTS} litStars={SPACE_STAR} />);
      expect(readDrawnLabels(getLiveContext())).toContain('SPACE');
      expect(requestFrame).toHaveBeenCalledTimes(1);

      vi.mocked(getLiveContext().fillText).mockClear();
      rerender(<DotStage shape={LEFT_POINTS} litStars={[]} />);
      expect(readDrawnLabels(getLiveContext())).not.toContain('SPACE');
    });

    it('stops asking for frames once a star has lit', () => {
      const { rerender } = render(<DotStage shape={LEFT_POINTS} />);
      rerender(<DotStage shape={LEFT_POINTS} litStars={SPACE_STAR} />);

      runFrameAfterEverythingArrived();

      expect(requestFrame).toHaveBeenCalledTimes(1);
    });

    it('repaints on a resize without asking for frames', () => {
      render(<DotStage shape={LEFT_POINTS} />);
      const clears = vi.mocked(getLiveContext().clearRect);
      clears.mockClear();

      notifyResizeObservers();

      expect(clears).toHaveBeenCalled();
      expect(requestFrame).not.toHaveBeenCalled();
    });

    it('repaints in the other theme without asking for frames', async () => {
      render(<DotStage shape={LEFT_POINTS} />);
      const clears = vi.mocked(getLiveContext().clearRect);
      clears.mockClear();

      document.documentElement.dataset.theme = 'dark';
      await act(() => new Promise(setImmediate));

      expect(clears).toHaveBeenCalled();
      expect(requestFrame).not.toHaveBeenCalled();
    });
  });
});

describe('textToDots', () => {
  const [PAPER_WIDTH, PAPER_HEIGHT] = [960, 420];
  const SOLID = 255;

  function getPaper(getAlpha: (x: number, y: number) => number) {
    const data = new Uint8ClampedArray(PAPER_WIDTH * PAPER_HEIGHT * 4);
    for (let y = 0; y < PAPER_HEIGHT; y += 1) {
      for (let x = 0; x < PAPER_WIDTH; x += 1) data[(y * PAPER_WIDTH + x) * 4 + 3] = getAlpha(x, y);
    }
    return { data };
  }

  function stubPaper(getImageData: () => { data: Uint8ClampedArray }) {
    const fillText = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({ font: '', measureText: () => ({ width: 100 }), fillText, getImageData }) as never);
    return fillText;
  }

  function stubCenterInk() {
    return stubPaper(() => getPaper((x, y) => (x === PAPER_WIDTH / 2 && y === PAPER_HEIGHT / 2 ? SOLID : 0)));
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('gives no points in a browser with no canvas', async () => {
    expect(await textToDots('Maya')).toEqual([]);
  });

  it('gives no points in a browser that throws when asked for a canvas', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      throw new Error('This browser refuses a canvas.');
    });

    expect(await textToDots('Maya')).toEqual([]);
  });

  it('gives no points when the canvas read throws', async () => {
    stubPaper(() => {
      throw new DOMException('Blocked by this browser', 'SecurityError');
    });

    expect(await textToDots('Maya')).toEqual([]);
  });

  it.each<[string, (x: number) => number]>([
    ['one solid pixel in eight, the thinnest noise a hardened Firefox gives', (x) => (x % 8 === 0 ? SOLID : 0)],
    ['half the pixels solid, a common hardened Firefox answer', (x) => (x % 2 === 0 ? SOLID : 0)],
    ['every pixel solid, as an all-white answer', () => SOLID],
  ])('gives no points when the read answers with %s', async (_caseName, getAlpha) => {
    stubPaper(() => getPaper((x) => getAlpha(x)));

    expect(await textToDots('Maya')).toEqual([]);
  });

  it('turns the ink on a hidden canvas into points in the shape space', async () => {
    stubCenterInk();

    expect(await textToDots('Maya')).toEqual([[0, 0, 1.05]]);
  });

  it('keeps a name that fills all the width a name may take', async () => {
    const [leftEdge, rightEdge] = [42, 918];
    stubPaper(() => getPaper((x, y) => ((x === leftEdge || x === rightEdge) && y === 210 ? SOLID : 0)));

    expect(await textToDots('Maya')).toHaveLength(2);
  });

  it('draws only after the font for this name has come', async () => {
    let finishLoading = () => {};
    const load = vi.spyOn(fakeFonts, 'load').mockReturnValue(new Promise<never[]>((resolve) => (finishLoading = () => resolve([]))));
    const fillText = stubCenterInk();

    const dots = textToDots('Ṣadé');
    await act(() => new Promise(setImmediate));

    expect(load).toHaveBeenCalledWith(expect.any(String), 'Ṣadé');
    expect(fillText).not.toHaveBeenCalled();

    finishLoading();

    expect(await dots).toEqual([[0, 0, 1.05]]);
  });

  it('still draws when the font does not come', async () => {
    vi.spyOn(fakeFonts, 'load').mockRejectedValue(new Error('The font was blocked.'));
    stubCenterInk();

    expect(await textToDots('Maya')).toEqual([[0, 0, 1.05]]);
  });

  it('asks nothing of the canvas with no name', async () => {
    const fillText = stubCenterInk();

    expect(await textToDots('')).toEqual([]);
    expect(fillText).not.toHaveBeenCalled();
  });
});
