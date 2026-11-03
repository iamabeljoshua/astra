import { useEffect, useRef } from 'react';
import { StepHeading } from '../auth/StepHeading';
import { ONBOARDING_LABELS, STUDENT_GOAL_LABELS, STUDENT_LEVEL_LABELS } from '../strings';
import { type StudentGoal, type StudentLevel, STUDENT_GOALS, STUDENT_LEVELS } from './answers';
import { OptionRows } from './OptionRows';
import { StepScreen } from './StepScreen';
import type { StepProps } from './useOnboarding';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const SHOW_PICK_BEFORE_MOVING_ON_MS = 240;

// The picked row shows as filled for a moment, so the student sees their answer land before the question changes.
function useMoveOnAfterPick(goNext: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  return () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(goNext, window.matchMedia(REDUCED_MOTION_QUERY).matches ? 0 : SHOW_PICK_BEFORE_MOVING_ON_MS);
  };
}

export function LevelStep({ flow }: StepProps) {
  const moveOn = useMoveOnAfterPick(flow.goNext);

  return (
    <StepScreen flow={flow}>
      <StepHeading>{ONBOARDING_LABELS.levelQuestion}</StepHeading>
      <OptionRows<StudentLevel>
        options={STUDENT_LEVELS}
        labels={STUDENT_LEVEL_LABELS}
        selected={flow.answers.level}
        onPick={(level) => {
          flow.changeAnswers({ level });
          moveOn();
        }}
      />
    </StepScreen>
  );
}

export function GoalStep({ flow }: StepProps) {
  const moveOn = useMoveOnAfterPick(flow.goNext);

  return (
    <StepScreen flow={flow}>
      <StepHeading>{ONBOARDING_LABELS.goalQuestion}</StepHeading>
      <OptionRows<StudentGoal>
        options={STUDENT_GOALS}
        labels={STUDENT_GOAL_LABELS}
        selected={flow.answers.goal}
        onPick={(goal) => {
          flow.changeAnswers({ goal });
          moveOn();
        }}
      />
    </StepScreen>
  );
}
