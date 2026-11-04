export const STUDENT_LEVELS = ['middle_school', 'high_school', 'university', 'out_of_school'] as const;
export type StudentLevel = (typeof STUDENT_LEVELS)[number];

export const STUDENT_GOALS = ['class', 'exam', 'curiosity'] as const;
export type StudentGoal = (typeof STUDENT_GOALS)[number];

export const STUDENT_INTERESTS = [
  'basketball',
  'football',
  'movies',
  'gaming',
  'music',
  'art',
  'space',
  'cars',
  'cooking',
  'fashion',
  'coding',
  'history',
] as const;
export type StudentInterest = (typeof STUDENT_INTERESTS)[number];
