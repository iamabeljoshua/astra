import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type LabPage, lookAtMoment } from '../src/lab/proof/lab-page.ts';

type Source = 'live' | 'replay';
type Shown = { html: string; pixels: string };
type Plant = (hold: { source: Source; count: number }) => Shown;

const DIFFERING_PIXELS = 742;
const DIFFERING_LEVELS = 40;

// Stands in for the page, so what each hold shows is exactly what a test plants.
function makeLab(plant: Plant): LabPage {
  const counts: Record<Source, number> = { live: 0, replay: 0 };
  let shown: Shown = { html: 'same', pixels: 'A' };
  const page = {
    evaluate: async (_read: unknown, arg: unknown) => {
      if (typeof arg === 'string') return shown.html;
      if (Array.isArray(arg)) return arg.length === 3 ? DIFFERING_PIXELS : DIFFERING_LEVELS;
      if (arg && typeof arg === 'object' && 'source' in arg) {
        const source = (arg as { source: Source }).source;
        counts[source] += 1;
        shown = plant({ source, count: counts[source] });
      }
      return undefined;
    },
    locator: () => ({ screenshot: async () => Buffer.from(shown.pixels) }),
  };
  return { page, folder: '/tmp/look-at-moment' } as unknown as LabPage;
}

describe('a replay moment that looks different', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is the same when the two looks match', async () => {
    expect(await lookAtMoment(makeLab(() => ({ html: 'same', pixels: 'A' })), 1000, 500)).toBe('same');
  });

  it('settles at 742 pixels and 40 levels, with the same page during the first look and a clean second look', async () => {
    const rasterOnly: Plant = ({ source, count }) => ({ html: 'same', pixels: source === 'replay' && count === 1 ? 'B' : 'A' });
    expect(await lookAtMoment(makeLab(rasterOnly), 1000, 500)).toBe('settled');
  });

  it('is different at 742 pixels and 40 levels when the page differed during the first look, even if the painter then converges', async () => {
    const wrongOnce: Plant = ({ source, count }) => (source === 'replay' && count === 1 ? { html: 'wrong', pixels: 'B' } : { html: 'same', pixels: 'A' });
    expect(await lookAtMoment(makeLab(wrongOnce), 1000, 500)).toBe('different');
  });

  it('is different when the page is wrong on every look', async () => {
    const wrongAlways: Plant = ({ source }) => (source === 'replay' ? { html: 'wrong', pixels: 'B' } : { html: 'same', pixels: 'A' });
    expect(await lookAtMoment(makeLab(wrongAlways), 1000, 500)).toBe('different');
  });

  it('is different when the pixels repeat with the same page, as a picture or stylesheet that is not ready', async () => {
    const notReady: Plant = ({ source }) => ({ html: 'same', pixels: source === 'replay' ? 'B' : 'A' });
    expect(await lookAtMoment(makeLab(notReady), 1000, 500)).toBe('different');
  });
});
