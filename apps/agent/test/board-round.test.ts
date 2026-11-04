import { type Beat, type ElementId, getBeatText, type SceneCommand, type StudentWork, type Task } from '@astra/contracts';
import { describe, expect, it, vi } from 'vitest';
import { makeFakeTutorModel, type FakeReply } from '../src/providers/fake-model.ts';
import type { TutorModelRequest } from '../src/providers/types.ts';
import { checkAgainstBoard, EMPTY_BOARD, getMemoryAfter, getMemoryAfterWork } from '../src/tutor/board-memory.ts';
import { createTutorBrain } from '../src/tutor/brain.ts';
import { createBoardWork } from '../src/tutor/watcher/board-work.ts';
import { decideSpoken } from '../src/tutor/watcher/spoken-answer.ts';
import { decideOnWork } from '../src/tutor/watcher/watch-rule.ts';
import { checkWorkOnBoard } from '@astra/board/shared';

const QUICK = { stillWorkingMs: 40, firstTextMs: 120, betweenTextMs: 80, finishGraceMs: 20, reportWaitMs: 5, checkingMathMs: 40 };
const id = (value: string) => value as ElementId;
const line = (lineId: string, text: string, task?: string): StudentWork => ({ way: 'write', id: id(lineId), text, ...(task ? { task: id(task) } : {}) });
const reply = (...pieces: string[]): FakeReply => ({ pieces });

function setup(replies: readonly string[]) {
  const requests: TutorModelRequest[] = [];
  let index = 0;
  const model = makeFakeTutorModel((request) => {
    requests.push(request);
    const next = replies[Math.min(index, replies.length - 1)] as string;
    index += 1;
    return reply(next);
  });
  const traces: string[] = [];
  const brain = createTutorBrain({ model, timeouts: QUICK, trace: (name) => traces.push(name) });
  return { brain, requests, traces };
}

async function collect(brain: ReturnType<typeof setup>['brain'], text: string): Promise<Beat[]> {
  const beats: Beat[] = [];
  for await (const beat of brain.reply({ text }, new AbortController().signal)) beats.push(beat);
  return beats;
}

const say = (beats: readonly Beat[]) => beats.map(getBeatText).join(' ');
const commandsOf = (beats: readonly Beat[]): SceneCommand[] => beats.flatMap((beat) => beat.script.filter((part): part is SceneCommand => typeof part !== 'string'));

const SET_PROBLEM = 'Fresh start. {"kind":"clearBoard"}Here it is. {"kind":"writeMath","id":"steps","tex":"2x + 3 = 11","claim":"new"}Go on.';

describe('a line noted between two turns', () => {
  it('keeps its verdict through the replay of a clearBoard, so its cross lands', async () => {
    const { brain, traces } = setup([SET_PROBLEM, 'Look here. {"kind":"annotate","id":"m1","target":"s1","mark":"cross"}That one does not follow.']);
    await collect(brain, 'give me a problem');
    expect(brain.noteWork(line('s1', '2x = 14'))?.checked.verdict).toEqual({ status: 'unknown', offProblem: '2x + 3 = 11' });
    const beats = await collect(brain, '2x = 14');
    expect(traces).not.toContain('commandRefused');
    expect(commandsOf(beats).some((command) => command.kind === 'annotate' && command.mark === 'cross')).toBe(true);
  });

  it('still refuses praise on the wrong line after that replay', async () => {
    const { brain, traces } = setup([SET_PROBLEM, 'Correct, well done.', 'Look at the sign on the three.']);
    await collect(brain, 'give me a problem');
    brain.noteWork(line('s1', '2x = 14'));
    expect(say(await collect(brain, '2x = 14'))).not.toMatch(/correct/i);
    expect(traces).toContain('wordsRefused');
  });
});

describe('a line code cannot judge', () => {
  it('cannot be called wrong in words, so base 2 is not told it is close', async () => {
    const { brain, traces } = setup(['Here we go. {"kind":"writeMath","id":"n","tex":"101 + 1","claim":"new"}Your go.', 'Close, but not quite. Start at the right.', 'How did you work that out?']);
    await collect(brain, 'teach me base two');
    expect(brain.noteWork(line('s1', '101 + 1 = 110'))?.checked.verdict.status).toBe('unknown');
    const said = say(await collect(brain, '101 + 1 = 110'));
    expect(traces).toContain('wordsRefused');
    expect(said).toBe('How did you work that out?');
  });

  it('sees through a filler in front of it', async () => {
    const { brain, traces } = setup(['Here we go. {"kind":"writeMath","id":"n","tex":"x^2","claim":"new"}Your go.', "Hmm, close, but that's not quite it.", 'What did you do to the x?']);
    await collect(brain, 'teach me derivatives');
    brain.noteWork(line('s1', 'x^2 = 2x'));
    expect(say(await collect(brain, 'x^2 = 2x'))).toBe('What did you do to the x?');
    expect(traces).toContain('wordsRefused');
  });

  it('leaves a reader free to answer words', async () => {
    const { brain, traces } = setup(['Tell me in words.', 'Close, and the sides do stay equal.']);
    await collect(brain, 'why do we do the same to both sides');
    brain.noteWork(line('s1', 'because of balance'));
    expect(say(await collect(brain, 'because of balance'))).toBe('Close, and the sides do stay equal.');
    expect(traces).not.toContain('wordsRefused');
  });
});

