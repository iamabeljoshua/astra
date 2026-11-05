import { describe, expect, it } from 'vitest';
import type { ElementId, StudentWork } from '@astra/contracts';
import { decideOnReading, decideOnWork, decideWatch, WATCH_SECONDS, type WatchSituation, WORD_MEANINGS } from '../src/tutor/watcher/watch-rule.ts';
import { readLine } from '@astra/board/shared';

const QUIET: WatchSituation = { secondsPaused: 0, isTutorTalking: false, secondsSinceQuestion: null, secondsSinceSpokeUp: null, draft: null, unanswered: null, hasOpenTask: true, hasLeanedInOnThisSilence: false };
const wrongLine = { status: 'wrong', why: 'false' } as const;
const asDraft = (text: string, verdict: NonNullable<WatchSituation['draft']>['verdict'] = { status: 'unknown' }) => ({ text, reading: readLine(text), verdict });
const line = (text: string): StudentWork => ({ way: 'write', id: 's1' as ElementId, text });

describe('the watch rule decides timing, with no model', () => {
  it.each<[string, Partial<WatchSituation>]>([
    ['mid-work for 8 seconds', { secondsPaused: 8 }],
    ['a draft pause with a right line', { secondsPaused: 8, draft: asDraft('2x = 8', { status: 'right' }) }],
    ['a draft pause with a line code cannot judge', { secondsPaused: 8, draft: asDraft('y = 2x') }],
    ['a wrong draft before its time', { secondsPaused: WATCH_SECONDS.wrongLineSat - 1, draft: asDraft('2x = 14', wrongLine) }],
    ['words before their time', { secondsPaused: 2, draft: asDraft('this makes no sense') }],
    ['sent wrong work before its time', { secondsPaused: WATCH_SECONDS.wrongLineSat - 1, unanswered: { verdict: wrongLine, isSameWrongLineTwice: false } }],
    ['the tutor talking, however long the pause', { secondsPaused: 90, isTutorTalking: true, draft: asDraft('help me') }],
    ['a question still being answered', { secondsPaused: 90, secondsSinceQuestion: WATCH_SECONDS.afterQuestion - 1, draft: asDraft('help me') }],
    ['just after speaking up', { secondsPaused: 90, secondsSinceSpokeUp: WATCH_SECONDS.afterSpeakingUp - 1, draft: asDraft('help me') }],
    ['a long silence with no task, when the student may be listening', { secondsPaused: 90, hasOpenTask: false }],
    ['a long silence the tutor has already leaned in on', { secondsPaused: 90, hasLeanedInOnThisSilence: true }],
  ])('stays quiet: %s', (_, situation) => {
    expect(decideWatch({ ...QUIET, ...situation }).act).toBe('stay');
  });

  it.each<[string, Partial<WatchSituation>]>([
    ['words asking for help', { secondsPaused: WATCH_SECONDS.askingForHelp, draft: asDraft('i am stuck') }],
    ['a draft built on a wrong line', { secondsPaused: WATCH_SECONDS.builtOnWrongLine, draft: asDraft('x = 7', { ...wrongLine, isBuiltOnWrongLine: true }) }],
    ['a wrong draft that has sat', { secondsPaused: WATCH_SECONDS.wrongLineSat, draft: asDraft('2x = 14', wrongLine) }],
    ['the same wrong line twice', { secondsPaused: WATCH_SECONDS.sameWrongLineTwice, unanswered: { verdict: wrongLine, isSameWrongLineTwice: true } }],
    ['sent wrong work that has sat', { secondsPaused: WATCH_SECONDS.wrongLineSat, unanswered: { verdict: wrongLine, isSameWrongLineTwice: false } }],
    ['work code cannot judge that has sat', { secondsPaused: WATCH_SECONDS.unjudgedWorkSat, unanswered: { verdict: { status: 'unknown' }, isSameWrongLineTwice: false } }],
    ['a long silence', { secondsPaused: WATCH_SECONDS.nothingChanged }],
  ])('speaks up: %s', (_, situation) => {
    expect(decideWatch({ ...QUIET, ...situation }).act).toBe('speak');
  });

  it('asks a model what unsent words mean only when the rule says so', () => {
    expect(decideWatch({ ...QUIET, secondsPaused: WATCH_SECONDS.wordsToRead, draft: asDraft('this makes no sense') }).act).toBe('readWords');
  });

  it('never lets a reading alone interrupt', () => {
    const stays = { act: 'stay', why: 'the student is working' } as const;
    for (const meaning of [...WORD_MEANINGS, null]) expect(decideOnReading(stays, meaning)).toEqual(stays);
  });

  it('lets a reading answer the rule only when it asked', () => {
    const asks = { act: 'readWords' } as const;
    expect(decideOnReading(asks, 'asksForHelp').act).toBe('speak');
    expect(decideOnReading(asks, 'needsAPerson').act).toBe('speak');
    expect(decideOnReading(asks, 'isThinking').act).toBe('stay');
    expect(decideOnReading(asks, 'unclear').act).toBe('stay');
    expect(decideOnReading(asks, null).act).toBe('stay');
  });
});

