import { readFileSync } from 'node:fs';
import { type CheckedWork } from '@astra/board/shared';
import { parseBeat, type ElementId } from '@astra/contracts';
import { isTopicOnTheList, toListWords } from '@astra/contracts/topic-words';
import { describe, expect, it } from 'vitest';
import { playSession, type RecordStep } from '../src/learner-record/eval-sessions.ts';
import { getMemoryNote } from '../src/learner-record/memory-note.ts';
import { isCrisis, isPersonal } from '../src/learner-record/screens.ts';
import { createSessionDigest, type DigestEvent } from '../src/learner-record/session-digest.ts';
import { getTrustedNotes } from '../src/learner-record/trust-notes.ts';

const OPEN: RecordStep = { student: 'help me solve 2x + 3 = 11', tutor: 'What would you do first?', tutorWrites: '2x + 3 = 11' };
const RIGHT: CheckedWork = { verdict: { status: 'right' } };
const WRONG: CheckedWork = { verdict: { status: 'wrong', why: 'does not follow' } };

const readEvents = (steps: readonly RecordStep[]): readonly DigestEvent[] => {
  const reading = playSession(steps).read();
  if (!reading.canRemember) throw new Error(`Skipped by ${reading.why}`);
  return reading.events;
};

const getLine = (events: readonly DigestEvent[], text: string) => {
  const line = events.find((event) => event.text === text);
  if (!line) throw new Error(`No line reads ${text}`);
  return line.id;
};

const stepsWithWords = (words: string): RecordStep[] => [OPEN, { student: words, tutor: 'Okay. Back to the sum.' }, { work: { text: '2x = 8', status: 'right', task: 't1' }, tutor: 'Good.' }];

const judgeWords = (kind: string, topic: string, words: string) => {
  const events = readEvents(stepsWithWords(words));
  return getTrustedNotes([{ kind, topic, detail: null, evidence: [getLine(events, words)] }], events);
};

describe('what a note keeps of what a student said', () => {
  it.each([
    ['explored', 'lungs', 'i have asthma so i like learning about lungs', 'asthma'],
    ['explored', 'physics', 'we like physics at 14 allen avenue ikeja because emeka sits there and he is so fine', 'allen'],
    ['explored', 'biology', "i'm hiv positive and i love biology", 'hiv'],
    ['explored', 'biology', 'i love biology because i think i like girls', 'girls'],
    ['explored', 'blood', 'i have sickle cell so i like learning about blood', 'sickle'],
  ])('keeps the %s note on %s, and none of the words in %j', (kind, topic, words, secret) => {
    const { notes } = judgeWords(kind, topic, words);

    expect(notes).toHaveLength(1);
    expect(notes[0]?.evidence).toEqual([{ source: 'words', text: '', check: null }]);
    expect(JSON.stringify(notes)).not.toContain(secret);
  });

  it('keeps one mark for the student\'s words, however many lines the note cites', () => {
    const first = 'i like football';
    const second = 'i really love football';
    const events = readEvents([OPEN, { student: first, tutor: 'Okay.' }, { student: second, tutor: 'Okay.' }]);

    const { notes } = getTrustedNotes([{ kind: 'cares_about', topic: 'football', detail: null, evidence: [getLine(events, first), getLine(events, second)] }], events);

    expect(notes[0]?.evidence).toEqual([{ source: 'words', text: '', check: null }]);
  });
});

describe('what a board line keeps', () => {
  const addTyped = (text: string, checked: CheckedWork) => {
    const digest = createSessionDigest();
    digest.addTurn({ studentText: 'help me', spokenText: 'Sure.', endedAs: 'ended', beats: [] });
    digest.addWork({ way: 'write', id: 's1' as ElementId, text, task: 't1' as ElementId }, checked);
    const reading = digest.read();
    if (!reading.canRemember) throw new Error('Skipped');
    return reading.events.filter((event) => event.kind === 'board').map(({ text: kept }) => kept);
  };

  it.each([
    ['free words checked right', 'we live at 14 allen avenue ikeja', RIGHT],
    ['free words checked wrong', 'my snap is chi_oma2011', WRONG],
    ['a phone number read as a bare number', '08031234567', WRONG],
  ])('keeps no board line from %s', (_what, text, checked) => {
    expect(addTyped(text, checked)).toEqual([]);
  });

  it('keeps only the math of a line that mixes math with free words', () => {
    expect(addTyped('x = 4 my snap is chi_oma2011', RIGHT)).toEqual(['x = 4']);
  });

  it('keeps a plain line of checked math', () => {
    expect(addTyped('2x = 8', RIGHT)).toEqual(['2x = 8']);
  });

  it('keeps a task the student did, in the app\'s own words', () => {
    const digest = createSessionDigest();
    digest.addTurn({ studentText: 'help me', spokenText: 'Sure.', endedAs: 'ended', beats: [] });
    digest.addWork({ way: 'drag', task: 't1' as ElementId, x: 2, samples: [] }, RIGHT);
    const reading = digest.read();

    expect(reading.canRemember && reading.events.filter((event) => event.kind === 'board').map(({ text }) => text)).toEqual(['moved the point to x = 2']);
  });
});

