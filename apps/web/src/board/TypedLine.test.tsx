import type { BoardState } from '@astra/board';
import type { ElementId, StudentWork, Task } from '@astra/contracts';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBoardAt } from '@astra/board';
import { getOpenTaskOnBoard } from '@astra/board/shared';
import { BOARD_WORK_LABELS } from '../strings';
import { PlaceTask } from './PlaceTask';
import { TypedLine } from './TypedLine';

const id = (value: string) => value as ElementId;

function makeBoard(commands: readonly unknown[] = []): BoardState {
  return getBoardAt(commands.map((command, atMs) => ({ kind: 'command', atMs, command, overMs: null }) as never), Number.POSITIVE_INFINITY);
}

const PROBLEM = [{ kind: 'writeMath', id: 'steps', tex: '2x+3=11' }, { kind: 'task', id: 'a1', way: 'write', on: 'steps' }];

function setup(board: BoardState = makeBoard()) {
  const onWork = vi.fn<(work: StudentWork) => void>();
  const onPause = vi.fn<(seconds: number, draft?: string) => void>();
  render(<TypedLine task={getOpenTaskOnBoard(board)} getBoard={() => board} onWork={onWork} onPause={onPause} activity={0} />);
  const input = screen.getByRole<HTMLInputElement>('textbox', { name: BOARD_WORK_LABELS.entry });
  return { onWork, onPause, input };
}

const type = (input: HTMLInputElement, text: string) => fireEvent.change(input, { target: { value: text } });

describe('the typed line', () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it('always shows how the line is being read, as it is typed', () => {
    const { input } = setup();
    type(input, '2x + 3 = 11');
    expect(screen.getByTestId('read-as').textContent).toContain(`${BOARD_WORK_LABELS.readAs} ${BOARD_WORK_LABELS.kinds.math}`);
    type(input, 'i am lost');
    expect(screen.getByTestId('read-as').textContent).toContain(BOARD_WORK_LABELS.kinds.words);
    type(input, 'if x = 5 then');
    expect(screen.getByTestId('read-as').textContent).toContain(BOARD_WORK_LABELS.kinds.mixed);
  });

  it('shows hostile typing as text, with nothing run and no markup made', () => {
    const { input } = setup();
    type(input, '<img src=x onerror=alert(1)>');
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByTestId('line-preview').textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('sends a line on Enter, with a new id each time, and clears the entry', () => {
    const { input, onWork } = setup();
    type(input, 'hello');
    fireEvent.submit(input);
    type(input, 'there');
    fireEvent.submit(input);
    expect(onWork.mock.calls.map(([work]) => (work as { id: string }).id)).toEqual(['s1', 's2']);
    expect(input.value).toBe('');
  });

  it('names the open task, so the agent can check the line against the same problem', () => {
    const { input, onWork } = setup(makeBoard(PROBLEM));
    type(input, '2x = 14');
    fireEvent.submit(input);
    expect(onWork).toHaveBeenCalledWith({ way: 'write', id: id('s1'), text: '2x = 14', task: id('a1') });
  });

  it('lets a right line land by itself after a pause, and leaves a wrong one for the student', () => {
    const { input, onWork } = setup(makeBoard(PROBLEM));
    type(input, '2x = 14');
    act(() => void vi.advanceTimersByTime(5000));
    expect(onWork).not.toHaveBeenCalled();
    type(input, '2x = 8');
    act(() => void vi.advanceTimersByTime(2199));
    expect(onWork).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(2));
    expect(onWork).toHaveBeenCalledWith({ way: 'write', id: id('s1'), text: '2x = 8', task: id('a1') });
  });

  it('never lets a line asking a question land by itself', () => {
    const { input, onWork } = setup(makeBoard(PROBLEM));
    type(input, '2x = 8?');
    act(() => void vi.advanceTimersByTime(5000));
    expect(onWork).not.toHaveBeenCalled();
  });

  it('keeps a draft in the browser until a pause, and says only that much', () => {
    const { input, onPause } = setup();
    type(input, 'so i think');
    act(() => void vi.advanceTimersByTime(2900));
    expect(onPause).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(200));
    expect(onPause).toHaveBeenCalledExactlyOnceWith(3, 'so i think');
  });

  it('starts the pause clock again on every key', () => {
    const { input, onPause } = setup();
    type(input, 'so');
    act(() => void vi.advanceTimersByTime(2900));
    type(input, 'so i');
    act(() => void vi.advanceTimersByTime(2900));
    expect(onPause).not.toHaveBeenCalled();
  });
});

describe('the place task', () => {
  const TASK: Task & { way: 'place' } = { kind: 'task', id: id('a1'), way: 'place', items: ['Bastille', 'Terror'], slots: ['First', 'Second'], answer: ['Bastille', 'Terror'] };
  const open = { isOpen: true, verdict: null, lastLineTex: null, pickedRight: [], placed: [null, null], pointX: null };

  it('never shows the items in the order of the answer', () => {
    render(<PlaceTask task={TASK} progress={open} onWork={vi.fn()} />);
    expect(screen.getAllByTestId('place-item').map((item) => item.textContent)).toEqual(['Terror', 'Bastille']);
  });

  it('places by picking an item and then a slot, with no drag needed', () => {
    const onWork = vi.fn();
    render(<PlaceTask task={TASK} progress={open} onWork={onWork} />);
    fireEvent.click(screen.getByRole('button', { name: 'Bastille' }));
    fireEvent.click(screen.getByRole('button', { name: BOARD_WORK_LABELS.placeInSlot('First') }));
    expect(onWork).toHaveBeenCalledWith({ way: 'place', task: id('a1'), placed: ['Bastille', null] });
  });

  it('takes an item back out', () => {
    const onWork = vi.fn();
    render(<PlaceTask task={TASK} progress={{ ...open, placed: ['Terror', null] }} onWork={onWork} />);
    fireEvent.click(screen.getByRole('button', { name: BOARD_WORK_LABELS.clearSlot('Terror', 'First') }));
    expect(onWork).toHaveBeenCalledWith({ way: 'place', task: id('a1'), placed: [null, null] });
  });

  it('shows a replay as the student left it, and takes no work', () => {
    render(<PlaceTask task={TASK} progress={{ ...open, placed: ['Terror', null] }} />);
    expect(screen.getByRole('button', { name: BOARD_WORK_LABELS.clearSlot('Terror', 'First') })).toHaveProperty('disabled', true);
  });
});
