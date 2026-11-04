import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHART_LABELS, SIGN_IN_LABELS, STUDENT_INTEREST_LABELS } from '../strings';
import { LIT_STAR_SPOTS } from '../ui/dots/chartStars';
import { DOT_DRAWINGS } from '../ui/dots/dotDrawings';
import type { DotPoint } from '../ui/dots/dotPoint';
import { textToDots } from '../ui/dots/textToDots';
import { type Answers, STUDENT_INTERESTS } from './answers';
import type { StepId } from './steps';
import { useStepChart } from './useStepChart';

vi.mock('../ui/dots/textToDots', () => ({ textToDots: vi.fn() }));

const NAME_DOTS = [[0.1, 0.1, 1.05]] as const;
const NO_ANSWERS: Answers = { name: '', level: null, interests: [], goal: null };

async function getChart(currentStep: StepId, answers: Partial<Answers> = {}) {
  const { result } = renderHook(() => useStepChart({ currentStep, answers: { ...NO_ANSWERS, ...answers } }));
  await act(() => new Promise(setImmediate));
  return result.current;
}

afterEach(() => {
  vi.mocked(textToDots).mockReset();
});

describe('the chart on each step', () => {
  it('shows the planet until there is a name, with the title made for you', async () => {
    vi.mocked(textToDots).mockResolvedValue([]);

    const chart = await getChart('name');

    expect(chart.shape).toBe(DOT_DRAWINGS.planet);
    expect(chart.chartTitle).toBe(SIGN_IN_LABELS.tagline);
  });

  it.each<StepId>(['name', 'birthDate', 'interests'])('re-forms into the name on the %s step, and titles the chart with it', async (step) => {
    vi.mocked(textToDots).mockResolvedValue([...NAME_DOTS]);

    const chart = await getChart(step, { name: ' Maya ' });

    expect(textToDots).toHaveBeenCalledWith('Maya');
    expect(chart.shape).toEqual(NAME_DOTS);
    expect(chart.chartTitle).toBe(CHART_LABELS.titleFor('Maya'));
  });

  it.each<[StepId, keyof typeof DOT_DRAWINGS]>([['level', 'stairs'], ['goal', 'rise']])('gives the %s step its own shape', async (step, drawing) => {
    vi.mocked(textToDots).mockResolvedValue([...NAME_DOTS]);

    expect((await getChart(step, { name: 'Maya' })).shape).toBe(DOT_DRAWINGS[drawing]);
  });

  it('lights one labelled star for each interest picked, in its own spot', async () => {
    vi.mocked(textToDots).mockResolvedValue([]);

    const { litStars } = await getChart('interests', { interests: ['space', 'music'] });

    expect(litStars).toEqual([
      { label: STUDENT_INTEREST_LABELS.space, spot: STUDENT_INTERESTS.indexOf('space') },
      { label: STUDENT_INTEREST_LABELS.music, spot: STUDENT_INTERESTS.indexOf('music') },
    ]);
  });

  it('holds the planet until the dots are drawn in the right font, then forms the name', async () => {
    let finishDrawing = (_dots: DotPoint[]) => {};
    vi.mocked(textToDots).mockReturnValue(new Promise((resolve) => (finishDrawing = resolve)));

    const { result } = renderHook(() => useStepChart({ currentStep: 'interests', answers: { ...NO_ANSWERS, name: 'Maya' } }));
    expect(result.current.shape).toBe(DOT_DRAWINGS.planet);

    await act(async () => finishDrawing([...NAME_DOTS]));

    expect(result.current.shape).toEqual(NAME_DOTS);
  });

  it('drops the dots of a name that has since changed', async () => {
    const finishDrawing: ((dots: DotPoint[]) => void)[] = [];
    vi.mocked(textToDots).mockImplementation(() => new Promise((resolve) => finishDrawing.push(resolve)));
    const newerDots: DotPoint[] = [[0.2, 0.2, 1.05]];

    const { result, rerender } = renderHook(({ name }) => useStepChart({ currentStep: 'name', answers: { ...NO_ANSWERS, name } }), { initialProps: { name: 'Ma' } });
    rerender({ name: 'Maya' });
    await act(async () => finishDrawing[1]?.(newerDots));
    await act(async () => finishDrawing[0]?.([...NAME_DOTS]));

    expect(result.current.shape).toEqual(newerDots);
  });

  it('has a star spot for every interest', () => {
    expect(STUDENT_INTERESTS.length).toBeLessThanOrEqual(LIT_STAR_SPOTS.wide.length);
    expect(STUDENT_INTERESTS.length).toBeLessThanOrEqual(LIT_STAR_SPOTS.band.length);
  });
});