describe('whether the tutor answers work now', () => {
  const WITH_TASK = true;
  const right = { reading: readLine('2x = 8'), verdict: { status: 'right' } } as const;

  it.each([
    ['a right line while working', '2x = 8', { status: 'right' }, undefined, 'wait'],
    ['a right line that finishes', 'x = 4', { status: 'right' }, 'a1', 'reply'],
    ['a wrong line', '2x = 14', wrongLine, undefined, 'reply'],
    ['a line code cannot judge', 'y = 2x', { status: 'unknown' }, undefined, 'wait'],
  ] as const)('%s', (_, text, verdict, closesTask, act) => {
    expect(decideOnWork(line(text), { reading: readLine(text), verdict, ...(closesTask ? { closesTask: closesTask as ElementId } : {}) }, WITH_TASK).act).toBe(act);
  });

  it.each(['hmm', 'ok', 'wait', 'let me think', 'Hmm...', 'okay.', 'mm'])('lets %s pass without a reply', (text) => {
    expect(decideOnWork(line(text), { reading: readLine(text), verdict: { status: 'unknown' } }, WITH_TASK).act).toBe('wait');
  });

  it.each(['my dad hits me', 'i want to hurt myself', 'help', 'no', 'stop', 'someone is following me', 'what is a vertex', 'i am scared to go home'])('always takes %s to the tutor, because words can hold anything', (text) => {
    expect(decideOnWork(line(text), { reading: readLine(text), verdict: { status: 'unknown' } }, WITH_TASK).act).toBe('reply');
  });

  it('takes a plain sentence to the tutor even inside a code task', () => {
    const text = 'someone is hurting me at home';
    expect(decideOnWork(line(text), { reading: readLine(text, 'code'), verdict: { status: 'unknown' } }, WITH_TASK).act).toBe('reply');
    expect(decideOnWork(line('x = x + 1'), { reading: readLine('x = x + 1', 'code'), verdict: { status: 'unknown' } }, WITH_TASK).act).toBe('wait');
  });

  it('takes a math line to the tutor when no task is open', () => {
    expect(decideOnWork(line('2x = 8'), right, false).act).toBe('reply');
  });

  it('waits for every slot, and answers a point the moment it is let go, wherever it landed', () => {
    const task = 'a1' as ElementId;
    expect(decideOnWork({ way: 'place', task, placed: ['a', null] }, { verdict: { status: 'unknown' } }, WITH_TASK).act).toBe('wait');
    expect(decideOnWork({ way: 'place', task, placed: ['a', 'b'] }, { verdict: wrongLine }, WITH_TASK).act).toBe('reply');
    expect(decideOnWork({ way: 'drag', task, x: 1, samples: [] }, { verdict: wrongLine }, WITH_TASK).act).toBe('reply');
    expect(decideOnWork({ way: 'drag', task, x: 2, samples: [] }, { verdict: { status: 'right' }, closesTask: task }, WITH_TASK).act).toBe('reply');
    expect(decideOnWork({ way: 'drag', task, x: 3, samples: [] }, { verdict: { status: 'unknown' } }, WITH_TASK).act).toBe('reply');
  });
});

describe('a line sent from the box with a number in it', () => {
  it.each(['20 m/s', '20m/s2', '0.5g', '2g', '11.2 / 2.4 = 4.7', '2*3', '11.2 km/s'])('%s goes to the tutor without waiting for a pause', (text) => {
    expect(decideOnWork(line(text), { reading: readLine(text), verdict: { status: 'unknown' } }, true).act).toBe('reply');
  });

  it.each(['2x', '2x + 3', 'y = 2x', '3a'])('%s is a step, so it waits', (text) => {
    expect(decideOnWork(line(text), { reading: readLine(text), verdict: { status: 'unknown' } }, true).act).toBe('wait');
  });
});
