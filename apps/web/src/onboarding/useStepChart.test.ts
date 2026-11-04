import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHART_LABELS, SIGN_IN_LABELS, STUDENT_INTEREST_LABELS } from '../strings';
import { LIT_STAR_SPOTS } from '../ui/dots/chartStars';
import { DOT_DRAWINGS } from '../ui/dots/dotDrawings';
import { textToDots } from '../ui/dots/textToDots';
import { type Answers, STUDENT_INTERESTS } from './answers';
import type { StepId } from './steps';
import { useStepChart } from './useStepChart';

vi.mock('../ui/dots/textToDots', () => ({ textToDots: vi.fn() }));

const NAME_DOTS = [[0.1, 0.1, 1.05]] as const;
const NO_ANSWERS: Answers = { name: '', level: null, interests: [], goal: null };

function getChart(currentStep: StepId, answers: Partial<Answers> = {}) {
  return renderHook(() => useStepChart({ currentStep, answers: { ...NO_ANSWERS, ...answers } })).result.current;
}

afterEach(() => {
  vi.mocked(textToDots).mockReset();
});

describe('the chart on each step', () => {
  it('shows the planet until there is a name, with the title made for you', () => {
    vi.mocked(textToDots).mockReturnValue([]);

    const chart = getChart('name');

    expect(chart.shape).toBe(DOT_DRAWINGS.planet);
    expect(chart.chartTitle).toBe(SIGN_IN_LABELS.tagline);
  });

  it.each<StepId>(['name', 'birthDate', 'interests'])('re-forms into the name on the %s step, and titles the chart with it', (step) => {
    vi.mocked(textToDots).mockReturnValue([...NAME_DOTS]);

    const chart = getChart(step, { name: ' Maya ' });

    expect(textToDots).toHaveBeenCalledWith('Maya');
    expect(chart.shape).toEqual(NAME_DOTS);
    expect(chart.chartTitle).toBe(CHART_LABELS.titleFor('Maya'));
  });

  it.each<[StepId, keyof typeof DOT_DRAWINGS]>([['level', 'stairs'], ['goal', 'rise']])('gives the %s step its own shape', (step, drawing) => {
    vi.mocked(textToDots).mockReturnValue([...NAME_DOTS]);

    expect(getChart(step, { name: 'Maya' }).shape).toBe(DOT_DRAWINGS[drawing]);
  });

  it('lights one labelled star for each interest picked, in its own spot', () => {
    vi.mocked(textToDots).mockReturnValue([]);

    const { litStars } = getChart('interests', { interests: ['space', 'music'] });

    expect(litStars).toEqual([
      { label: STUDENT_INTEREST_LABELS.space, spot: STUDENT_INTERESTS.indexOf('space') },
      { label: STUDENT_INTEREST_LABELS.music, spot: STUDENT_INTERESTS.indexOf('music') },
    ]);
  });

  it('has a star spot for every interest', () => {
    expect(STUDENT_INTERESTS.length).toBeLessThanOrEqual(LIT_STAR_SPOTS.wide.length);
    expect(STUDENT_INTERESTS.length).toBeLessThanOrEqual(LIT_STAR_SPOTS.band.length);
  });
});