describe('a mark code refuses', () => {
  it('stops the words that lean on it, so the tutor never talks about a cross that was not drawn', async () => {
    const { brain, requests } = setup([SET_PROBLEM, 'Let me see. {"kind":"annotate","id":"m1","target":"s1","mark":"cross"}That cross is on your line.', 'Good step, carry on.']);
    await collect(brain, 'give me a problem');
    brain.noteWork(line('s1', '2x = 8'));
    const beats = await collect(brain, '2x = 8');
    expect(say(beats)).not.toContain('cross');
    expect(commandsOf(beats).some((command) => command.kind === 'annotate')).toBe(false);
    expect(requests).toHaveLength(3);
  });
});

describe('a note beside a line', () => {
  const memory = (status: 'right' | 'wrong' | 'unknown') => ({ ...EMPTY_BOARD, verdicts: new Map([['s1', status]]) });
  const note = (text: string): SceneCommand => ({ kind: 'note', id: id('n1'), target: id('s1'), text });

  it.each(['Correct!', 'Nice work', 'Yes', 'right'])('cannot say %s of wrong or unknown work', (text) => {
    expect(checkAgainstBoard(note(text), memory('wrong')).ok).toBe(false);
    expect(checkAgainstBoard(note(text), memory('unknown')).ok).toBe(false);
    expect(checkAgainstBoard(note(text), memory('right')).ok).toBe(true);
  });

  it('cannot call right work wrong', () => {
    expect(checkAgainstBoard(note('wrong sign'), memory('right')).ok).toBe(false);
    expect(checkAgainstBoard(note('wrong sign'), memory('wrong')).ok).toBe(true);
  });

  it('can say anything else', () => {
    expect(checkAgainstBoard(note('both sides?'), memory('wrong')).ok).toBe(true);
  });
});

describe('markValue', () => {
  const plot: SceneCommand = { kind: 'plot', id: id('curve'), expression: 'x^2', domain: [-3, 3], range: [0, 9] } as SceneCommand;
  const other: SceneCommand = { kind: 'plot', id: id('other'), expression: 'x', domain: [-3, 3], range: [-3, 3] } as SceneCommand;
  const dot = (target: string): SceneCommand => ({ kind: 'markValue', id: id('m1'), target: id(target), at: 1 } as SceneCommand);
  const withTask = (task: Task) => getMemoryAfter(task, getMemoryAfter(other, getMemoryAfter(plot, EMPTY_BOARD)));

  it('is refused only for a drag open on that curve', () => {
    const drag = withTask({ kind: 'task', id: id('a1'), way: 'drag', on: id('curve'), seek: 'flat' });
    expect(checkAgainstBoard(dot('curve'), drag).ok).toBe(false);
    expect(checkAgainstBoard(dot('other'), drag).ok).toBe(true);
  });

  it('is not refused for a words task', () => {
    expect(checkAgainstBoard(dot('curve'), withTask({ kind: 'task', id: id('a2'), way: 'write', reads: 'words' })).ok).toBe(true);
  });

  it('is free again after a words answer closes its task', () => {
    const asked: Task = { kind: 'task', id: id('a2'), way: 'write', reads: 'words' };
    const memory = withTask(asked);
    const work = line('s1', 'because it is flat', 'a2');
    const after = getMemoryAfterWork(work, { reading: { kind: 'words', parts: [], isAsking: false }, verdict: { status: 'unknown' }, closesTask: id('a2') }, memory);
    expect(after.openTask).toBeNull();
  });
});

describe('a tutor who opens on its own nod', () => {
  it('does not say it twice after code has said it', async () => {
    const { brain } = setup([SET_PROBLEM, 'Hm. That one does not follow.']);
    await collect(brain, 'give me a problem');
    brain.noteWork(line('s1', '2x = 14'));
    expect(say(await collect(brain, '2x = 14'))).toBe('That one does not follow.');
  });

  it('keeps it when code has not said one', async () => {
    const { brain } = setup(['Hm. What do you think?']);
    expect(say(await collect(brain, 'hello'))).toBe('Hm. What do you think?');
  });
});

describe('spoken answers under a math task', () => {
  const task: Task = { kind: 'task', id: id('a1'), way: 'write', on: id('steps') };

  it.each([
    ['four', '4'],
    ['the answer is four', 'x=4'],
    ['I think x is four', 'x=4'],
    ['um x equals four', 'x=4'],
    ['x is four', 'x=4'],
    ['um, the answer is four', 'x=4'],
    ['I think it is negative four', 'x=-4'],
    ['maybe eight', 'x=8'],
    ['so two x equals eight', '2x=8'],
  ])('%s lands as %s', (said, tex) => {
    expect(decideSpoken(said, task, [], 'x')).toMatchObject({ act: 'line', tex });
  });

  it.each(['um', 'okay', 'um what', 'is it four', 'four?', 'I think I am lost', 'thank you', 'I think we should stop'])('%s stays talk', (said) => {
    expect(decideSpoken(said, task, [], 'x').act).toBe('talk');
  });
});

