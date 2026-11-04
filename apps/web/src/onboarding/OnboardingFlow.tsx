import type { ComponentType } from 'react';
import { BirthDatePage } from '../auth/BirthDatePage';
import { OnboardingLayout } from '../auth/OnboardingFrame';
import { InterestsStep } from './InterestsStep';
import { NameStep } from './NameStep';
import { GoalStep, LevelStep } from './OptionStep';
import type { StepId, Student } from './steps';
import { type StepProps, useOnboarding } from './useOnboarding';

function BirthDateStep({ flow }: StepProps) {
  return <BirthDatePage studentName={flow.answers.name.trim()} progress={flow.progress} onBack={flow.goBack} />;
}

const STEP_SCREENS: Record<StepId, ComponentType<StepProps>> = {
  name: NameStep,
  birthDate: BirthDateStep,
  level: LevelStep,
  interests: InterestsStep,
  goal: GoalStep,
};

export function OnboardingFlow({ student }: { student: Student | null }) {
  const flow = useOnboarding(student);
  const StepScreen = STEP_SCREENS[flow.currentStep];

  return (
    <OnboardingLayout sheet={flow.sheet} showsChangeLaterNote={flow.showsChangeLaterNote}>
      <StepScreen flow={flow} />
    </OnboardingLayout>
  );
}
