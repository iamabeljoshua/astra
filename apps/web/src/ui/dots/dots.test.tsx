import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyResizeObservers } from '../../test/fakeLayout';
import { DOT_DRAWINGS, type DotPoint } from './dotDrawings';
import { getDotLayout, getShapeBoxSize } from './dotLayout';
import { DotStage } from './DotStage';
import { createDotSwarm, getDotPosition, isSwarmSettled, placeDots, sendDots } from './dotSwarm';
import { textToDots } from './textToDots';

const LEFT_POINTS: DotPoint[] = [[-0.5, 0]];
const RIGHT_POINTS: DotPoint[] = [[0.5, 0]];
const POSITION_TOLERANCE = 0.02;
const DOTS_SURELY_ARRIVED_MS = 60_000;

describe('the drawings', () => {
  it.each(Object.entries(DOT_DRAWINGS))('%s stays inside the shape box', (_name, points) => {
    expect(points.length).toBeGreaterThan(0);
    for (const [x, y] of points) {
      expect(Math.abs(x)).toBeLessThanOrEqual(1);
      expect(Math.abs(y)).toBeLessThanOrEqual(1);
    }
  });
});

describe('getDotLayout', () => {
  it.each([[761], [900], [1280], [1920]])('keeps the shape clear of the question at %i wide', (width) => {
    const { shape } = getDotLayout(width, 800);
    expect(shape.centerX - shape.scale).toBeGreaterThanOrEqual(560);
    expect(shape.centerX + shape.scale).toBeLessThanOrEqual(width);
  });

  it('draws fewer, smaller dots on a phone, above the question and inside the page', () => {
    const phone = getDotLayout(390, 844);
    const laptop = getDotLayout(1280, 800);

    expect(phone.shape.dotCount).toBeLessThan(laptop.shape.dotCount);
    expect(phone.shape.dotRadius).toBeLessThan(laptop.shape.dotRadius);
    expect(phone.shape.centerX).toBe(195);
    expect(getShapeBoxSize(phone)).toBeLessThan(390);
  });
});

describe('the swarm', () => {
  it('sits where it was placed, with nothing left to do', () => {
    const swarm = createDotSwarm(1);
    placeDots(swarm, LEFT_POINTS);

    expect(getDotPosition(swarm, 0, 500)[0]).toBeCloseTo(-0.5, 1);
    expect(isSwarmSettled(swarm, 5000)).toBe(true);
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
});

function createFakeContext() {
  return new Proxy(
    { fill: vi.fn(), clearRect: vi.fn() } as Record<string | symbol, unknown>,
    {
      get: (target, key) => (target[key] ??= vi.fn()),
      set: (target, key, value) => {
        target[key] = value;
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
}

describe('DotStage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('gives a browser with no canvas a working page', () => {
    render(<DotStage shape={LEFT_POINTS}><p>The question</p></DotStage>);

    screen.getByRole('main');
    screen.getByText('The question');
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

    beforeEach(() => {
      contexts = [];
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
        const context = createFakeContext();
        contexts.push(context);
        return context as never;
      });
      requestFrame = vi.fn(() => 1);
      vi.stubGlobal('requestAnimationFrame', requestFrame);
      vi.stubGlobal('cancelAnimationFrame', vi.fn());
    });

    it('asks for no frames at rest, however long it stays', () => {
      render(<DotStage shape={LEFT_POINTS} />);

      expect(requestFrame).not.toHaveBeenCalled();
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
      const paintFrame = requestFrame.mock.calls[0]![0] as FrameRequestCallback;

      vi.spyOn(performance, 'now').mockReturnValue(performance.now() + DOTS_SURELY_ARRIVED_MS);
      paintFrame(0);

      expect(requestFrame).toHaveBeenCalledTimes(1);
    });

    it('keeps asking for frames while the dots are on their way', () => {
      const { rerender } = render(<DotStage shape={LEFT_POINTS} />);
      rerender(<DotStage shape={RIGHT_POINTS} />);
      const paintFrame = requestFrame.mock.calls[0]![0] as FrameRequestCallback;

      paintFrame(0);

      expect(requestFrame).toHaveBeenCalledTimes(2);
    });

    it('places a new shape at once under reduced motion', () => {
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
      const { rerender } = render(<DotStage shape={LEFT_POINTS} />);

      rerender(<DotStage shape={RIGHT_POINTS} />);

      expect(requestFrame).not.toHaveBeenCalled();
    });

    it('keeps the shape it has when given no points', () => {
      const { rerender } = render(<DotStage shape={LEFT_POINTS} />);

      rerender(<DotStage shape={[]} />);

      expect(requestFrame).not.toHaveBeenCalled();
    });

    it('repaints the grid on a resize without asking for frames', () => {
      render(<DotStage shape={LEFT_POINTS} />);

      notifyResizeObservers();

      expect(requestFrame).not.toHaveBeenCalled();
    });

    it('repaints in the other theme without asking for frames', async () => {
      render(<DotStage shape={LEFT_POINTS} />);
      const clears = vi.mocked(contexts[1]!.clearRect);
      clears.mockClear();

      document.documentElement.dataset.theme = 'dark';
      await new Promise(setImmediate);

      expect(clears).toHaveBeenCalled();
      expect(requestFrame).not.toHaveBeenCalled();
    });
  });
});

describe('textToDots', () => {
  it('gives no points in a browser with no canvas', () => {
    expect(textToDots('Maya')).toEqual([]);
  });

  it('gives no points in a browser that throws when asked for a canvas', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      throw new Error('This browser refuses a canvas.');
    });

    expect(textToDots('Maya')).toEqual([]);
    vi.restoreAllMocks();
  });

  it('turns the ink on a hidden canvas into points in the shape space', () => {
    const PAPER_WIDTH = 480;
    const data = new Uint8ClampedArray(PAPER_WIDTH * 240 * 4);
    const inkedPixel = (120 * PAPER_WIDTH + 240) * 4;
    data[inkedPixel + 3] = 255;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => ({ font: '', measureText: () => ({ width: 100 }), fillText: vi.fn(), getImageData: () => ({ data }) }) as never,
    );

    expect(textToDots('Maya')).toEqual([[0, 0]]);
    vi.restoreAllMocks();
  });
});