describe('a right line with no task', () => {
  const work = line('s1', 'x = 4');
  const checked = { reading: { kind: 'math' as const, parts: [{ type: 'math' as const, text: 'x = 4', tex: 'x=4' }], isAsking: false }, verdict: { status: 'right' as const } };

  it('gets the reply a finished answer gets', () => {
    expect(decideOnWork(work, checked, true).act).toBe('reply');
  });

  it('waits on a right line that is not the answer', () => {
    expect(decideOnWork(line('s1', '2x = 8'), { reading: { kind: 'math', parts: [{ type: 'math', text: '2x = 8', tex: '2x=8' }], isAsking: false }, verdict: { status: 'right' } }, true).act).toBe('wait');
  });
});

describe('a typed line before any task has landed', () => {
  it('tells the tutor what code found, and the student hears Hm. at once', async () => {
    const { brain, requests } = setup([SET_PROBLEM, 'Look at the sign.']);
    await collect(brain, 'give me a problem');
    const speakUp = vi.fn();
    const work = createBoardWork({ tutor: brain, writeLog: vi.fn(), speakUp, isTutorTalking: () => true, getSecondsSinceQuestion: () => null, readMeaning: async () => null, readStrokes: async () => null, readSpokenWords: async () => ({ kind: 'talk' }) as never, writeHeardLog: vi.fn(), send: vi.fn(), getNowMs: () => 0, trace: vi.fn() });
    work.onWorked({ type: 'worked', clockId: 'c', browserMs: 0, startedMsAgo: 0, work: line('s1', '2x = 14') });
    expect(speakUp).toHaveBeenCalledWith('2x = 14');
    expect(work.takeNod()).toBe('Hm.');
    await collect(brain, '2x = 14');
    expect(JSON.stringify(requests.at(-1)?.turns)).toContain('\\"does_not_follow_from\\":\\"2x + 3 = 11\\"');
  });

  it('stays quiet on a right step, as under a task', async () => {
    const { brain } = setup([SET_PROBLEM]);
    await collect(brain, 'give me a problem');
    const speakUp = vi.fn();
    const work = createBoardWork({ tutor: brain, writeLog: vi.fn(), speakUp, isTutorTalking: () => false, getSecondsSinceQuestion: () => null, readMeaning: async () => null, readStrokes: async () => null, readSpokenWords: async () => ({ kind: 'talk' }) as never, writeHeardLog: vi.fn(), send: vi.fn(), getNowMs: () => 0, trace: vi.fn() });
    work.onWorked({ type: 'worked', clockId: 'c', browserMs: 0, startedMsAgo: 0, work: line('s1', '2x = 8') });
    expect(speakUp).not.toHaveBeenCalled();
  });
});

describe('a line the board cannot take', () => {
  function setupWork() {
    const speakUp = vi.fn();
    const noted = { checked: { verdict: { status: 'unknown' as const } }, hadTask: false };
    const noteWork = vi.fn().mockReturnValueOnce(noted).mockReturnValue(null);
    const work = createBoardWork({ tutor: { noteWork, noteWatcher: vi.fn(), getBoard: () => ({ state: { elements: new Map() } as never, openTask: null }) }, writeLog: vi.fn(), speakUp, isTutorTalking: () => false, getSecondsSinceQuestion: () => null, readMeaning: async () => null, readStrokes: async () => null, readSpokenWords: async () => ({ kind: 'talk' }) as never, writeHeardLog: vi.fn(), send: vi.fn(), getNowMs: () => 0, trace: vi.fn() });
    return { work, speakUp };
  }
  const message = (text: string) => ({ type: 'worked', clockId: 'c', browserMs: 0, startedMsAgo: 0, work: line('s1', text) }) as const;

  it('still reaches the tutor, so a refused line never means silence', () => {
    const { work, speakUp } = setupWork();
    work.onWorked(message('2x = 8'));
    speakUp.mockClear();
    work.onWorked(message('x = 4'));
    expect(speakUp).toHaveBeenCalledWith('x = 4');
  });

  it('stays quiet on the same line sent again across a rejoin', () => {
    const { work, speakUp } = setupWork();
    work.onWorked(message('hello there'));
    speakUp.mockClear();
    work.onWorked(message('hello there'));
    expect(speakUp).not.toHaveBeenCalled();
  });
});

describe('the board checks against the problem', () => {
  it('uses the same context on the agent as on the page', async () => {
    const { brain } = setup([SET_PROBLEM]);
    await collect(brain, 'give me a problem');
    expect(checkWorkOnBoard(line('s1', 'x = 7'), brain.getBoard().state).verdict).toEqual({ status: 'unknown', offProblem: '2x + 3 = 11' });
  });
});
