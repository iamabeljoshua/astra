import type { ComponentType } from 'react';
import { BirthDatePage } from '../auth/BirthDatePage';
import { OnboardingLayout } from '../auth/OnboardingFrame';
import { HelloStep } from './HelloStep';
import { IntoStep } from './IntoStep';
import { NameStep } from './NameStep';
import { GoalStep, LevelStep } from './OptionStep';
import { ParentStep } from './ParentStep';
import type { StepId, Student } from './steps';
import { type StepProps, useOnboarding } from './useOnboarding';
import { VoiceStep } from './VoiceStep';

function BirthDateStep({ flow }: StepProps) {
  return <BirthDatePage studentName={flow.answers.name.trim()} progress={flow.progress} onBack={flow.goBack} />;
}

const STEP_SCREENS: Record<StepId, ComponentType<StepProps>> = {
  name: NameStep,
  birthDate: BirthDateStep,
  parent: ParentStep,
  into: IntoStep,
  level: LevelStep,
  goal: GoalStep,
  voice: VoiceStep,
  hello: HelloStep,
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
