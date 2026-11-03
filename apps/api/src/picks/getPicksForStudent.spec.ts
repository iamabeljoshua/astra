import { STUDENT_GOALS, STUDENT_LEVELS } from '../students/student-profile-options';
import type { StudentGoal, StudentLevel } from '../students/student-profile-options';
import { getPicksForStudent } from './getPicksForStudent';
import type { StudentFit } from './getPicksForStudent';
import { LIBRARY } from './library';
import type { Library, LibraryTopic } from './library';

const FIT: StudentFit = { interests: [], level: 'high_school', goal: 'class' };

function makeTopic(id: string, fields: Partial<LibraryTopic> = {}): LibraryTopic {
  return {
    id,
    title: id,
    subject: id,
    lengthMinutes: 10,
    openingLine: 'A question?',
    artwork: 'arc',
    levels: ['high_school'],
    goals: [],
    interests: [],
    ...fields,
  };
}

function makeLibrary(topics: LibraryTopic[]): Library {
  return {
    interests: [
      { name: 'basketball', words: ['basketball', 'NBA'] },
      { name: 'football', words: ['football', 'Arsenal'] },
      { name: 'art', words: ['art'] },
    ],
    topics,
  };
}

function getPickIds(student: StudentFit | null, library: Library) {
  return getPicksForStudent(student, library).map((pick) => pick.id);
}

function getReasonOf(id: string, student: StudentFit, library: Library) {
  return getPicksForStudent(student, library).find((pick) => pick.id === id)?.reason;
}

