import type { ElementId, Task } from '@astra/contracts';
import { getLineTex, readLine } from '@astra/board/shared';
import { describe, expect, it } from 'vitest';
import { decideSpoken } from '../src/tutor/watcher/spoken-answer.ts';

const id = (value: string) => value as ElementId;
const MATH: Task = { kind: 'task', id: id('a1'), way: 'write', on: id('eq') };
const WORDS: Task = { kind: 'task', id: id('a1'), way: 'write', reads: 'words' };
const ORDER: Task = { kind: 'task', id: id('a1'), way: 'place', items: ['Bastille falls', 'The Terror', 'Napoleon rules'], slots: ['First', 'Second', 'Third'] };
const MATCH: Task = { kind: 'task', id: id('a1'), way: 'place', items: ['Na', 'Fe'], slots: ['Sodium', 'Iron'] };
const PICK: Task = { kind: 'task', id: id('a1'), way: 'pick', on: id('eq') };
const PARTS = [{ part: '2x', label: '2x' }, { part: '3', label: '3' }, { part: '11', label: '11' }];
const NODES = [{ part: 'sea', label: 'Sea' }, { part: 'cloud', label: 'Cloud' }];

describe('reading spoken math, as Muse writes it', () => {
  it.each([
    ['Two x equals eight.', '2x=8'],
    ['two x plus three equals eleven', '2x+3=11'],
    ['x equals four', 'x=4'],
    ['x is four', 'x=4'],
    ['X equals negative two.', 'x=-2'],
    ['two x equals fourteen', '2x=14'],
    ['x equals twenty three', 'x=23'],
    ['x equals twenty-three', 'x=23'],
    ['x equals two point five', 'x=2.5'],
    ['x squared minus four equals zero', 'x^{2}-4=0'],
    ['x squared over two equals eight.', 'x^{2}/2=8'],
    ['square root of sixteen equals four', '\\sqrt{16}=4'],
    ['y is equal to two x plus three', 'y=2x+3'],
    ['eight divided by two equals four', '\\frac{8}{2}=4'],
    ['b squared minus four a c', 'b^{2}-4ac'],
  ])('reads %s', (said, tex) => {
    expect(getLineTex(readLine(said))).toBe(tex);
  });

  it.each(['two apples', 'I have two brothers', 'over there', 'the first of many times'])('leaves %s as words, unchanged', (said) => {
    expect(readLine(said)).toMatchObject({ kind: 'words', parts: [{ type: 'words', text: said }] });
  });

  it('never fixes a wrong line or solves one', () => {
    expect(getLineTex(readLine('two plus two equals five'))).toBe('2+2=5');
  });
});

describe('whether something said is an answer', () => {
  it.each(['wait, why that step?', 'why that step', 'what do I do next', 'can you say that again', 'hold on', 'I am lost', "I don't get it", 'um', 'okay', 'yes', 'no', 'x equals four?'])('keeps "%s" as conversation', (said) => {
    expect(decideSpoken(said, MATH, []).act).toBe('talk');
    expect(decideSpoken(said, WORDS, []).act).toBe('talk');
  });

  it('takes no line when no task is open', () => {
    expect(decideSpoken('two x equals eight', null, []).act).toBe('talk');
  });

  it('lands plain spoken math on a math task, from code alone', () => {
    expect(decideSpoken('two x equals eight', MATH, [])).toEqual({ act: 'line', tex: '2x=8' });
  });

  it('asks the cheap model only when the words might be math it cannot read, or an answer in words', () => {
    expect(decideSpoken('to x equals ate', MATH, [])).toEqual({ act: 'askModel', expects: 'math' });
    expect(decideSpoken('they wanted the gunpowder', WORDS, [])).toEqual({ act: 'askModel', expects: 'words' });
    expect(decideSpoken('Paris', { kind: 'task', id: id('a1'), way: 'write', accepts: ['Paris'] }, [])).toEqual({ act: 'askModel', expects: 'words' });
    expect(decideSpoken('take three from both sides', MATH, []).act).toBe('talk');
  });

  it('never lands spoken lines on a code task', () => {
    expect(decideSpoken('for i in range three', { ...MATH, on: undefined, reads: 'code' } as Task, []).act).toBe('talk');
  });

  it.each([
    ['the plus three', PARTS, '3'],
    ['eleven', PARTS, '11'],
    ['two x', PARTS, '2x'],
    ['the sea', NODES, 'sea'],
    ['that would be the cloud', NODES, 'cloud'],
  ])('picks when "%s" names one part', (said, parts, part) => {
    expect(decideSpoken(said, PICK, parts)).toEqual({ act: 'pick', part });
  });

  it.each([['the sea or the cloud', NODES], ['something in the middle', NODES], ['seven', PARTS]])('leaves "%s" to the tutor, because it does not name one part', (said, parts) => {
    expect(decideSpoken(said, PICK, parts).act).toBe('talk');
  });

  it('places steps in the order they were said', () => {
    expect(decideSpoken('the bastille then the terror then napoleon', ORDER, [])).toEqual({ act: 'place', placed: ['Bastille falls', 'The Terror', 'Napoleon rules'] });
    expect(decideSpoken('napoleon then the terror then the bastille', ORDER, [])).toEqual({ act: 'place', placed: ['Napoleon rules', 'The Terror', 'Bastille falls'] });
  });

  it('places pairs when both sides are named', () => {
    expect(decideSpoken('iron is fe and sodium is na', MATCH, [])).toEqual({ act: 'place', placed: ['Na', 'Fe'] });
  });

  it('leaves it to the tutor when not every choice is named', () => {
    expect(decideSpoken('the bastille', ORDER, []).act).toBe('talk');
    expect(decideSpoken('sodium is na', MATCH, []).act).toBe('talk');
  });
});
