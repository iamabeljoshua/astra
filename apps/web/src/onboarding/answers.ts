import type { components } from '@astra/contracts';
import type { TutorNotesSheet } from '../auth/OnboardingFrame';
import { ONBOARDING_LABELS, STUDENT_GOAL_LABELS, STUDENT_LEVEL_LABELS, TUTOR_VOICE_LABELS } from '../strings';
import type { Student } from './steps';

type ProfileBody = components['schemas']['SaveStudentProfileBodyDto'];
export type StudentLevel = ProfileBody['level'];
export type StudentGoal = ProfileBody['goal'];
export type TutorVoice = ProfileBody['voice'];

export const STUDENT_LEVELS = Object.keys(STUDENT_LEVEL_LABELS) as StudentLevel[];
export const STUDENT_GOALS = Object.keys(STUDENT_GOAL_LABELS) as StudentGoal[];
export const TUTOR_VOICES = Object.keys(TUTOR_VOICE_LABELS) as TutorVoice[];

export interface Answers {
  name: string;
  pickedInterests: string[];
  typedInterest: string;
  level: StudentLevel | null;
  goal: StudentGoal | null;
  voice: TutorVoice | null;
}

function isListedInterest(interest: string) {
  return ONBOARDING_LABELS.intoOptions.includes(interest);
}

export function getInitialAnswers(student: Student | null): Answers {
  const interests = student?.profile?.interests ?? [];
  return {
    name: student?.name ?? '',
    pickedInterests: interests.filter(isListedInterest),
    typedInterest: interests.filter((interest) => !isListedInterest(interest)).join(', '),
    level: student?.profile?.level ?? null,
    goal: student?.profile?.goal ?? null,
    voice: student?.profile?.voice ?? null,
  };
}

function getInterests({ pickedInterests, typedInterest }: Answers): string[] {
  const typed = typedInterest.trim();
  return [...new Set(typed ? [...pickedInterests, typed] : pickedInterests)];
}

export function getSheet(answers: Answers): TutorNotesSheet {
  return {
    studentName: answers.name,
    into: getInterests(answers).join(', '),
    level: answers.level ? STUDENT_LEVEL_LABELS[answers.level] : '',
    goal: answers.goal ? STUDENT_GOAL_LABELS[answers.goal] : '',
    voice: answers.voice ? TUTOR_VOICE_LABELS[answers.voice].name : '',
  };
}

export function getHelloLine(answers: Answers): string {
  const typed = answers.typedInterest.trim();
  const interest = typed || answers.pickedInterests[0]?.toLowerCase();
  const name = answers.name.trim();
  return interest ? ONBOARDING_LABELS.hello(name, interest) : ONBOARDING_LABELS.helloWithoutInterest(name);
}

export function toProfileBody(answers: Answers, firstQuestion: string | null): ProfileBody | null {
  const { level, goal, voice } = answers;
  if (!level || !goal || !voice) return null;
  return { name: answers.name.trim(), interests: getInterests(answers), level, goal, voice, firstQuestion };
}
