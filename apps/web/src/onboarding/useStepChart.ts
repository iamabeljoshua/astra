import { useMemo } from 'react';
import { CHART_LABELS, SIGN_IN_LABELS, STUDENT_INTEREST_LABELS } from '../strings';
import { DOT_DRAWINGS } from '../ui/dots/dotDrawings';
import type { DotPoint } from '../ui/dots/dotPoint';
import { textToDots } from '../ui/dots/textToDots';
import { STUDENT_INTERESTS } from './answers';
import type { StepId } from './steps';
import type { OnboardingState } from './useOnboarding';

const STEP_SHAPES: Partial<Record<StepId, readonly DotPoint[]>> = {
  level: DOT_DRAWINGS.stairs,
  goal: DOT_DRAWINGS.rise,
};

export function useStepChart({ answers, currentStep }: Pick<OnboardingState, 'answers' | 'currentStep'>) {
  const name = answers.name.trim();
  const nameDots = useMemo(() => textToDots(name), [name]);
  const litStars = useMemo(
    () => answers.interests.map((interest) => ({ label: STUDENT_INTEREST_LABELS[interest], spot: STUDENT_INTERESTS.indexOf(interest) })),
    [answers.interests],
  );

  return {
    shape: STEP_SHAPES[currentStep] ?? (nameDots.length > 0 ? nameDots : DOT_DRAWINGS.planet),
    litStars,
    chartTitle: name ? CHART_LABELS.titleFor(name) : SIGN_IN_LABELS.tagline,
  };
}
