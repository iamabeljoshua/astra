import { STUDENT_GOALS, STUDENT_LEVELS } from '../students/student-profile-options';
import type { StudentGoal, StudentLevel } from '../students/student-profile-options';
import { getPicksForStudent } from './getPicksForStudent';
import type { StudentFit } from './getPicksForStudent';
import { LIBRARY } from './library';
import type { Library, LibraryTopic } from './library';
import type { TopicSession } from './topic-progress';

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

function makeLibrary(topics: LibraryTopic[], topicOrder: Library['topicOrder'] = {}): Library {
  return {
    interests: [
      { name: 'basketball', words: ['basketball', 'NBA'] },
      { name: 'football', words: ['football', 'Arsenal'] },
      { name: 'art', words: ['art'] },
    ],
    topics,
    topicOrder,
  };
}

function getPicksWithNoHistory(fit: StudentFit | null, library: Library) {
  return getPicksForStudent({ fit, history: [], continueCardSessionId: null }, library);
}

function getPickIds(fit: StudentFit | null, library: Library) {
  return getPicksWithNoHistory(fit, library).map((pick) => pick.id);
}

function getReasonOf(id: string, fit: StudentFit, library: Library) {
  return getPicksWithNoHistory(fit, library).find((pick) => pick.id === id)?.reason;
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

      expect(getPicksWithNoHistory({ ...FIT, interests: ['Basketball'] }, library)).toHaveLength(1);
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

      expect(getPicksWithNoHistory(FIT, makeLibrary(physics))).toHaveLength(6);
    });

    it('carries the topic and its opening line onto the card', () => {
      const library = makeLibrary([makeTopic('plain', { title: 'A title', openingLine: 'Why?', lengthMinutes: 12, artwork: 'saturn' })]);

      expect(getPicksWithNoHistory(FIT, library)).toEqual([
        {
          id: 'plain',
          title: 'A title',
          subject: 'plain',
          lengthMinutes: 12,
          openingLine: 'Why?',
          reason: 'Set at high school level',
          artwork: 'saturn',
          continueSessionId: null,
        },
      ]);
    });
  });

  describe('session history', () => {
    const TEN_MINUTES_IN_SECONDS = 600;
    const PHYSICS_ORDER = ['forces', 'energy', 'waves', 'light'];
    const LIBRARY_LISTED_AGAINST_SUBJECT_ORDER = makeLibrary(
      [
        makeTopic('light', { subject: 'Physics', title: 'Light' }),
        makeTopic('waves', { subject: 'Physics', title: 'Waves' }),
        makeTopic('energy', { subject: 'Physics', title: 'Energy' }),
        makeTopic('forces', { subject: 'Physics', title: 'Forces' }),
        ...['Math', 'Chemistry', 'Music', 'Art'].map((subject) => makeTopic(subject, { subject })),
      ],
      { Physics: PHYSICS_ORDER },
    );

    function finished(topicId: string, durationSeconds = TEN_MINUTES_IN_SECONDS): TopicSession {
      return { id: `finished-${topicId}`, topicId, status: 'finished', durationSeconds };
    }

    function open(topicId: string, id = `open-${topicId}`): TopicSession {
      return { id, topicId, status: 'in_progress', durationSeconds: 60 };
    }

    function getPicks(history: TopicSession[], continueCardSessionId: string | null = null, library = LIBRARY_LISTED_AGAINST_SUBJECT_ORDER) {
      return getPicksForStudent({ fit: FIT, history, continueCardSessionId }, library);
    }

    function getCards(history: TopicSession[], continueCardSessionId: string | null = null, library = LIBRARY_LISTED_AGAINST_SUBJECT_ORDER) {
      return getPicks(history, continueCardSessionId, library).map(({ id, reason }) => ({ id, reason }));
    }

    function getIds(history: TopicSession[], continueCardSessionId: string | null = null, library = LIBRARY_LISTED_AGAINST_SUBJECT_ORDER) {
      return getPicks(history, continueCardSessionId, library).map((pick) => pick.id);
    }

    describe('a finished topic', () => {
      it('leaves the cards', () => {
        expect(getIds([finished('forces')])).not.toContain('forces');
      });

      it('counts once a session reaches half the length of the topic', () => {
        expect(getIds([finished('forces', TEN_MINUTES_IN_SECONDS / 2)])).not.toContain('forces');
      });

      it.each([
        ['a few seconds', 5],
        ['a few minutes, ended early', TEN_MINUTES_IN_SECONDS / 2 - 1],
      ])('does not count after %s, so the cards stay as if the session never happened', (_name, seconds) => {
        expect(getPicks([finished('forces', seconds)])).toEqual(getPicks([]));
      });

      it('ignores a session on a topic the library no longer holds', () => {
        expect(getPicks([finished('removed-topic'), open('removed-topic')])).toEqual(getPicks([]));
      });
    });

    describe('a topic in progress', () => {
      it('comes first with a reason that says so, and reopens its session', () => {
        const [firstPick] = getPicks([open('light')]);

        expect(firstPick).toMatchObject({
          id: 'light',
          reason: 'Carry on where you left off',
          continueSessionId: 'open-light',
        });
      });

      it('is not repeated when the continue card already offers it, not even as a new card', () => {
        expect(getIds([open('light')], 'open-light')).not.toContain('light');
      });

      it('still gets a card when the continue card offers a different session', () => {
        expect(getIds([open('light')], 'typed-question-session')).toContain('light');
      });

      it('reopens the newest of two open sessions on one topic', () => {
        const [firstPick] = getPicks([open('light', 'newer'), open('light', 'older')]);

        expect(firstPick?.continueSessionId).toBe('newer');
      });

      it.each([
        ['after', [finished('forces'), open('forces')]],
        ['before', [open('forces'), finished('forces')]],
      ])('wins over a finished session %s it, so no next topic is suggested yet', (_name, history) => {
        expect(getCards(history).slice(0, 2)).toEqual([
          { id: 'forces', reason: 'Carry on where you left off' },
          { id: 'light', reason: 'Set at high school level' },
        ]);
      });

      it('shows two at most, newest first, so new topics keep their place', () => {
        const history = [open('Art'), open('Music'), open('Chemistry'), open('Math')];

        expect(getCards(history).slice(0, 3)).toEqual([
          { id: 'Art', reason: 'Carry on where you left off' },
          { id: 'Music', reason: 'Carry on where you left off' },
          { id: 'light', reason: 'Set at high school level' },
        ]);
        expect(getIds(history)).not.toContain('Chemistry');
      });

      it('orders by when the open session started, even when the topic also has a newer finished session', () => {
        const history = [finished('Art'), open('Music'), open('Chemistry'), open('Art')];

        expect(getIds(history).slice(0, 2)).toEqual(['Music', 'Chemistry']);
      });

      it('stays on offer after the student level moves away from the topic', () => {
        const library = makeLibrary([makeTopic('other-level', { levels: ['university'] }), makeTopic('plain')]);

        expect(getIds([open('other-level')], null, library)).toEqual(['other-level', 'plain']);
      });
    });

    describe('the next topic', () => {
      it('follows the written order of the subject and names what the student finished', () => {
        const [firstPick] = getPicks([finished('forces')]);

        expect(firstPick).toMatchObject({ id: 'energy', reason: 'You finished Forces', continueSessionId: null });
      });

      it('skips a later topic that does not suit the student level', () => {
        const library = makeLibrary(
          [makeTopic('first', { title: 'First' }), makeTopic('too-hard', { levels: ['university'] }), makeTopic('third')],
          { first: ['first', 'too-hard', 'third'] },
        );

        expect(getCards([finished('first')], null, library)[0]).toEqual({ id: 'third', reason: 'You finished First' });
      });

      it('skips a later topic already finished, and names the newest one finished', () => {
        expect(getCards([finished('energy'), finished('forces')])[0]).toEqual({ id: 'waves', reason: 'You finished Energy' });
      });

      it('offers nothing after the last topic of a subject', () => {
        expect(getCards([finished('light')])[0]).toEqual({ id: 'waves', reason: 'Set at high school level' });
      });

      it('does not jump past a next topic that is in progress', () => {
        expect(getCards([open('energy'), finished('forces')]).slice(0, 2)).toEqual([
          { id: 'energy', reason: 'Carry on where you left off' },
          { id: 'light', reason: 'Set at high school level' },
        ]);
      });

      it('does not follow a session that ended too early to count', () => {
        expect(getIds([finished('forces', 5)])[0]).toBe('light');
      });

      it('shows two at most, newest first', () => {
        const library = makeLibrary(
          ['a', 'b', 'c'].flatMap((subject) => [
            makeTopic(`${subject}-1`, { subject, title: `${subject} one` }),
            makeTopic(`${subject}-2`, { subject }),
          ]),
          { a: ['a-1', 'a-2'], b: ['b-1', 'b-2'], c: ['c-1', 'c-2'] },
        );

        expect(getCards([finished('c-1'), finished('b-1'), finished('a-1')], null, library).slice(0, 3)).toEqual([
          { id: 'c-2', reason: 'You finished c one' },
          { id: 'b-2', reason: 'You finished b one' },
          { id: 'a-2', reason: 'Set at high school level' },
        ]);
      });
    });

    describe('the screen', () => {
      const THREE_IN_ONE_SUBJECT = makeLibrary(
        [
          ...['one', 'two', 'three', 'four', 'five'].map((name) => makeTopic(name, { subject: 'Physics' })),
          ...['Math', 'Chemistry', 'Music', 'Art'].map((subject) => makeTopic(subject, { subject })),
        ],
        { Physics: ['one', 'two', 'three', 'four', 'five'] },
      );

      it('shows the next topic even when carry-on cards already fill the subject', () => {
        const history = [open('three'), open('four'), finished('one')];

        expect(getIds(history, null, THREE_IN_ONE_SUBJECT).slice(0, 3)).toEqual(['three', 'four', 'two']);
      });

      it('counts history cards toward the subject limit for the cards that follow', () => {
        const history = [open('three'), open('four')];

        expect(getIds(history, null, THREE_IN_ONE_SUBJECT)).toEqual(['three', 'four', 'Math', 'Chemistry', 'Music', 'Art']);
      });
    });

    describe('with the real library', () => {
      const STUDENTS: (StudentFit | null)[] = [null, ...STUDENT_LEVELS.map((level) => ({ level, goal: 'class' as const, interests: ['Basketball'] }))];
      const TOPICS = LIBRARY.topics;

      function getFinishedTopics(history: TopicSession[]) {
        const isOpen = (topicId: string) => history.some((session) => session.topicId === topicId && session.status === 'in_progress');
        return TOPICS.filter(
          (topic) =>
            !isOpen(topic.id) &&
            history.some(
              (session) =>
                session.topicId === topic.id && session.status === 'finished' && session.durationSeconds >= (topic.lengthMinutes * 60) / 2,
            ),
        );
      }

      function expectEveryReasonToBeTrue(fit: StudentFit | null, history: TopicSession[]) {
        const picks = getPicksForStudent({ fit, history, continueCardSessionId: null }, LIBRARY);
        const finishedTopics = getFinishedTopics(history);

        expect(picks).toHaveLength(6);
        expect(new Set(picks.map((pick) => pick.id)).size).toBe(6);
        for (const pick of picks) {
          expect(finishedTopics.map((topic) => topic.id)).not.toContain(pick.id);

          if (pick.continueSessionId) {
            expect(pick.reason).toBe('Carry on where you left off');
            expect(history).toContainEqual(expect.objectContaining({ id: pick.continueSessionId, topicId: pick.id, status: 'in_progress' }));
          } else {
            expect(pick.reason).not.toBe('Carry on where you left off');
            expect(history).not.toContainEqual(expect.objectContaining({ topicId: pick.id, status: 'in_progress' }));
          }

          const finishedTitle = /^You finished (.+)$/.exec(pick.reason)?.[1];
          if (finishedTitle) {
            const finishedTopic = finishedTopics.find((topic) => topic.title === finishedTitle);
            const order = LIBRARY.topicOrder[pick.subject] ?? [];

            expect(finishedTopic?.subject).toBe(pick.subject);
            expect(order.indexOf(finishedTopic?.id as string)).toBeLessThan(order.indexOf(pick.id));
          }
        }
      }

      it('says only what is true of the student sessions, on every card, for many histories', () => {
        const at = (offset: number) => TOPICS[offset % TOPICS.length] as LibraryTopic;

        for (const fit of STUDENTS) {
          TOPICS.forEach((_topic, offset) => {
            expectEveryReasonToBeTrue(fit, [
              finished(at(offset).id),
              open(at(offset + 1).id),
              finished(at(offset + 2).id),
              finished(at(offset + 3).id, 5),
              open(at(offset + 4).id),
              finished(at(offset + 4).id),
            ]);
          });
        }
      });

      it('suggests the next topic for every finished topic that has one at the student level', () => {
        for (const level of STUDENT_LEVELS) {
          const fit: StudentFit = { level, goal: 'class', interests: [] };
          for (const topic of TOPICS.filter((candidate) => candidate.levels.includes(level))) {
            const order = LIBRARY.topicOrder[topic.subject] ?? [];
            const expectedNextId = order
              .slice(order.indexOf(topic.id) + 1)
              .find((id) => TOPICS.find((candidate) => candidate.id === id)?.levels.includes(level));

            const [firstPick] = getPicksForStudent({ fit, history: [finished(topic.id)], continueCardSessionId: null }, LIBRARY);

            if (expectedNextId) expect(firstPick).toMatchObject({ id: expectedNextId, reason: `You finished ${topic.title}` });
            else expect(firstPick?.reason).not.toMatch(/^You finished/);
          }
        }
      });
    });
  });

  describe('a student with no sessions', () => {
    it('sees exactly the cards trunk showed a new student', () => {
      expect(getPickIds(null, LIBRARY)).toEqual([
        'jump-shot',
        'sunflower-spirals',
        'game-worlds',
        'saturn-rings',
        'bread-revolution',
        'van-gogh-motion',
      ]);
    });

    it('sees exactly the cards and reasons trunk showed a student with a profile', () => {
      const picks = getPicksWithNoHistory({ interests: ['Basketball', 'Space'], level: 'university', goal: 'exam' }, LIBRARY);

      expect(picks.map(({ id, reason }) => [id, reason])).toEqual([
        ['jump-shot', "Because you're into basketball"],
        ['rocket-escape', "Because you're into space"],
        ['free-throw-odds', "Because you're into basketball"],
        ['saturn-rings', "Because you're into space"],
        ['black-hole-edge', "Because you're into space"],
        ['derivative', 'Often on university exams'],
      ]);
    });
  });

  describe('a student with no profile', () => {
    it('sees only topics that suit every level, and is told it is a place to start', () => {
      const library = makeLibrary([
        makeTopic('one-level'),
        makeTopic('every-level', { levels: [...STUDENT_LEVELS] }),
      ]);

      expect(getPicksWithNoHistory(null, library).map(({ id, reason }) => ({ id, reason }))).toEqual([
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
      const picks = getPicksWithNoHistory(student, LIBRARY);

      expect(picks).toHaveLength(6);
      expect(new Set(picks.map((pick) => pick.id)).size).toBe(6);
      for (const pick of picks) {
        expect(pick.reason.trim()).not.toBe('');
        expect(LIBRARY.topics.find((topic) => topic.id === pick.id)?.levels).toContain(student.level);
      }
    });

    it('gives a new student six cards from six subjects', () => {
      const picks = getPicksWithNoHistory(null, LIBRARY);

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
