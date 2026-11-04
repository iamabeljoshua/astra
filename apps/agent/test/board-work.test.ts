import { type BrowserMessage, type ElementId, getBeatText, getCues, type Beat, type SceneCommand, type StudentWork } from '@astra/contracts';
import { describe, expect, it, vi } from 'vitest';
import { makeFakeTutorModel, type FakeReply } from '../src/providers/fake-model.ts';
import type { TutorModelRequest } from '../src/providers/types.ts';
import { createTutorBrain } from '../src/tutor/brain.ts';
import { createBoardWork } from '../src/tutor/watcher/board-work.ts';
import type { SpokenReading } from '../src/tutor/watcher/read-spoken.ts';

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
    const checked = brain.noteWork(line('s1', 'x = 7', 'forged'))?.checked;
    expect(checked?.verdict.status).toBe('wrong');
    expect(checked?.closesTask).toBeUndefined();
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

describe('changing the subject', () => {
  it('closes the task on a typed new topic, so later lines are not held to it', async () => {
    const { brain, requests } = setup([SET_PROBLEM, 'Sure, here goes.']);
    await collect(brain, 'help me');
    expect(brain.noteWork(line('s1', 'teach me physics of the impossible', 'a1'))?.checked).toMatchObject({ verdict: { status: 'unknown' }, closesTask: 'a1' });
    await collect(brain, 'teach me physics of the impossible');
    expect(getNotes(requests[1]).find((note) => note.student_work)?.student_work).toMatchObject({ left_the_task: true });
    expect(brain.getBoard().openTask).toBeNull();
    expect(brain.noteWork(line('s2', 'x = 7', 'a1'))?.checked.verdict.status).toBe('unknown');
  });

  it.each(["let's stop this", 'stop here', 'I want to move on', 'okay quit this', 'something else please'])('closes the task on "%s"', async (text) => {
    const { brain } = setup([SET_PROBLEM]);
    await collect(brain, 'help me');
    expect(brain.noteWork(line('s1', text, 'a1'))?.checked.closesTask).toBe('a1');
    expect(brain.getBoard().openTask).toBeNull();
  });

  it('keeps the task on a request for help with it', async () => {
    const { brain } = setup([SET_PROBLEM]);
    await collect(brain, 'help me');
    for (const [index, text] of ['teach me how to do this', 'teach me this', 'explain that step', 'can you help', 'stop'].entries()) {
      expect(brain.noteWork(line(`s${index + 1}`, text, 'a1'))?.checked.closesTask).toBeUndefined();
    }
  });

  it('closes the task when the tutor goes back to teaching', async () => {
    const { brain } = setup([SET_PROBLEM, 'Okay, {"kind":"boardMode","mode":"teach"}now we teach.']);
    await collect(brain, 'help me');
    await collect(brain, 'something');
    expect(brain.getBoard().openTask).toBeNull();
  });

  it('closes the task on a new topic said aloud, with no line', async () => {
    const { brain } = setup([SET_PROBLEM]);
    await collect(brain, 'help me');
    const send = vi.fn();
    const writeHeardLog = vi.fn();
    const seam = createBoardWork({ tutor: brain, writeLog: vi.fn(), speakUp: vi.fn(), isTutorTalking: () => false, getSecondsSinceQuestion: () => null, readMeaning: async () => null, readStrokes: async () => null, readSpokenWords: async () => ({ kind: 'talk', costUsd: 0 }), writeHeardLog, send, getNowMs: () => 0, trace: () => {} });
    await expect(seam.onSpoken('okay teach me physics of the impossible')).resolves.toBe(true);
    expect(send).toHaveBeenCalledWith({ type: 'workRead', work: { way: 'leave', task: 'a1' } });
    expect(brain.getBoard().openTask).toBeNull();
  });
});

