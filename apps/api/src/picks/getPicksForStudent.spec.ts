import { STUDENT_GOALS, STUDENT_INTERESTS, STUDENT_LEVELS } from '../students/student-profile-options';
import type { StudentGoal, StudentInterest, StudentLevel } from '../students/student-profile-options';
import { getPicksForStudent } from './getPicksForStudent';
import type { StudentFit } from './getPicksForStudent';
import { LIBRARY } from './library';
import type { Library, LibraryTopic } from './library';
import type { LearnerNoteDto } from '../learner-record/learner-record.dto';
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
  return { topics, topicOrder };
}

const NOW = new Date('2026-11-05T12:00:00Z');
const LONG_AGO = new Date('2026-01-01T12:00:00Z');

function makeSession(fields: Partial<TopicSession> & { id: string }): TopicSession {
  return { topicId: null, title: fields.id, subject: 'Your question', artwork: null, status: 'finished', durationSeconds: 0, startedAt: LONG_AGO, ...fields };
}

function getPicksWithNoHistory(fit: StudentFit | null, library: Library) {
  return getPicksForStudent({ fit, history: [], continueCardSessionId: null, notes: [], now: NOW }, library);
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

      expect(getPickIds({ ...FIT, interests: ['basketball'] }, library)).toEqual(['high-school-plain']);
    });
  });

  describe('interests', () => {
    it('puts topics that match an interest ahead of the ones that come first in the library', () => {
      const library = makeLibrary([makeTopic('plain'), makeTopic('basketball', { interests: ['basketball'] })]);

      expect(getPickIds({ ...FIT, interests: ['basketball'] }, library)).toEqual(['basketball', 'plain']);
    });

    it('gives each interest a turn before the first one gets a second card', () => {
      const library = makeLibrary([
        makeTopic('basketball-1', { interests: ['basketball'] }),
        makeTopic('basketball-2', { interests: ['basketball'] }),
        makeTopic('football-1', { interests: ['football'] }),
      ]);

      expect(getPickIds({ ...FIT, interests: ['basketball', 'football'] }, library)).toEqual([
        'basketball-1',
        'football-1',
        'basketball-2',
      ]);
    });

    it('names only the chip that brought the card', () => {
      const library = makeLibrary([
        makeTopic('basketball', { interests: ['basketball'] }),
        makeTopic('football', { interests: ['football'] }),
      ]);
      const student: StudentFit = { ...FIT, interests: ['football'] };

      expect(getReasonOf('football', student, library)).toBe("Because you're into football");
      expect(getReasonOf('basketball', student, library)).toBe('Set at high school level');
    });

    it('claims no interest when the student chose none', () => {
      const library = makeLibrary([makeTopic('basketball', { interests: ['basketball'] })]);

      expect(getReasonOf('basketball', FIT, library)).toBe('Set at high school level');
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

      expect(getPicksWithNoHistory({ ...FIT, interests: ['basketball'] }, library)).toHaveLength(1);
      expect(getReasonOf('both', { ...FIT, interests: ['basketball'] }, library)).toBe("Because you're into basketball");
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
      return makeSession({ id: `finished-${topicId}`, topicId, durationSeconds });
    }

    function open(topicId: string, id = `open-${topicId}`): TopicSession {
      return makeSession({ id, topicId, status: 'in_progress', durationSeconds: 60 });
    }

    function getPicks(history: TopicSession[], continueCardSessionId: string | null = null, library = LIBRARY_LISTED_AGAINST_SUBJECT_ORDER) {
      return getPicksForStudent({ fit: FIT, history, continueCardSessionId, notes: [], now: NOW }, library);
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
      const STUDENTS: (StudentFit | null)[] = [null, ...STUDENT_LEVELS.map((level) => ({ level, goal: 'class' as const, interests: ['basketball' as const] }))];
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

            const [firstPick] = getPicksForStudent({ fit, history: [finished(topic.id)], continueCardSessionId: null, notes: [], now: NOW }, LIBRARY);

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
      const picks = getPicksWithNoHistory({ interests: ['basketball', 'space'], level: 'university', goal: 'exam' }, LIBRARY);

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
    const STUDENT_CHOICES: StudentInterest[][] = [[], ['basketball'], ['cooking', 'music']];
    const STUDENTS = STUDENT_LEVELS.flatMap((level) =>
      STUDENT_GOALS.flatMap((goal) =>
        STUDENT_CHOICES.map((interests) => ({ level, goal, interests })),
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

    it.each(STUDENT_INTERESTS)('claims no chip but %s when that is the one chosen', (interest) => {
      for (const level of STUDENT_LEVELS) {
        for (const goal of STUDENT_GOALS) {
          const claims = getPicksWithNoHistory({ interests: [interest], level, goal }, LIBRARY)
            .map((pick) => pick.reason)
            .filter((reason) => reason.startsWith('Because'));

          expect(new Set(claims)).toEqual(new Set([`Because you're into ${interest}`]));
        }
      }
    });

    it('claims no chip for a student who chose none', () => {
      for (const level of STUDENT_LEVELS) {
        for (const goal of STUDENT_GOALS) {
          const reasons = getPicksWithNoHistory({ interests: [], level, goal }, LIBRARY).map((pick) => pick.reason);

          expect(reasons.filter((reason) => reason.startsWith('Because'))).toEqual([]);
        }
      }
    });

    it('gives a new student six cards from six subjects', () => {
      const picks = getPicksWithNoHistory(null, LIBRARY);

      expect(picks).toHaveLength(6);
      expect(new Set(picks.map((pick) => pick.subject)).size).toBe(6);
    });

    it('shows two different students different cards', () => {
      const universityBasketball = getPickIds({ interests: ['basketball', 'space'], level: 'university', goal: 'exam' }, LIBRARY);
      const highSchoolCooking = getPickIds({ interests: ['cooking', 'music'], level: 'high_school', goal: 'class' }, LIBRARY);

      expect(universityBasketball.filter((id) => highSchoolCooking.includes(id))).toEqual([]);
    });
  });

  describe('from what the tutor has noted', () => {
    const NOTED_AT = new Date('2026-11-03T12:00:00Z');
    const BLOCK_ON_A_SLOPE = makeTopic('slope', { title: 'What holds a block on a slope', subject: 'Physics', openingLine: 'Which way does friction point on a slope?' });
    const JUMP_SHOT = makeTopic('jump-shot', { title: 'How a jump shot flies', subject: 'Physics', interests: ['basketball'] });
    const BRAKING = makeTopic('braking', { title: 'Why braking distance grows so fast', subject: 'Physics' });
    const QUADRATIC = makeTopic('quadratic', { title: 'What a quadratic is really asking', subject: 'Math', openingLine: 'What is this equation really asking?' });
    const PYTHAGORAS = makeTopic('pythagoras', { title: 'Why Pythagoras was right', subject: 'Math' });
    const NOTE_LIBRARY = makeLibrary(
      [BLOCK_ON_A_SLOPE, JUMP_SHOT, BRAKING, QUADRATIC, PYTHAGORAS, makeTopic('art'), makeTopic('music'), makeTopic('history'), makeTopic('code')],
      { Physics: ['jump-shot', 'slope', 'braking'], Math: ['quadratic', 'pythagoras'] },
    );

    function makeNote(kind: LearnerNoteDto['kind'], topic: string, fields: Partial<LearnerNoteDto> = {}): LearnerNoteDto {
      return { id: `note-${topic}`, kind, topic, detail: null, evidence: [{ source: 'words', text: topic, check: null }], sessionId: 'typed', sessionTitle: 'A question', notedAt: NOTED_AT, ...fields };
    }

    function getPicksFromNotes(notes: LearnerNoteDto[], { history = [], continueCardSessionId = null, library = NOTE_LIBRARY }: { history?: TopicSession[]; continueCardSessionId?: string | null; library?: Library } = {}) {
      return getPicksForStudent({ fit: FIT, history, continueCardSessionId, notes, now: NOW }, library);
    }

    const getFirstCard = (notes: LearnerNoteDto[], options?: Parameters<typeof getPicksFromNotes>[1]) => getPicksFromNotes(notes, options)[0];

    const WITHOUT_NOTES = getPicksFromNotes([]);

    describe('a struggle', () => {
      it('opens the cards with the library topic that names it, saying what happened and when', () => {
        expect(getFirstCard([makeNote('struggled', 'braking distance')])).toMatchObject({
          id: 'braking',
          topicId: 'braking',
          reason: 'You got stuck on braking distance',
          reasonDate: NOTED_AT,
          continueSessionId: null,
        });
      });

      it('offers a lesson on it when the library holds no topic for it, with a drawing and the session it came from', () => {
        const history = [makeSession({ id: 'typed', subject: 'Physics', artwork: 'forces' })];

        expect(getFirstCard([makeNote('struggled', 'free-body diagrams', { id: 'noted-once' })], { history })).toEqual({
          id: 'note-noted-once',
          topicId: null,
          title: 'Free-body diagrams',
          subject: 'Physics',
          lengthMinutes: 10,
          openingLine: null,
          reason: 'You got stuck on free-body diagrams',
          reasonDate: NOTED_AT,
          artwork: 'forces',
          continueSessionId: null,
        });
      });

      it('still has a picture when the session it came from has none', () => {
        const history = [makeSession({ id: 'typed' })];

        expect(getFirstCard([makeNote('struggled', 'free-body diagrams')], { history })?.artwork).toBeTruthy();
      });

      it('goes back to the library lesson it happened in, when its words name no topic', () => {
        const history = [makeSession({ id: 'lesson', topicId: 'jump-shot', durationSeconds: 10 })];

        expect(getFirstCard([makeNote('struggled', 'the second step', { sessionId: 'lesson' })], { history })).toMatchObject({
          id: 'jump-shot',
          reason: 'You got stuck on the second step',
        });
      });

      it('reopens an open lesson it names, so the topic stays within reach', () => {
        const history = [makeSession({ id: 'older-open', topicId: 'braking', status: 'in_progress' })];

        expect(getFirstCard([makeNote('struggled', 'braking distance')], { history })).toMatchObject({ id: 'braking', continueSessionId: 'older-open', reason: 'You got stuck on braking distance' });
      });

      it('never brings back a finished topic that it names', () => {
        const history = [makeSession({ id: 'done', topicId: 'braking', durationSeconds: 600 })];

        expect(getPicksFromNotes([makeNote('struggled', 'braking distance')], { history }).map((pick) => pick.id)).not.toContain('braking');
      });

      it('after a finished library lesson, offers its own subject instead of the finished topic', () => {
        const history = [makeSession({ id: 'done', topicId: 'jump-shot', title: 'How a jump shot flies', subject: 'Physics', artwork: 'arc', durationSeconds: 600 })];

        expect(getFirstCard([makeNote('struggled', 'parabolas', { sessionId: 'done' })], { history })).toMatchObject({ title: 'Parabolas', topicId: null, subject: 'Physics', artwork: 'arc', reason: 'You got stuck on parabolas' });
      });

      it.each(['the second step', 'this problem', 'x', '2x + 3', 'getting the answer'])('offers nothing for %s, which is not something to teach on its own', (topic) => {
        expect(getPicksFromNotes([makeNote('struggled', topic)])).toEqual(WITHOUT_NOTES);
      });

      it('waits while the session it came from is on the continue card', () => {
        const history = [makeSession({ id: 'open', status: 'in_progress' })];

        expect(getPicksFromNotes([makeNote('struggled', 'free-body diagrams', { sessionId: 'open' })], { history, continueCardSessionId: 'open' }).map((pick) => pick.reason)).not.toContain('You got stuck on free-body diagrams');
      });

      it('gives way to a later right answer on the same topic, however it was written', () => {
        const struggle = makeNote('struggled', 'free-body diagrams');
        const showed = makeNote('showed', 'Free body diagrams', { notedAt: new Date('2026-11-04T12:00:00Z') });

        expect(getPicksFromNotes([showed, struggle]).map((pick) => pick.reason)).not.toContain('You got stuck on free-body diagrams');
      });

      it('comes back when a later struggle follows a right answer', () => {
        const showed = makeNote('showed', 'free-body diagrams');
        const struggle = makeNote('struggled', 'free-body diagrams', { notedAt: new Date('2026-11-04T12:00:00Z') });

        expect(getFirstCard([struggle, showed])).toMatchObject({ title: 'Free-body diagrams', reasonDate: struggle.notedAt });
      });

      it('leaves once the student has gone back to it', () => {
        const history = [makeSession({ id: 'went-back', title: 'Free-body diagrams', startedAt: new Date('2026-11-04T12:00:00Z') })];

        expect(getPicksFromNotes([makeNote('struggled', 'free-body diagrams')], { history })).toEqual(WITHOUT_NOTES.map((pick) => pick));
      });

      it('leaves once the student has gone back to the library topic it pointed at', () => {
        const history = [makeSession({ id: 'went-back', topicId: 'braking', durationSeconds: 10, startedAt: new Date('2026-11-04T12:00:00Z') })];

        expect(getPicksFromNotes([makeNote('struggled', 'braking distance')], { history }).map((pick) => pick.reason)).not.toContain('You got stuck on braking distance');
      });

      it('shows two at most, newest first, so other cards keep their place', () => {
        const notes = ['one', 'two', 'three'].map((word) => makeNote('struggled', `${word} body problems`));

        expect(getPicksFromNotes(notes).filter((pick) => pick.reason.startsWith('You got stuck')).map((pick) => pick.title)).toEqual(['One body problems', 'Two body problems']);
      });
    });

    describe('something shown', () => {
      const RIGHT_LINE = [{ source: 'board' as const, text: 'x = 2', check: 'right' as const }];

      it('offers the library topic it builds on when the student has not started that topic', () => {
        expect(getFirstCard([makeNote('showed', 'solving quadratic equations', { evidence: RIGHT_LINE })])).toMatchObject({ id: 'quadratic', reason: 'You got solving quadratic equations right', reasonDate: NOTED_AT });
      });

      it('offers the next topic in the subject after a lesson they have done', () => {
        const history = [makeSession({ id: 'lesson', topicId: 'quadratic', durationSeconds: 600 })];

        expect(getFirstCard([makeNote('showed', 'completing the square', { sessionId: 'lesson', evidence: RIGHT_LINE })], { history })).toMatchObject({ id: 'pythagoras', reason: 'You got completing the square right' });
      });

      it('offers nothing when the library has nothing to build on', () => {
        expect(getPicksFromNotes([makeNote('showed', 'free-body diagrams', { evidence: RIGHT_LINE })])).toEqual(WITHOUT_NOTES);
      });
    });

    describe('something they care about', () => {
      it('offers a topic that names it, or that the library lists under that interest', () => {
        expect(getFirstCard([makeNote('cares_about', 'rainbows')], { library: makeLibrary([makeTopic('plain'), makeTopic('rainbow', { title: 'Why a rainbow is always round' })]) })).toMatchObject({ id: 'rainbow', reason: "You said you're into rainbows", reasonDate: NOTED_AT });
        expect(getFirstCard([makeNote('cares_about', 'basketball')])).toMatchObject({ id: 'jump-shot', reason: "You said you're into basketball" });
      });

      it('offers nothing when the library has no such topic, because a liking is not a lesson', () => {
        expect(getPicksFromNotes([makeNote('cares_about', 'minecraft')])).toEqual(WITHOUT_NOTES);
      });

      it('skips a topic they have already started', () => {
        const history = [makeSession({ id: 'done', topicId: 'jump-shot', durationSeconds: 600 })];

        expect(getPicksFromNotes([makeNote('cares_about', 'basketball')], { history }).map((pick) => pick.reason)).not.toContain("You said you're into basketball");
      });
    });

    describe('the order of the cards', () => {
      it('goes struggle, shown, cared about, carry on, next topic, then what fits', () => {
        const library = makeLibrary(
          [BLOCK_ON_A_SLOPE, JUMP_SHOT, BRAKING, QUADRATIC, PYTHAGORAS, makeTopic('open', { subject: 'Art' }), makeTopic('finished', { subject: 'Music' }), makeTopic('after-finished', { subject: 'Music' }), makeTopic('plain')],
          { Physics: ['jump-shot', 'slope', 'braking'], Math: ['quadratic', 'pythagoras'], Music: ['finished', 'after-finished'] },
        );
        const notes = [makeNote('cares_about', 'basketball'), makeNote('showed', 'quadratic equations'), makeNote('struggled', 'braking distance')];
        const history = [makeSession({ id: 'open', topicId: 'open', status: 'in_progress' }), makeSession({ id: 'finished', topicId: 'finished', durationSeconds: 600 })];

        expect(getPicksFromNotes(notes, { history, library }).map((pick) => pick.id)).toEqual(['braking', 'quadratic', 'jump-shot', 'open', 'after-finished', 'plain']);
      });

      it('keeps two topics in progress on the screen, however much the record holds', () => {
        const notes = [
          makeNote('struggled', 'first body problems'),
          makeNote('struggled', 'second body problems'),
          makeNote('struggled', 'third body problems'),
          makeNote('showed', 'quadratic equations'),
          makeNote('cares_about', 'basketball'),
        ];
        const history = [makeSession({ id: 'open-art', topicId: 'art', status: 'in_progress' }), makeSession({ id: 'open-music', topicId: 'music', status: 'in_progress' })];

        expect(getPicksFromNotes(notes, { history }).map((pick) => pick.continueSessionId).filter(Boolean)).toEqual(['open-art', 'open-music']);
        expect(getPicksFromNotes(notes, { history })).toHaveLength(6);
      });

      it('passes the cap on a subject, like the rest of what is known about the student', () => {
        const notes = [makeNote('struggled', 'braking distance'), makeNote('struggled', 'block slope'), makeNote('cares_about', 'basketball')];

        expect(getPicksFromNotes(notes).slice(0, 3).map((pick) => pick.subject)).toEqual(['Physics', 'Physics', 'Physics']);
      });
    });

    describe('what never counts', () => {
      it('gives the same cards as no notes when a note is deleted, because only the notes given can count', () => {
        const before = getPicksFromNotes([makeNote('struggled', 'braking distance')]);

        expect(before).not.toEqual(WITHOUT_NOTES);
        expect(getPicksFromNotes([])).toEqual(WITHOUT_NOTES);
      });

      it('leaves out a note the tutor has also stopped reading', () => {
        const old = new Date(NOW.getTime() - 121 * 24 * 60 * 60 * 1000);

        expect(getPicksFromNotes([makeNote('struggled', 'braking distance', { notedAt: old })])).toEqual(WITHOUT_NOTES);
      });

      it('ignores what they only looked at', () => {
        expect(getPicksFromNotes([makeNote('explored', 'braking distance')])).toEqual(WITHOUT_NOTES);
      });

      it.each([
        ['a topic', { topic: 'anxiety before exams' }],
        ['a topic', { topic: 'depression' }],
        ['a topic', { topic: 'eating disorders' }],
        ['a topic', { topic: 'self-harm' }],
        ['a topic', { topic: 'my diabetes' }],
        ['a topic', { topic: 'mental health' }],
        ['a detail', { detail: 'felt too anxious to go on' }],
        ['the evidence', { evidence: [{ source: 'words' as const, text: 'braking makes me so stressed i want to die', check: null }] }],
        ['the session title', { sessionTitle: 'why do i feel so hopeless' }],
      ])('never makes a card from distress or health in %s', (_where, fields) => {
        expect(getPicksFromNotes([makeNote('struggled', 'braking distance', fields)])).toEqual(WITHOUT_NOTES);
      });

      it('lets an unsafe newest note silence the older ones on its topic', () => {
        const unsafe = makeNote('struggled', 'braking distance', { detail: 'it made me cry', notedAt: new Date('2026-11-04T12:00:00Z') });

        expect(getPicksFromNotes([unsafe, makeNote('struggled', 'braking distance')])).toEqual(WITHOUT_NOTES);
      });

      it('claims no day on a card that does not come from a note', () => {
        expect(WITHOUT_NOTES.every((pick) => pick.reasonDate === null)).toBe(true);
      });

      it('says only what a note says, and shames nobody', () => {
        const reasons = getPicksFromNotes([makeNote('struggled', 'free-body diagrams')]).map((pick) => pick.reason).join(' ');

        expect(reasons).not.toMatch(/\b(?:failed|wrong|bad at|weak|poor|mistake)\b/i);
      });
    });
  });
});