describe('the words a topic may use', () => {
  const judge = (kind: string, topic: string) => judgeWords(kind, topic, `i love ${topic}`);

  it.each([
    ['cares_about', 'Kings College Lagos'],
    ['cares_about', 'Ikeja'],
    ['explored', 'being gay'],
    ['cares_about', 'vaping'],
    ['explored', 'sex education'],
    ['cares_about', 'bible stories'],
    ['cares_about', 'church music'],
    ['cares_about', 'lungs and asthma'],
    ['explored', 'rap ass'],
    ['cares_about', 'Emeka'],
    ['explored', 'weight loss'],
    ['explored', 'fractions and ramadan'],
  ])('refuses a %s note on %j', (kind, topic) => {
    const { notes, refused } = judge(kind, topic);

    expect(notes).toEqual([]);
    expect(refused).toEqual({ notOnTheList: 1 });
  });

  it.each([
    ['explored', 'fractions'],
    ['explored', 'photosynthesis'],
    ['explored', 'quadratic equations'],
    ['explored', 'the water cycle'],
    ['explored', 'the French Revolution'],
    ['explored', "Newton's laws of motion"],
    ['explored', 'solving 2x + 3 = 11'],
    ['cares_about', 'football'],
    ['cares_about', 'cooking'],
    ['cares_about', 'music'],
    ['cares_about', 'space'],
    ['cares_about', 'engineer'],
  ])('keeps a %s note on %j', (kind, topic) => {
    expect(judge(kind, topic).notes.map((note) => note.topic)).toEqual([topic]);
  });

  it('keeps ordinary interests to cares_about, so a board note cannot be about one', () => {
    const events = readEvents([OPEN, { work: { text: '2x = 8', status: 'right', task: 't1' }, tutor: 'anime helps here' }]);

    expect(getTrustedNotes([{ kind: 'showed', topic: 'anime', detail: null, evidence: [getLine(events, '2x = 8')] }], events).refused).toEqual({ notOnTheList: 1 });
    expect(isTopicOnTheList('cares_about', 'anime')).toBe(true);
  });

  it.each(['rape', 'raps', 'ass', 'being black', 'my school', 'thin', 'alcohol', 'smoking', 'ｇａｙ', 'g\u200Bay'])('matches whole words only, so %j is off every list', (topic) => {
    expect(isTopicOnTheList('cares_about', topic)).toBe(false);
    expect(isTopicOnTheList('explored', topic)).toBe(false);
  });

  it('drops a detail with a word off the list, and keeps the note', () => {
    const events = readEvents([OPEN, { student: 'i did not sleep because emeka called', tutor: 'Okay.' }, { work: { text: '2x = 14', status: 'wrong', why: 'sign', task: 't1' }, tutor: 'Look again.' }]);

    const { notes } = getTrustedNotes([{ kind: 'struggled', topic: 'the sign', detail: 'because emeka called', evidence: [getLine(events, '2x = 14')] }], events);

    expect(notes.map(({ topic, detail }) => [topic, detail])).toEqual([['the sign', null]]);
  });

  it('does not let the tutor read a stored topic that is off the list', () => {
    const makeNote = (topic: string) => ({ id: topic, kind: 'cares_about' as const, topic, detail: null, evidence: [{ source: 'words' as const, text: '', check: null }], sessionId: 's', sessionTitle: 't', notedAt: new Date('2026-11-01').toISOString() });

    const { memory } = getMemoryNote({ notes: [makeNote('Kings College Lagos'), makeNote('football')] }, new Date('2026-11-04'));

    expect(memory.notes.map(({ about }) => about)).toEqual(['football']);
  });
});

