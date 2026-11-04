import type { components } from '@astra/contracts';

export type Student = components['schemas']['StudentResponseDto'];
export type StepId = 'name' | 'birthDate' | 'level' | 'interests' | 'goal';

interface OnboardingStep {
  id: StepId;
  isAnswered: (student: Student | null) => boolean;
  canChangeLater: boolean;
}

const hasStudent = (student: Student | null) => student !== null;
const hasProfile = (student: Student | null) => Boolean(student?.profile);

const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  { id: 'name', isAnswered: (student) => Boolean(student?.name), canChangeLater: true },
  { id: 'birthDate', isAnswered: hasStudent, canChangeLater: false },
  { id: 'level', isAnswered: hasProfile, canChangeLater: true },
  { id: 'interests', isAnswered: hasProfile, canChangeLater: true },
  { id: 'goal', isAnswered: hasProfile, canChangeLater: true },
];

function findStepIndex(stepId: StepId) {
  return ONBOARDING_STEPS.findIndex((step) => step.id === stepId);
}

function isOpen(step: OnboardingStep, student: Student | null) {
  return step.canChangeLater || !step.isAnswered(student);
}

export function getSteps(): StepId[] {
  return ONBOARDING_STEPS.map((step) => step.id);
}

export function getResumeStep(student: Student | null): StepId {
  return ONBOARDING_STEPS.find((step) => !step.isAnswered(student))?.id ?? 'goal';
}

export function getNextStep(stepId: StepId, student: Student | null): StepId | null {
  const later = ONBOARDING_STEPS.slice(findStepIndex(stepId) + 1);
  return later.find((step) => isOpen(step, student))?.id ?? null;
}

export function getPreviousStep(stepId: StepId, student: Student | null): StepId | null {
  const earlier = ONBOARDING_STEPS.slice(0, findStepIndex(stepId)).reverse();
  return earlier.find((step) => isOpen(step, student))?.id ?? null;
}

export function getFirstOpenStepFrom(chosenStep: StepId, student: Student | null): StepId {
  const chosen = ONBOARDING_STEPS[findStepIndex(chosenStep)];
  if (chosen && isOpen(chosen, student)) return chosenStep;
  return getNextStep(chosenStep, student) ?? chosenStep;
}

export function hasFinishedOnboarding(student: Student | null): boolean {
  return hasProfile(student);
}
