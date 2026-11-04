import { describe, expect, it } from 'vitest';
import type { ElementId, ElementRef, LineReading, SceneCommand, StudentWork, Task } from '@astra/contracts';
import { type CheckedWork } from '@astra/board/shared';
import { checkAgainstBoard, EMPTY_BOARD, getMemoryAfter, getMemoryAfterWork, getMemoryOnComingBack, getWordsProblem } from '../src/tutor/board-memory.ts';
import { decideSpoken } from '../src/tutor/watcher/spoken-answer.ts';
import { decideOnWork } from '../src/tutor/watcher/watch-rule.ts';
import { getWorkNote } from '../src/tutor/watcher/work-note.ts';
import { TUTOR_SYSTEM } from '../src/tutor/prompt.ts';

const id = (value: string) => value as ElementId;
const ref = (value: string) => value as ElementRef;
const line: StudentWork = { way: 'write', id: id('s1'), text: '2x = 14' };
const reading: LineReading = { kind: 'math', parts: [{ type: 'math', text: '2x = 14', tex: '2x = 14' }], isAsking: false };
const offProblem: CheckedWork = { reading, verdict: { status: 'unknown', offProblem: '2x + 3 = 11' } };
const unjudged: CheckedWork = { reading, verdict: { status: 'unknown' } };
const onBoard = getMemoryAfter({ kind: 'writeMath', id: id('steps'), tex: '2x + 3 = 11', claim: 'new' }, EMPTY_BOARD);
const context = { task: null, getLineTex: () => null, getCurve: () => null, previousTex: null, pickedRight: [], problemTex: '2x + 3 = 11' };

describe('what the tutor may do with a line out of step with a guessed problem', () => {
  const memory = getMemoryAfterWork(line, offProblem, onBoard);
  const cross: SceneCommand = { kind: 'annotate', id: id('c1'), target: ref('s1'), mark: 'cross' };

  it('hears the fact', () => {
    expect(getWorkNote(line, offProblem, context)).toMatchObject({ check: 'unknown', does_not_follow_from: '2x + 3 = 11' });
  });

  it('may cross it, and may say it is wrong', () => {
    expect(checkAgainstBoard(cross, memory)).toEqual({ ok: true });
    expect(getWordsProblem('Not quite, look at the fourteen.', memory, true)).toBeNull();
    expect(checkAgainstBoard({ kind: 'note', id: id('n1'), target: id('s1'), text: 'wrong sign' }, memory)).toEqual({ ok: true });
  });

  it('may not tick or praise it', () => {
    expect(checkAgainstBoard({ kind: 'annotate', id: id('c1'), target: ref('s1'), mark: 'check' }, memory)).toMatchObject({ ok: false });
    expect(getWordsProblem('Yes, that is right.', memory, true)).not.toBeNull();
  });

  it('still may not cross a line code simply cannot read', () => {
    expect(checkAgainstBoard(cross, getMemoryAfterWork(line, unjudged, onBoard))).toMatchObject({ ok: false });
  });

  it('replies at once, so a line typed early is never met with silence', () => {
    expect(decideOnWork(line, offProblem, true).act).toBe('reply');
  });

  it('replies at once to an answer code cannot judge, as four buses is', () => {
    const answer: StudentWork = { way: 'write', id: id('s2'), text: 'x = 4' };
    const answerReading: LineReading = { kind: 'math', parts: [{ type: 'math', text: 'x = 4', tex: 'x = 4' }], isAsking: false };
    expect(decideOnWork(answer, { reading: answerReading, verdict: { status: 'unknown' } }, true).act).toBe('reply');
  });

  it('has the prompt name the fact and keep "Hm." away from agreement', () => {
    expect(TUTOR_SYSTEM).toContain('does_not_follow_from');
    expect(TUTOR_SYSTEM).toContain('came_back');
    expect(TUTOR_SYSTEM).toContain('Never open a reply with "Hm."');
  });
});

describe('a spoken answer with words around it', () => {
  const task: Task = { kind: 'task', id: id('t'), way: 'write', on: id('steps') };

  it.each([['Four.', '4'], ['four', '4'], ['It\'s four.', 'x=4'], ['The answer is four.', 'x=4'], ['the answer is four', 'x=4']])('lands %s', (said, tex) => {
    expect(decideSpoken(said, task, [], 'x')).toMatchObject({ act: 'line', tex });
  });

  it('gives a letter to a bare number only if code proves it, so a guess at what they answered cannot be crossed', () => {
    expect(decideSpoken('I got eight', task, [], 'x')).toEqual({ act: 'line', tex: 'x=8', bareTex: '8' });
  });

  it.each(['plus or minus three', 'x equals plus or minus three', 'It is plus or minus three.'])('does not read %s as one value', (said) => {
    expect(decideSpoken(said, task, [], 'x')).toMatchObject({ act: 'talk' });
  });
});

describe('a board that came back with the page', () => {
  const crossed = getMemoryAfter({ kind: 'annotate', id: id('c1'), target: ref('s1'), mark: 'cross' }, getMemoryAfterWork(line, offProblem, onBoard));
  const back = getMemoryOnComingBack(crossed);

  it.each([[{ kind: 'clearBoard' }], [{ kind: 'hide', target: 'c1' }], [{ kind: 'hide', target: 's1' }]])('refuses %j, and stops the words after it', (command) => {
    expect(checkAgainstBoard(command as never, back)).toMatchObject({ ok: false, isWrongMath: true });
  });

  it('allows the same once the student has moved on', () => {
    expect(checkAgainstBoard({ kind: 'clearBoard' }, crossed)).toEqual({ ok: true });
  });

  it('lets the tutor write on', () => {
    expect(checkAgainstBoard({ kind: 'highlight', id: id('r'), target: ref('s1'), tex: '14' }, back)).toEqual({ ok: true });
  });
});
