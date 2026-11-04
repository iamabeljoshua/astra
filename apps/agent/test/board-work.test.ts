import { type BrowserMessage, type ElementId, getBeatText, getCues, type Beat, type SceneCommand, type StudentWork } from '@astra/contracts';
import { describe, expect, it, vi } from 'vitest';
import { makeFakeTutorModel, type FakeReply } from '../src/providers/fake-model.ts';
import type { TutorModelRequest } from '../src/providers/types.ts';
import { createTutorBrain } from '../src/tutor/brain.ts';
import { createBoardWork } from '../src/tutor/watcher/board-work.ts';

const QUICK = { stillWorkingMs: 40, firstTextMs: 120, betweenTextMs: 80, finishGraceMs: 20, reportWaitMs: 5 };
const reply = (...pieces: string[]): FakeReply => ({ pieces });
const id = (value: string) => value as ElementId;
const line = (lineId: string, text: string, task?: string): StudentWork => ({ way: 'write', id: id(lineId), text, ...(task ? { task: id(task) } : {}) });
const SET_PROBLEM = 'Your turn. {"kind":"writeMath","id":"steps","tex":"2x + 3 = 11"}Try the next line. {"kind":"task","id":"a1","way":"write","on":"steps"}Go on.';

async function collect(brain: { reply: ReturnType<typeof createTutorBrain>['reply'] }, text: string): Promise<Beat[]> {
  const beats: Beat[] = [];
  for await (const beat of brain.reply({ text }, new AbortController().signal)) beats.push(beat);
  return beats;
}

const commandsOf = (beats: readonly Beat[]): SceneCommand[] => beats.flatMap((beat) => getCues(beat).map((cue) => cue.command));

function setup(replies: readonly (FakeReply | string)[]) {
  const requests: TutorModelRequest[] = [];
  let index = 0;
  const model = makeFakeTutorModel((request) => {
    requests.push(request);
    const next = replies[Math.min(index, replies.length - 1)] as FakeReply | string;
    index += 1;
    return typeof next === 'string' ? reply(next) : next;
  });
  const traces: string[] = [];
  const brain = createTutorBrain({ model, timeouts: QUICK, trace: (name) => traces.push(name) });
  return { brain, requests, traces };
}

const getNotes = (request: TutorModelRequest | undefined) => (request?.turns ?? []).filter((turn) => turn.role === 'system').map((turn) => JSON.parse((turn as { text: string }).text) as Record<string, Record<string, unknown>>);

describe('work on the shared board', () => {
  it('tells the tutor what code found, as a fact, on the very next turn', async () => {
    const { brain, requests } = setup([SET_PROBLEM, 'Not quite. Look at the eleven. What did you do to it?']);
    await collect(brain, 'help me');
    expect(brain.noteWork(line('s1', '2x = 14', 'a1'))?.checked.verdict.status).toBe('wrong');
    await collect(brain, '2x = 14');
    const note = getNotes(requests[1]).find((entry) => entry.student_work)?.student_work;
    expect(note).toMatchObject({ way: 'write', task: 'a1', line: 's1', read_as: ['2x=14'], check: 'wrong' });
  });

  it('finishes a task when the student reaches the answer', async () => {
    const { brain } = setup([SET_PROBLEM]);
    await collect(brain, 'help me');
    expect(brain.noteWork(line('s1', '2x = 8', 'a1'))?.checked.closesTask).toBeUndefined();
    expect(brain.noteWork(line('s2', 'x = 4', 'a1'))?.checked).toMatchObject({ verdict: { status: 'right' }, closesTask: 'a1' });
  });

  it('ignores a task name the tutor never set', async () => {
    const { brain } = setup([SET_PROBLEM]);
    await collect(brain, 'help me');
    expect(brain.noteWork(line('s1', 'x = 7', 'forged'))?.checked.verdict.status).toBe('unknown');
  });

  it('refuses a line id already used, or one that is not a student line', async () => {
    const { brain } = setup([SET_PROBLEM]);
    expect(brain.noteWork(line('steps', 'x = 4'))).toBeNull();
    expect(brain.noteWork(line('s1', 'x = 4'))).not.toBeNull();
    expect(brain.noteWork(line('s1', 'x = 5'))).toBeNull();
  });

  it('checks an exercise with no math in it', async () => {
    const task = '{"kind":"task","id":"a1","way":"place","items":["Bastille","Terror","Napoleon"],"slots":["First","Second","Third"],"answer":["Bastille","Terror","Napoleon"]}';
    const { brain } = setup([`Put these in order. ${task}Go on.`]);
    await collect(brain, 'teach me the French Revolution');
    expect(brain.noteWork({ way: 'place', task: id('a1'), placed: ['Terror', 'Bastille', null] })?.checked.verdict.status).toBe('unknown');
    expect(brain.noteWork({ way: 'place', task: id('a1'), placed: ['Terror', 'Bastille', 'Napoleon'] })?.checked.verdict).toMatchObject({ status: 'wrong' });
    expect(brain.noteWork({ way: 'place', task: id('a1'), placed: ['Bastille', 'Terror', 'Napoleon'] })?.checked).toMatchObject({ verdict: { status: 'right' }, closesTask: 'a1' });
  });

  it('counts a short answer the tutor gave as right, and leaves any other words to the tutor', async () => {
    const { brain } = setup(['When did it start? {"kind":"task","id":"a1","way":"write","reads":"words","accepts":["1789"]}Tell me.']);
    await collect(brain, 'teach me');
    expect(brain.noteWork(line('s1', 'i think it was around then', 'a1'))?.checked.verdict.status).toBe('unknown');
    expect(brain.noteWork(line('s2', '1789', 'a1'))?.checked).toMatchObject({ verdict: { status: 'right' }, closesTask: 'a1' });
  });

  it('never reads lines of code as math, and never judges them', async () => {
    const { brain } = setup(['Write it. {"kind":"task","id":"a1","way":"write","reads":"code"}Go on.']);
    await collect(brain, 'teach me loops');
    expect(brain.noteWork(line('s1', 'x = x + 1', 'a1'))?.checked).toMatchObject({ reading: { kind: 'code' }, verdict: { status: 'unknown' } });
  });
});