describe('getPicksForStudent', () => {
  describe('level', () => {
    it('leaves out a topic that does not suit the student level, even when the interest matches', () => {
      const library = makeLibrary([
        makeTopic('university-basketball', { levels: ['university'], interests: ['basketball'] }),
        makeTopic('high-school-plain'),
      ]);

      expect(getPickIds({ ...FIT, interests: ['Basketball'] }, library)).toEqual(['high-school-plain']);
    });
  });

  describe('interests', () => {
    it('puts topics that match an interest ahead of the ones that come first in the library', () => {
      const library = makeLibrary([makeTopic('plain'), makeTopic('basketball', { interests: ['basketball'] })]);

      expect(getPickIds({ ...FIT, interests: ['Basketball'] }, library)).toEqual(['basketball', 'plain']);
    });

    it('gives each interest a turn before the first one gets a second card', () => {
      const library = makeLibrary([
        makeTopic('basketball-1', { interests: ['basketball'] }),
        makeTopic('basketball-2', { interests: ['basketball'] }),
        makeTopic('football-1', { interests: ['football'] }),
      ]);

      expect(getPickIds({ ...FIT, interests: ['Basketball', 'Football'] }, library)).toEqual([
        'basketball-1',
        'football-1',
        'basketball-2',
      ]);
    });

    it.each([
      ['Basketball', 'basketball'],
      ['pick-up BASKETBALL!', 'basketball'],
      ['nba', 'NBA'],
    ])('reads %s as the library word %s', (interest, word) => {
      const library = makeLibrary([makeTopic('basketball', { interests: ['basketball'] })]);

      expect(getReasonOf('basketball', { ...FIT, interests: [interest] }, library)).toBe(`Because you're into ${word}`);
    });

    it('names a specific team when the student named one', () => {
      const library = makeLibrary([makeTopic('football', { interests: ['football'] })]);

      expect(getReasonOf('football', { ...FIT, interests: ['Arsenal FC'] }, library)).toBe("Because you're into Arsenal");
    });

    it('does not match a word hidden inside another word', () => {
      const library = makeLibrary([makeTopic('art', { interests: ['art'] })]);

      expect(getReasonOf('art', { ...FIT, interests: ['smart cars', 'martial arts'] }, library)).not.toContain('into');
    });

    it('never repeats what the student typed when nothing in the library matches it', () => {
      const library = makeLibrary([makeTopic('plain')]);

      const reason = getReasonOf('plain', { ...FIT, interests: ['My private diary'] }, library);

      expect(reason).toBe('Set at high school level');
    });
  });

  describe('goal', () => {
    it.each<[StudentGoal, StudentLevel, string]>([
      ['exam', 'university', 'Often on university exams'],
      ['class', 'high_school', 'Often taught in high school'],
      ['curiosity', 'middle_school', 'For pure curiosity'],
    ])('with goal %s at %s, says %s', (goal, level, reason) => {
      const library = makeLibrary([makeTopic('plain', { levels: [level] }), makeTopic('fits', { levels: [level], goals: [goal] })]);
      const student = { ...FIT, goal, level };

      expect(getPickIds(student, library)).toEqual(['fits', 'plain']);
      expect(getReasonOf('fits', student, library)).toBe(reason);
    });

    it('prefers the interest reason over the goal reason on one card', () => {
      const library = makeLibrary([makeTopic('both', { goals: ['class'], interests: ['basketball'] })]);

      expect(getPicksForStudent({ ...FIT, interests: ['Basketball'] }, library)).toHaveLength(1);
      expect(getReasonOf('both', { ...FIT, interests: ['Basketball'] }, library)).toBe("Because you're into basketball");
    });
  });

  describe('the screen', () => {
    it('shows at most six cards and spreads them across subjects', () => {
      const physics = ['1', '2', '3', '4'].map((name) => makeTopic(`physics-${name}`, { subject: 'Physics', goals: ['class'] }));
      const others = ['Math', 'Chemistry', 'Music', 'Art'].map((subject) => makeTopic(subject, { subject }));

      expect(getPickIds(FIT, makeLibrary([...physics, ...others]))).toEqual([
        'physics-1',
        'physics-2',
        'Math',
        'Chemistry',
        'Music',
        'Art',
      ]);
    });

    it('still fills the screen when one subject is all a level has', () => {
      const physics = ['1', '2', '3', '4', '5', '6', '7'].map((name) => makeTopic(`physics-${name}`, { subject: 'Physics' }));

      expect(getPicksForStudent(FIT, makeLibrary(physics))).toHaveLength(6);
    });

    it('carries the topic and its opening line onto the card', () => {
      const library = makeLibrary([makeTopic('plain', { title: 'A title', openingLine: 'Why?', lengthMinutes: 12, artwork: 'saturn' })]);

      expect(getPicksForStudent(FIT, library)).toEqual([
        {
          id: 'plain',
          title: 'A title',
          subject: 'plain',
          lengthMinutes: 12,
          openingLine: 'Why?',
          reason: 'Set at high school level',
          artwork: 'saturn',
        },
      ]);
    });
  });

  describe('a student with no profile', () => {
    it('sees only topics that suit every level, and is told it is a place to start', () => {
      const library = makeLibrary([
        makeTopic('one-level'),
        makeTopic('every-level', { levels: [...STUDENT_LEVELS] }),
      ]);

      expect(getPicksForStudent(null, library).map(({ id, reason }) => ({ id, reason }))).toEqual([
        { id: 'every-level', reason: 'A good place to start' },
      ]);
    });
  });

  describe('with the real library', () => {
    const STUDENTS = STUDENT_LEVELS.flatMap((level) =>
      STUDENT_GOALS.flatMap((goal) =>
        [[], ['Basketball'], ['Cooking', 'Music'], ['Something the library has never heard of']].map((interests) => ({
          level,
          goal,
          interests,
        })),
      ),
    );

    it.each(STUDENTS)('gives $level, $goal, $interests six different cards at that level, each with a reason', (student) => {
      const picks = getPicksForStudent(student, LIBRARY);

      expect(picks).toHaveLength(6);
      expect(new Set(picks.map((pick) => pick.id)).size).toBe(6);
      for (const pick of picks) {
        expect(pick.reason.trim()).not.toBe('');
        expect(LIBRARY.topics.find((topic) => topic.id === pick.id)?.levels).toContain(student.level);
      }
    });

    it('gives a new student six cards from six subjects', () => {
      const picks = getPicksForStudent(null, LIBRARY);

      expect(picks).toHaveLength(6);
      expect(new Set(picks.map((pick) => pick.subject)).size).toBe(6);
    });

    it('shows two different students different cards', () => {
      const universityBasketball = getPickIds({ interests: ['Basketball', 'Space'], level: 'university', goal: 'exam' }, LIBRARY);
      const highSchoolCooking = getPickIds({ interests: ['Cooking', 'Music'], level: 'high_school', goal: 'class' }, LIBRARY);

      expect(universityBasketball.filter((id) => highSchoolCooking.includes(id))).toEqual([]);
    });
  });
});