describe('the list against the lessons we teach', () => {
  const readPicksFile = <Shape>(name: string) => JSON.parse(readFileSync(new URL(`../../api/src/picks/${name}`, import.meta.url), 'utf8')) as Shape;
  const LIBRARY = readPicksFile<{ topics: { title: string; subject: string; interests: string[]; alsoCalled?: string[] }[] }>('library.json');
  const { deeper: DEEPER_SCENES } = readPicksFile<{ deeper: { titles: string[] }[] }>('deeper-scenes.json');
  const LEFT_OUT_OF_THE_LIBRARY = new Set([
    ...['sad', 'thin', 'burns', 'survive'], // Words about how someone feels or what happened to their body.
    ...['secret', 'hid', 'strangers'], // Words a disclosure uses.
    ...['city', 'athens'], // Places.
    ...['people', 'everyone', 'us', 'we', 'you'], // These name a person, and a note names a subject.
  ]);
  const getOffList = (text: string) => toListWords(text).filter((word) => !isTopicOnTheList('cares_about', word) && !LEFT_OUT_OF_THE_LIBRARY.has(word));

  it.each(LIBRARY.topics.map(({ title, subject, interests }) => [title, `${title} ${subject} ${interests.join(' ')}`] as const))('holds every word of the lesson %j, apart from those left out on purpose', (_title, words) => {
    expect(getOffList(words)).toEqual([]);
  });

  it.each(DEEPER_SCENES.flatMap(({ titles }) => titles))('holds every word of the deeper scene %j, apart from those left out on purpose', (title) => {
    expect(getOffList(title)).toEqual([]);
  });

  it.each(LIBRARY.topics.flatMap(({ alsoCalled = [] }) => alsoCalled))('holds the other name %j whole, so a note can use it', (otherName) => {
    expect(isTopicOnTheList('explored', otherName)).toBe(true);
  });

  it.each([
    ['rate of change', 'i really find the rate of change hard'],
    ['instantaneous rate of change', 'the instantaneous rate of change is hard for me'],
  ])('keeps a struggle with %j, the words a derivative lesson uses', (topic, words) => {
    expect(judgeWords('struggled', topic, words).notes.map((note) => note.topic)).toEqual([topic]);
  });

  it('keeps ordinary school topics', () => {
    const topics = ['fractions', 'photosynthesis', 'long division', 'the periodic table', 'simultaneous equations', 'the water cycle', 'chemical bonds', 'food chains', 'volcanoes', 'adjectives', 'the Pythagorean theorem', 'the cell membrane', 'percentages', 'electric circuits', 'Ohm law', 'supply and demand', 'poetry', 'the Industrial Revolution'];

    expect(topics.filter((topic) => !isTopicOnTheList('explored', topic))).toEqual([]);
  });
});

