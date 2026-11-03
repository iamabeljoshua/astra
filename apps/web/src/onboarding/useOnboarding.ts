import { useState } from 'react';
import { useNavigate } from 'react-router';
import { API_ERROR_LABELS, ONBOARDING_LABELS } from '../strings';
import { useSaveProfile } from '../auth/useAccount';
import { type Answers, getInitialAnswers, getSheet, toProfileBody } from './answers';
import { getFirstOpenStepFrom, getNextStep, getPreviousStep, getResumeStep, getStepsFor, showsChangeLaterNote, type Student } from './steps';

export function useOnboarding(student: Student | null) {
  const navigate = useNavigate();
  const saveProfile = useSaveProfile();
  const [answers, setAnswers] = useState(() => getInitialAnswers(student));
  const [chosenStep, setChosenStep] = useState(() => getResumeStep(student));

  const currentStep = getFirstOpenStepFrom(chosenStep, student);
  const steps = getStepsFor(student);
  const previousStep = getPreviousStep(currentStep, student);

  function goNext() {
    const nextStep = getNextStep(currentStep, student);
    if (nextStep) setChosenStep(nextStep);
  }

  function saveAnswers(firstQuestion: string | null, onSaved: () => void) {
    const body = toProfileBody(answers, firstQuestion);
    if (!body || saveProfile.isPending) return;
    saveProfile.mutate(body, { onSuccess: onSaved });
  }

  return {
    student,
    answers,
    currentStep,
    sheet: getSheet(answers),
    showsChangeLaterNote: showsChangeLaterNote(currentStep),
    progress: ONBOARDING_LABELS.progress(steps.indexOf(currentStep) + 1, steps.length),
    goBack: previousStep ? () => setChosenStep(previousStep) : undefined,
    goNext,
    changeAnswers: (change: Partial<Answers>) => setAnswers((earlier) => ({ ...earlier, ...change })),
    saveProblem: saveProfile.error && API_ERROR_LABELS[saveProfile.error.kind],
    isSaving: saveProfile.isPending,
    saveAndGoNext: () => saveAnswers(null, goNext),
    finish: (firstQuestion: string) => {
      void navigate('/', { replace: true });
      saveAnswers(firstQuestion, () => undefined);
    },
  };
}

export type OnboardingState = ReturnType<typeof useOnboarding>;

export interface StepProps {
  flow: OnboardingState;
}
