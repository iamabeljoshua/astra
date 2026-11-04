import { useState } from 'react';
import { useNavigate } from 'react-router';
import { API_ERROR_LABELS, ONBOARDING_LABELS } from '../strings';
import { useSaveProfile } from '../auth/useAccount';
import { type Answers, getInitialAnswers, getSheet, type StudentGoal, toProfileBody } from './answers';
import { getFirstOpenStepFrom, getNextStep, getPreviousStep, getResumeStep, getSteps, showsChangeLaterNote, type StepId, type Student } from './steps';

export function useOnboarding(student: Student | null) {
  const navigate = useNavigate();
  const saveProfile = useSaveProfile();
  const [answers, setAnswers] = useState(() => getInitialAnswers(student));
  const [chosenStep, setChosenStep] = useState(() => getResumeStep(student));

  const currentStep = getFirstOpenStepFrom(chosenStep, student);
  const steps = getSteps();
  const previousStep = getPreviousStep(currentStep, student);

  function goNext() {
    const nextStep = getNextStep(currentStep, student);
    if (nextStep) setChosenStep(nextStep);
  }

  function goBackTo(step: StepId) {
    saveProfile.reset();
    setChosenStep(step);
  }

  function finish(goal: StudentGoal) {
    const body = toProfileBody({ ...answers, goal });
    if (!body) return;
    void navigate('/', { replace: true });
    saveProfile.mutate(body);
  }

  return {
    answers,
    currentStep,
    sheet: getSheet(answers),
    showsChangeLaterNote: showsChangeLaterNote(currentStep),
    progress: ONBOARDING_LABELS.progress(steps.indexOf(currentStep) + 1, steps.length),
    goBack: previousStep && !saveProfile.isPending ? () => goBackTo(previousStep) : undefined,
    goNext,
    changeAnswers: (change: Partial<Answers>) => setAnswers((earlier) => ({ ...earlier, ...change })),
    isSaving: saveProfile.isPending,
    saveProblem: saveProfile.error && API_ERROR_LABELS[saveProfile.error.kind],
    finish,
  };
}

export type OnboardingState = ReturnType<typeof useOnboarding>;

export interface StepProps {
  flow: OnboardingState;
}