describe('a right line the tutor gave away is not something the student showed', () => {
  const textBeat = (text: string) => {
    const parsed = parseBeat({ id: 't2-b0', script: [{ kind: 'text', id: 'hint', text }, 'Here.'], expectsReply: false });
    if (!parsed.ok) throw new Error(parsed.problem);
    return parsed.value;
  };

  const judgeLine = (steps: readonly RecordStep[], line: string) => {
    const events = readEvents(steps);
    return getTrustedNotes([{ kind: 'showed', topic: 'moving a term', detail: null, evidence: [getLine(events, line)] }], events).notes;
  };

  it.each<[string, RecordStep[], string]>([
    ['written as a fraction and typed with a slash', [OPEN, { student: 'just tell me', tutor: 'Here.', tutorWrites: 'x = \\frac{1}{2}' }, { work: { text: 'x = 1/2', status: 'right', task: 't1' }, tutor: 'Yes.' }], 'x = 1/2'],
    ['said as words and typed as a fraction', [OPEN, { student: 'just tell me', tutor: 'So x is one half.' }, { work: { text: 'x = 1/2', status: 'right', task: 't1' }, tutor: 'Yes.' }], 'x = 1/2'],
    ['written one way and typed flipped', [OPEN, { student: 'just tell me', tutor: 'Here.', tutorWrites: 'x = 4' }, { work: { text: '4 = x', status: 'right', task: 't1' }, tutor: 'Yes.' }], '4 = x'],
    ['spoken only', [OPEN, { student: 'i have no clue', tutor: 'Take away three and you get two x equals eight, so x equals 4.' }, { work: { text: 'x = 4', status: 'right', task: 't1' }, tutor: 'Yes.' }], 'x = 4'],
    ['spoken as a number word alone', [OPEN, { student: 'i have no clue', tutor: 'The answer is four.' }, { work: { text: 'x = 4', status: 'right', task: 't1' }, tutor: 'Yes.' }], 'x = 4'],
  ])('refuses a line %s', (_what, steps, line) => {
    expect(judgeLine(steps, line)).toEqual([]);
  });

  it('refuses a line the tutor put in a text command', () => {
    const digest = createSessionDigest();
    digest.addTurn({ studentText: 'help me solve 2x + 3 = 11', spokenText: 'First?', endedAs: 'ended', beats: [] });
    digest.addTurn({ studentText: 'just tell me', spokenText: 'Here.', endedAs: 'ended', beats: [textBeat('x = 4')] });
    digest.addWork({ way: 'write', id: 's1' as ElementId, text: 'x = 4', task: 't1' as ElementId }, RIGHT);
    const reading = digest.read();
    if (!reading.canRemember) throw new Error('Skipped');
    const line = getLine(reading.events, 'x = 4');

    expect(getTrustedNotes([{ kind: 'showed', topic: 'moving a term', detail: null, evidence: [line] }], reading.events).notes).toEqual([]);
  });

  it.each([
    ['after the line', 'lol i just guessed, i dont know how'],
    ['after the line, plainly', 'that was a lucky guess'],
  ])('refuses a line the student says %s was a guess', (_when, words) => {
    expect(judgeLine([OPEN, { work: { text: 'x = 4', status: 'right', task: 't1' }, tutor: 'How did you get it?' }, { student: words, tutor: 'Okay.' }], 'x = 4')).toEqual([]);
  });

  it('refuses a line the student said beforehand they would guess', () => {
    expect(judgeLine([OPEN, { student: 'no idea, i will just guess', tutor: 'Go on.' }, { work: { text: 'x = 4', status: 'right', task: 't1' }, tutor: 'Yes.' }], 'x = 4')).toEqual([]);
  });

  it('keeps a line the student worked out from what the tutor said', () => {
    const notes = judgeLine([OPEN, { student: 'what next', tutor: 'Take away three and you get two x equals eight. Now what?' }, { work: { text: 'x = 4', status: 'right', task: 't1' }, tutor: 'Yes.' }], 'x = 4');

    expect(notes.map(({ kind }) => kind)).toEqual(['showed']);
  });

  it('forgets a number said long ago, but not a whole line written long ago', () => {
    const later = (text: string): RecordStep[] => [
      { student: 'next', tutor: 'Go on.' },
      { student: 'ok', tutor: 'Go on.' },
      { student: 'and', tutor: 'Go on.' },
      { work: { text, status: 'right', task: 't1' }, tutor: 'Yes.' },
    ];

    expect(judgeLine([OPEN, { student: 'what', tutor: 'Four things matter here.' }, ...later('x = 4')], 'x = 4').map(({ kind }) => kind)).toEqual(['showed']);
    expect(judgeLine([OPEN, { student: 'what', tutor: 'Here.', tutorWrites: 'x = 4' }, ...later('x = 4')], 'x = 4')).toEqual([]);
  });
});

describe('a liking is a plain thing the student says of themselves', () => {
  it.each([
    ['i used to love chemistry until this term', 'chemistry'],
    ['oh yeah i just love math so much, it is my favourite way to waste a sunday', 'math'],
    ['nobody likes chemistry, it is boring', 'chemistry'],
    ['i love math. not.', 'math'],
    ['i hate chemistry', 'chemistry'],
    ['chemistry is the worst, i would love to never see it again', 'chemistry'],
    ["chemistry isn't my favourite at all", 'chemistry'],
    ['do you think i like chemistry?', 'chemistry'],
    ['i LOVE chemistry, best thing ever', 'chemistry'],
    ['i like music but chemistry is awful', 'chemistry'],
    ['my brother loves football', 'football'],
    ['people like football', 'football'],
    ['i love football lol', 'football'],
  ])('refuses %j', (words, topic) => {
    const events = readEvents(stepsWithWords(words));
    const line = events.find((event) => event.text === words)?.id ?? 'w999';

    expect(getTrustedNotes([{ kind: 'cares_about', topic, detail: null, evidence: [line] }], events).notes).toEqual([]);
  });

  it.each([
    ['i love football', 'football'],
    ['i really like chemistry', 'chemistry'],
    ["i'm into space", 'space'],
    ['i want to be an engineer', 'engineer'],
    ['my favourite subject is biology', 'biology'],
    ['i play basketball', 'basketball'],
    ['ok so i like music', 'music'],
    ['fractions are hard but i love cooking', 'cooking'],
  ])('keeps %j', (words, topic) => {
    expect(judgeWords('cares_about', topic, words).notes.map((note) => note.topic)).toEqual([topic]);
  });
});

describe('the screens read past tricks of the text', () => {
  it.each(['ｋｍｓ', 'k​ms', 'i wanna ｄｉｅ', 'suícide'])('reads %j as a crisis', (words) => {
    expect(isCrisis(words)).toBe(true);
  });

  it.each(['my ｍｕｍ helps', 'my m​um helps', 'ｉ live in lagos'])('reads %j as personal', (words) => {
    expect(isPersonal(words)).toBe(true);
  });
});