describe('marks and words code will not allow', () => {
  const MARK = (mark: string, target = 's1') => `{"kind":"annotate","id":"m1","target":"${target}","mark":"${mark}"}`;

  async function afterWork(typed: string, tutorSays: string) {
    const { brain, requests, traces } = setup([SET_PROBLEM, tutorSays, 'Look at the eleven again.']);
    await collect(brain, 'help me');
    brain.noteWork(line('s1', typed, 'a1'));
    const beats = await collect(brain, typed);
    return { beats, requests, traces, brain };
  }

  it('refuses a check on a wrong line, and a cross on a right one', async () => {
    expect(commandsOf((await afterWork('2x = 14', `Look ${MARK('check')}here.`)).beats).filter((command) => command.kind === 'annotate')).toEqual([]);
    expect(commandsOf((await afterWork('2x = 8', `Look ${MARK('cross')}here.`)).beats).filter((command) => command.kind === 'annotate')).toEqual([]);
  });

  it('refuses a check or a cross on work code cannot judge, and allows a note beside it', async () => {
    expect(commandsOf((await afterWork('3x + 1 = 7', `Look ${MARK('cross')}here.`)).beats).filter((command) => command.kind === 'annotate')).toEqual([]);
    const allowed = await afterWork('3x + 1 = 7', 'Look {"kind":"note","id":"n1","target":"s1","text":"a new one?"}here.');
    expect(commandsOf(allowed.beats).map((command) => command.kind)).toContain('note');
  });

  it('allows the right mark, and a circle on the student own term', async () => {
    const { beats } = await afterWork('2x = 14', `Not quite. ${MARK('cross')}Look {"kind":"highlight","id":"r1","target":"s1","tex":"14"}here.`);
    expect(commandsOf(beats).map((command) => command.kind)).toEqual(['annotate', 'highlight']);
  });

  it.each(['Yes, nice work.', 'Right, keep going.', "That's right, good.", 'Great, so far so good.'])('will not let "%s" be the answer to a wrong line', async (praise) => {
    const { beats, requests, traces } = await afterWork('2x = 14', praise);
    expect(traces).toContain('wordsRefused');
    expect(beats.map(getBeatText).join(' ')).toBe('Look at the eleven again.');
    expect(getNotes(requests[2]).some((note) => note.correction)).toBe(true);
  });

  it('lets the same words stand on a right line', async () => {
    const { beats, traces } = await afterWork('2x = 8', 'Yes, nice work.');
    expect(traces).not.toContain('wordsRefused');
    expect(beats.map(getBeatText).join(' ')).toBe('Yes, nice work.');
  });

  it.each(['So x is four.', 'x equals 4 here.', 'The answer is four.'])('will not let "%s" be said before the student has really tried', async (reveal) => {
    const { brain, traces } = setup([SET_PROBLEM, reveal, 'What could you take away first?']);
    await collect(brain, 'help me');
    const beats = await collect(brain, 'just tell me');
    expect(traces).toContain('wordsRefused');
    expect(beats.map(getBeatText).join(' ')).not.toMatch(/four|4/);
  });

  it('will not write the answer on the board early', async () => {
    const { brain } = setup([SET_PROBLEM, 'Look. {"kind":"writeMath","id":"final","tex":"x = 4"}Here it is.']);
    await collect(brain, 'help me');
    expect(commandsOf(await collect(brain, 'just tell me')).filter((command) => command.kind === 'writeMath')).toEqual([]);
  });

  it('lets the tutor give the answer once the student has had two real tries', async () => {
    const { brain, traces } = setup([SET_PROBLEM, 'Not yet.', 'Fine, so x is four.']);
    await collect(brain, 'help me');
    await collect(brain, 'just tell me');
    await collect(brain, 'just tell me, please');
    expect(traces).not.toContain('wordsRefused');
  });

  it('keeps a student line name for the student', async () => {
    const { brain } = setup(['Look {"kind":"text","id":"s9","text":"mine"}here.']);
    expect(commandsOf(await collect(brain, 'hi'))).toEqual([]);
  });

  it('keeps a task written after its question, and drops the words after it', async () => {
    const { brain } = setup(['Which term first? {"kind":"writeMath","id":"steps","tex":"2x + 3 = 11"}']);
    const beats = await collect(brain, 'hi');
    expect(beats.map(getBeatText).join(' ')).toBe('Which term first?');
    const late = setup(['Teach. {"kind":"writeMath","id":"steps","tex":"2x + 3 = 11"}Which first? It is the three. {"kind":"task","id":"a1","way":"pick","on":"steps","answer":["3"]}']);
    const lateBeats = await collect(late.brain, 'hi');
    expect(lateBeats.map(getBeatText).join(' ')).toBe('Teach. Which first?');
    expect(commandsOf(lateBeats).map((command) => command.kind)).toEqual(['writeMath', 'task']);
    expect(lateBeats.at(-1)?.expectsReply).toBe(true);
  });
});

