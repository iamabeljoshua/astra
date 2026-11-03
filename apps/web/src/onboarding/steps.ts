import type { components } from '@astra/contracts';

export type Student = components['schemas']['StudentResponseDto'];
export type StepId = 'name' | 'birthDate' | 'parent' | 'into' | 'level' | 'goal' | 'voice' | 'hello';

interface OnboardingStep {
  id: StepId;
  appliesTo: (student: Student | null) => boolean;
  isAnswered: (student: Student | null) => boolean;
  // A settled step can never be changed from here, so the flow steps over it in both directions.
  isSettled: (student: Student | null) => boolean;
  canGoBack: boolean;
  showsChangeLaterNote: boolean;
}

const hasStudent = (student: Student | null) => student !== null;
const hasProfile = (student: Student | null) => Boolean(student?.profile);
const hasConsent = (student: Student | null) => student?.parentConsent?.status === 'given';
const ALWAYS = () => true;
const NEVER = () => false;

const QUESTION_STEP = { appliesTo: ALWAYS, isAnswered: hasProfile, isSettled: NEVER, canGoBack: true, showsChangeLaterNote: true };

const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  { ...QUESTION_STEP, id: 'name', isAnswered: (student) => Boolean(student?.name) },
  { ...QUESTION_STEP, id: 'birthDate', isAnswered: hasStudent, isSettled: hasStudent, showsChangeLaterNote: false },
  {
    ...QUESTION_STEP,
    id: 'parent',
    appliesTo: (student) => Boolean(student?.parentConsent),
    isAnswered: hasConsent,
    isSettled: hasConsent,
    canGoBack: false,
    showsChangeLaterNote: false,
  },
  { ...QUESTION_STEP, id: 'into' },
  { ...QUESTION_STEP, id: 'level' },
  { ...QUESTION_STEP, id: 'goal' },
  { ...QUESTION_STEP, id: 'voice' },
  { ...QUESTION_STEP, id: 'hello', isAnswered: (student) => Boolean(student?.profile?.firstQuestion) },
];

function findStepIndex(stepId: StepId) {
  return ONBOARDING_STEPS.findIndex((step) => step.id === stepId);
}

function isOpen(step: OnboardingStep, student: Student | null) {
  return step.appliesTo(student) && !step.isSettled(student);
}

export function getStepsFor(student: Student | null): StepId[] {
  return ONBOARDING_STEPS.filter((step) => step.appliesTo(student)).map((step) => step.id);
}

export function getResumeStep(student: Student | null): StepId {
  const firstUnanswered = ONBOARDING_STEPS.find((step) => step.appliesTo(student) && !step.isAnswered(student));
  return firstUnanswered?.id ?? 'hello';
}

export function getNextStep(stepId: StepId, student: Student | null): StepId | null {
  const later = ONBOARDING_STEPS.slice(findStepIndex(stepId) + 1);
  return later.find((step) => isOpen(step, student))?.id ?? null;
}

export function getPreviousStep(stepId: StepId, student: Student | null): StepId | null {
  const index = findStepIndex(stepId);
  if (!ONBOARDING_STEPS[index]?.canGoBack) return null;
  return ONBOARDING_STEPS.slice(0, index).reverse().find((step) => isOpen(step, student))?.id ?? null;
}

// An answer from the server can settle the step on screen, and the student then moves on with no click.
export function getCurrentStep(chosenStep: StepId, student: Student | null): StepId {
  const chosen = ONBOARDING_STEPS[findStepIndex(chosenStep)];
  if (chosen && isOpen(chosen, student)) return chosenStep;
  return getNextStep(chosenStep, student) ?? chosenStep;
}

export function showsChangeLaterNote(stepId: StepId): boolean {
  return ONBOARDING_STEPS[findStepIndex(stepId)]?.showsChangeLaterNote ?? false;
}

export function hasFinishedOnboarding(student: Student | null): boolean {
  const isWaitingForParent = Boolean(student?.parentConsent) && !hasConsent(student);
  return Boolean(student?.profile?.firstQuestion) && !isWaitingForParent;
}
