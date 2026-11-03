import type { components } from '@astra/contracts';
import type { TutorNotesSheet } from '../auth/OnboardingFrame';
import { STUDENT_GOAL_LABELS, STUDENT_INTEREST_LABELS, STUDENT_LEVEL_LABELS } from '../strings';
import type { Student } from './steps';

type ProfileBody = components['schemas']['SaveStudentProfileBodyDto'];
export type StudentLevel = ProfileBody['level'];
export type StudentGoal = ProfileBody['goal'];
export type StudentInterest = ProfileBody['interests'][number];

export const STUDENT_LEVELS = Object.keys(STUDENT_LEVEL_LABELS) as StudentLevel[];
export const STUDENT_GOALS = Object.keys(STUDENT_GOAL_LABELS) as StudentGoal[];
export const STUDENT_INTERESTS = Object.keys(STUDENT_INTEREST_LABELS) as StudentInterest[];

export interface Answers {
  name: string;
  level: StudentLevel | null;
  interests: StudentInterest[];
  goal: StudentGoal | null;
}

export function getInitialAnswers(student: Student | null): Answers {
  return {
    name: student?.name ?? '',
    level: student?.profile?.level ?? null,
    interests: student?.profile?.interests ?? [],
    goal: student?.profile?.goal ?? null,
  };
}

export function getSheet(answers: Answers): TutorNotesSheet {
  return {
    studentName: answers.name,
    level: answers.level ? STUDENT_LEVEL_LABELS[answers.level] : '',
    into: answers.interests.map((interest) => STUDENT_INTEREST_LABELS[interest]).join(', '),
    goal: answers.goal ? STUDENT_GOAL_LABELS[answers.goal] : '',
  };
}

export function toProfileBody({ name, interests, level, goal }: Answers): ProfileBody | null {
  if (!level || !goal) return null;
  return { name: name.trim(), interests, level, goal };
}