describe('a page that floods the board', () => {
  it('holds a bounded number of notes, so the next request stays small', async () => {
    const { brain, requests } = setup(['Okay, go on.']);
    for (let index = 1; index <= 60; index += 1) brain.noteWork(line(`s${index}`, 'hmm'));
    await collect(brain, 'hi');
    expect(getNotes(requests[0]).filter((note) => note.student_work)).toHaveLength(20);
  });

  it('stops taking work after a session limit', () => {
    const { brain } = setup(['Okay.']);
    for (let index = 1; index <= 2000; index += 1) expect(brain.noteWork(line(`s${index}`, 'hmm'))).not.toBeNull();
    expect(brain.noteWork(line('s2001', 'hmm'))).toBeNull();
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

  it('lets the tutor say "right, so" once it has answered the wrong line', async () => {
    const { brain, traces } = setup([SET_PROBLEM, 'Not quite, look at the eleven.', 'Right, so what next?']);
    await collect(brain, 'help me');
    brain.noteWork(line('s1', '2x = 14', 'a1'));
    await collect(brain, '2x = 14');
    await collect(brain, 'oh i see');
    expect(traces).not.toContain('wordsRefused');
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
    const send = vi.fn();
    const writeHeardLog = vi.fn();
    const readStrokes = vi.fn(async () => ({ text: 'x = 4', ink: { tex: 'x=4', isUnsure: false } }));
    const readSpokenWords = vi.fn(async (): Promise<SpokenReading> => ({ kind: 'talk', costUsd: 0 }));
    const seam = createBoardWork({ tutor: brain, writeLog, speakUp, isTutorTalking: () => overrides.isTutorTalking ?? false, getSecondsSinceQuestion: () => null, readMeaning, readStrokes, readSpokenWords, writeHeardLog, send, getNowMs: () => NOW.value, trace: () => {} });
    return { brain, seam, speakUp, writeLog, readMeaning, send, writeHeardLog, readSpokenWords, readStrokes };
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

  it('reads the same strokes once, so a read begun at a rest is the one a finished line uses', async () => {
    const { brain, seam, readStrokes } = setupSeam([SET_PROBLEM]);
    await collect(brain, 'help');
    seam.onInkStroke({ action: 'inkStroke', id: id('s1-0'), points: [[0.1, 0.1, 0]] });
    seam.onInkPeek({ type: 'inkPeek', strokes: [id('s1-0')], clockId: 'c', browserMs: 1, startedMsAgo: 0 });
    seam.onInkPeek({ type: 'inkPeek', strokes: [id('s1-0')], clockId: 'c', browserMs: 2, startedMsAgo: 0 });
    await seam.onInkDone({ type: 'inkDone', id: id('s1'), strokes: [id('s1-0')], clockId: 'c', browserMs: 3, startedMsAgo: 0 });
    expect(readStrokes).toHaveBeenCalledOnce();
  });

  it('refuses a page that claims to have read or heard a line itself', async () => {
    const { brain, seam, writeLog } = setupSeam([SET_PROBLEM]);
    await collect(brain, 'help');
    seam.onWorked(worked({ way: 'write', id: id('s1'), text: 'x = 4', heard: { tex: 'x=4', isUnsure: false } }));
    seam.onWorked(worked({ way: 'write', id: id('s2'), text: 'x = 4', ink: { tex: 'x=4', isUnsure: false } }));
    expect(writeLog).not.toHaveBeenCalled();
  });

  it('checks a line set in the math keys by the math it holds', async () => {
    const { brain, seam, writeLog } = setupSeam([SET_PROBLEM]);
    await collect(brain, 'help');
    seam.onWorked(worked({ way: 'write', id: id('s1'), text: '(2x)=14', task: id('a1'), keyed: { tex: '2x=14', isUnsure: false } }));
    expect(writeLog.mock.calls[0]?.[1]).toMatchObject({ verdict: { status: 'wrong' } });
  });

  it('holds a reply while the hands are moving, and lets it go when they stop', async () => {
    const { seam } = setupSeam([SET_PROBLEM]);
    await expect(seam.waitWhileTyping()).resolves.toBeUndefined();
    seam.noteTyping();
    let isDone = false;
    const waiting = seam.waitWhileTyping().then(() => {
      isDone = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(isDone).toBe(false);
    NOW.value += 1300;
    await waiting;
    expect(isDone).toBe(true);
  });

  it('says the nod code chose over a wrong line, once, and tells the tutor it was said', async () => {
    const { brain, seam } = setupSeam([SET_PROBLEM, 'Look again.']);
    await collect(brain, 'help');
    seam.onWorked(worked(line('s1', '2x = 14', 'a1')));
    expect(seam.takeNod()).toBe('Hm.');
    expect(seam.takeNod()).toBeNull();
  });

  it('nods at a pick by what code found', async () => {
    const SET_PICK = '{"kind":"writeMath","id":"eq","tex":"2x+3=11","claim":"new"}{"kind":"task","id":"a1","way":"pick","on":"eq","answer":["+3"]}Which term first?';
    const right = setupSeam([SET_PICK]);
    await collect(right.brain, 'help');
    right.seam.onWorked(worked({ way: 'pick', task: id('a1'), part: '+3' }));
    expect(right.seam.takeNod()).toBe('Mm-hm.');
    const wrong = setupSeam([SET_PICK]);
    await collect(wrong.brain, 'help');
    wrong.seam.onWorked(worked({ way: 'pick', task: id('a1'), part: '11' }));
    expect(wrong.seam.takeNod()).toBe('Hm.');
    expect(wrong.brain.getBoard().openTask).toBeNull();
  });

  it('checks lines typed during a pick against the line they were picking from, and the finished answer ends it', async () => {
    const SET_PICK = '{"kind":"writeMath","id":"eq","tex":"2x+3=11","claim":"new"}{"kind":"task","id":"a1","way":"pick","on":"eq","answer":["+3"]}Which term first?';
    const { brain } = setupSeam([SET_PICK]);
    await collect(brain, 'help');
    expect(brain.noteWork(line('s1', '2x = 14', 'a1'))?.checked).toMatchObject({ verdict: { status: 'wrong' } });
    expect(brain.noteWork(line('s2', '2x = 8', 'a1'))?.checked).toMatchObject({ verdict: { status: 'right' } });
    expect(brain.getBoard().openTask).toBe('a1');
    expect(brain.noteWork(line('s3', 'x = 4', 'a1'))?.checked).toMatchObject({ verdict: { status: 'right' }, closesTask: 'a1' });
    expect(brain.getBoard().openTask).toBeNull();
  });

  it('counts a term written with and without its sign as one answer, so one click answers it', async () => {
    const SET_PICK = '{"kind":"writeMath","id":"eq","tex":"2x+3=11","claim":"new"}{"kind":"task","id":"a1","way":"pick","on":"eq","answer":["+3","3"]}Which term first?';
    const wrong = setupSeam([SET_PICK]);
    await collect(wrong.brain, 'help');
    wrong.seam.onWorked(worked({ way: 'pick', task: id('a1'), part: '11' }));
    expect(wrong.brain.getBoard().openTask).toBeNull();
  });

  it('leaves stock words out of a reply to work, because one could praise a wrong step', async () => {
    const { brain, seam } = setupSeam([SET_PROBLEM]);
    expect(seam.canSayStockWord()).toBe(true);
    await collect(brain, 'help');
    expect(seam.canSayStockWord()).toBe(false);
    seam.onWorked(worked(line('s1', '2x = 14', 'a1')));
    brain.noteWork(line('s2', 'teach me about black holes', 'a1'));
    expect(seam.canSayStockWord()).toBe(false);
    seam.noteAnswered();
    expect(seam.canSayStockWord()).toBe(true);
  });

  it('lands a spoken math line, with what code read, and asks the tutor nothing on a right step', async () => {
    const { brain, seam, send, writeHeardLog, readSpokenWords } = setupSeam([SET_PROBLEM]);
    await collect(brain, 'help');
    await expect(seam.onSpoken('Two x equals eight.')).resolves.toBe(false);
    expect(readSpokenWords).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith({ type: 'workRead', work: expect.objectContaining({ text: 'Two x equals eight.', heard: { tex: '2x=8', isUnsure: false } }) });
    expect(writeHeardLog.mock.calls[0]?.[1]).toMatchObject({ verdict: { status: 'right' } });
  });

  it('lands a wrong spoken line and has the tutor answer it, never fixed', async () => {
    const { brain, seam, send, writeHeardLog } = setupSeam([SET_PROBLEM]);
    await collect(brain, 'help');
    await expect(seam.onSpoken('two x equals fourteen')).resolves.toBe(true);
    expect(send).toHaveBeenCalledWith({ type: 'workRead', work: expect.objectContaining({ heard: { tex: '2x=14', isUnsure: false } }) });
    expect(writeHeardLog.mock.calls[0]?.[1]).toMatchObject({ verdict: { status: 'wrong' } });
  });

  it('keeps a question as conversation, so no line lands', async () => {
    const { brain, seam, send, readSpokenWords } = setupSeam([SET_PROBLEM]);
    await collect(brain, 'help');
    await expect(seam.onSpoken('wait, why that step?')).resolves.toBe(true);
    expect(send).not.toHaveBeenCalled();
    expect(readSpokenWords).not.toHaveBeenCalled();
  });

  it('lands a spoken answer in words as words, with no math made of it', async () => {
    const { brain, seam, send, readSpokenWords } = setupSeam(['{"kind":"task","id":"a1","way":"write","reads":"words"}Why did they storm it?']);
    await collect(brain, 'help');
    readSpokenWords.mockResolvedValueOnce({ kind: 'line', heard: { isUnsure: false }, costUsd: 0 });
    await expect(seam.onSpoken('They wanted the gunpowder.')).resolves.toBe(true);
    expect(readSpokenWords).toHaveBeenCalledWith('They wanted the gunpowder.', 'words');
    expect(send).toHaveBeenCalledWith({ type: 'workRead', work: expect.objectContaining({ text: 'They wanted the gunpowder.', heard: { isUnsure: false } }) });
  });

  it('judges nothing the reader doubted', async () => {
    const { brain, seam, writeHeardLog, readSpokenWords } = setupSeam([SET_PROBLEM]);
    await collect(brain, 'help');
    readSpokenWords.mockResolvedValueOnce({ kind: 'line', heard: { tex: 'x=7', isUnsure: true }, costUsd: 0 });
    await expect(seam.onSpoken('ex equals seven i think')).resolves.toBe(true);
    expect(writeHeardLog.mock.calls[0]?.[1]).toMatchObject({ verdict: { status: 'unknown' } });
  });

  it('reads a handwritten line, shows how it was read, and checks it like a typed one', async () => {
    const { brain, seam, speakUp, send, writeLog } = setupSeam([SET_PROBLEM]);
    await collect(brain, 'help');
    seam.onInkStroke({ action: 'inkStroke', id: id('s1-ink-0'), points: [[0.1, 0.1, 0]] });
    await seam.onInkDone({ type: 'inkDone', clockId: 'c', browserMs: 1, startedMsAgo: 0, id: id('s1'), strokes: [id('s1-ink-0')], task: id('a1') });
    expect(send).toHaveBeenCalledWith({ type: 'workRead', work: { way: 'write', id: 's1', text: 'x = 4', task: 'a1', ink: { tex: 'x=4', isUnsure: false } } });
    expect(writeLog.mock.calls[0]?.[1]).toMatchObject({ verdict: { status: 'right' }, closesTask: 'a1' });
    expect(speakUp).toHaveBeenCalledWith('x = 4');
  });

  it('never judges a line the reader doubted, and asks the tutor to ask', async () => {
    const { brain } = setupSeam([SET_PROBLEM]);
    await collect(brain, 'help');
    expect(brain.noteWork({ way: 'write', id: id('s1'), text: 'x = 7', task: id('a1'), ink: { tex: 'x=7', isUnsure: true } })?.checked.verdict.status).toBe('unknown');
  });

  it('refuses a page that says it read its own handwriting', () => {
    const { seam, writeLog } = setupSeam([SET_PROBLEM]);
    seam.onWorked(worked({ way: 'write', id: id('s1'), text: 'x = 4', ink: { tex: 'x=4', isUnsure: false } }));
    expect(writeLog).not.toHaveBeenCalled();
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

