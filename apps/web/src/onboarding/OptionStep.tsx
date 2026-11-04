import { useEffect, useRef } from 'react';
import { StepHeading } from '../auth/StepHeading';
import { ONBOARDING_LABELS, STUDENT_GOAL_LABELS, STUDENT_LEVEL_LABELS } from '../strings';
import { type StudentGoal, type StudentLevel, STUDENT_GOALS, STUDENT_LEVELS } from './answers';
import { OptionRows } from './OptionRows';
import { StepScreen } from './StepScreen';
import type { StepProps } from './useOnboarding';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const SHOW_PICK_BEFORE_MOVING_ON_MS = 240;

function useMoveOnAfterPick() {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (moveOn: () => void) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(moveOn, window.matchMedia(REDUCED_MOTION_QUERY).matches ? 0 : SHOW_PICK_BEFORE_MOVING_ON_MS);
  };
}

export function LevelStep({ flow }: StepProps) {
  const moveOnAfterPick = useMoveOnAfterPick();

  return (
    <StepScreen flow={flow}>
      <StepHeading>{ONBOARDING_LABELS.levelQuestion}</StepHeading>
      <OptionRows<StudentLevel>
        options={STUDENT_LEVELS}
        labels={STUDENT_LEVEL_LABELS}
        selected={flow.answers.level}
        onPick={(level) => {
          flow.changeAnswers({ level });
          moveOnAfterPick(flow.goNext);
        }}
      />
    </StepScreen>
  );
}

export function GoalStep({ flow }: StepProps) {
  const moveOnAfterPick = useMoveOnAfterPick();

  return (
    <StepScreen flow={flow}>
      <StepHeading>{ONBOARDING_LABELS.goalQuestion}</StepHeading>
      <OptionRows<StudentGoal>
        options={STUDENT_GOALS}
        labels={STUDENT_GOAL_LABELS}
        selected={flow.answers.goal}
        isLocked={flow.isSaving}
        onPick={(goal) => {
          flow.changeAnswers({ goal });
          moveOnAfterPick(() => flow.finish(goal));
        }}
      />
      {flow.saveProblem && <p role="alert" className="stop-note">{flow.saveProblem}</p>}
    </StepScreen>
  );
}
