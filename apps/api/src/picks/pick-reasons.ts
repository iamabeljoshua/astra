import type { StudentGoal, StudentLevel } from '../students/student-profile-options';

interface LevelReasons {
  class: string;
  exam: string;
  fit: string;
}

const REASONS_BY_LEVEL: Record<StudentLevel, LevelReasons> = {
  middle_school: {
    class: 'Often taught in middle school',
    exam: 'Often on middle school exams',
    fit: 'Set at middle school level',
  },
  high_school: {
    class: 'Often taught in high school',
    exam: 'Often on high school exams',
    fit: 'Set at high school level',
  },
  university: {
    class: 'Often taught at university',
    exam: 'Often on university exams',
    fit: 'Set at university level',
  },
  out_of_school: {
    class: 'Often taught in a first course',
    exam: 'Often on exams',
    fit: 'No classroom needed',
  },
};

export const STARTER_REASON = 'A good place to start';

const WORDS_THAT_TAKE_THE = new Set(['NBA', 'WNBA', 'Lakers']);

export function getInterestReason(interestWord: string): string {
  return `Because you're into ${WORDS_THAT_TAKE_THE.has(interestWord) ? `the ${interestWord}` : interestWord}`;
}

export function getGoalReason(goal: StudentGoal, level: StudentLevel): string {
  return goal === 'curiosity' ? 'For pure curiosity' : REASONS_BY_LEVEL[level][goal];
}

export function getLevelReason(level: StudentLevel): string {
  return REASONS_BY_LEVEL[level].fit;
}
