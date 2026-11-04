import type { ComponentType } from 'react';
import { BirthDatePage } from '../auth/BirthDatePage';
import { SignOutButton } from '../auth/SignOutButton';
import { DotStage } from '../ui/dots/DotStage';
import { InterestsStep } from './InterestsStep';
import { NameStep } from './NameStep';
import { GoalStep, LevelStep } from './OptionStep';
import type { StepId, Student } from './steps';
import { type StepProps, useOnboarding } from './useOnboarding';
import { useStepChart } from './useStepChart';

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
  const chart = useStepChart(flow);
  const StepScreen = STEP_SCREENS[flow.currentStep];

  return (
    <DotStage {...chart} headerAction={<SignOutButton className="min-h-6 text-fine font-medium text-ink-2 hover:text-ink" />}>
      <StepScreen flow={flow} />
    </DotStage>
  );
}