describe('the board work seam', () => {
  const NOW = { value: 0 };
  function setupSeam(brainReplies: readonly string[], overrides: { isTutorTalking?: boolean } = {}) {
    const { brain } = setup(brainReplies);
    const speakUp = vi.fn();
    const writeLog = vi.fn();
    const readMeaning = vi.fn(async () => 'isThinking' as const);
    const seam = createBoardWork({ tutor: brain, writeLog, speakUp, isTutorTalking: () => overrides.isTutorTalking ?? false, getSecondsSinceQuestion: () => null, readMeaning, getNowMs: () => NOW.value, trace: () => {} });
    return { brain, seam, speakUp, writeLog, readMeaning };
  }
  const worked = (work: StudentWork): BrowserMessage & { type: 'worked' } => ({ type: 'worked', clockId: 'c', browserMs: 1, startedMsAgo: 0, work });
  const paused = (seconds: number, draft?: string): BrowserMessage & { type: 'paused' } => ({ type: 'paused', clockId: 'c', browserMs: 1, startedMsAgo: 0, seconds, ...(draft ? { draft } : {}) });

  it('stays quiet on a right line and logs it, and speaks on a wrong one', async () => {
    const { brain, seam, speakUp, writeLog } = setupSeam([SET_PROBLEM]);
    await collect(brain, 'help');
    seam.onWorked(worked(line('s1', '2x = 8', 'a1')));
    expect(speakUp).not.toHaveBeenCalled();
    seam.onWorked(worked(line('s2', '2x = 14', 'a1')));
    expect(speakUp).toHaveBeenCalledExactlyOnceWith('2x = 14');
    expect(writeLog).toHaveBeenCalledTimes(2);
  });

  it('holds off for 8 seconds mid-work with no model', async () => {
    const { brain, seam, speakUp, readMeaning } = setupSeam([SET_PROBLEM]);
    await collect(brain, 'help');
    await seam.onPaused(paused(8));
    await seam.onPaused(paused(8, '2x = 8'));
    expect(speakUp).not.toHaveBeenCalled();
    expect(readMeaning).not.toHaveBeenCalled();
  });

  it('never speaks on a reading the rule did not ask for, nor on a thought', async () => {
    const { brain, seam, speakUp, readMeaning } = setupSeam([SET_PROBLEM]);
    await collect(brain, 'help');
    await seam.onPaused(paused(3, 'so then i think'));
    expect(readMeaning).toHaveBeenCalledOnce();
    expect(speakUp).not.toHaveBeenCalled();
  });

  it('leans in on a wrong draft that has sat, and tells the tutor why', async () => {
    const { brain, seam, speakUp } = setupSeam([SET_PROBLEM, 'Okay, look at that.']);
    await collect(brain, 'help');
    await seam.onPaused(paused(10, '2x = 14'));
    expect(speakUp).toHaveBeenCalledExactlyOnceWith('(has paused)');
  });
});

