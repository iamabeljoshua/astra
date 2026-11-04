import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CodeField } from './CodeField';

const LABEL = 'Code';

function ControlledCodeField({ onComplete, initialValue = '' }: { onComplete: (value: string) => void; initialValue?: string }) {
  const [value, setValue] = useState(initialValue);
  return <CodeField label={LABEL} value={value} length={6} onChange={setValue} onComplete={onComplete} />;
}

function getField() {
  return screen.getByRole<HTMLInputElement>('textbox', { name: LABEL });
}

function getBoxes(container: HTMLElement) {
  return [...container.querySelectorAll('[aria-hidden="true"]')];
}

function getMarkedBoxes(container: HTMLElement) {
  return getBoxes(container).flatMap((box, index) => (box.getAttribute('data-active') === 'true' ? [index] : []));
}

describe('CodeField', () => {
  it('gives a screen reader one field, with the attributes a phone needs to offer the code', () => {
    const { container } = render(<ControlledCodeField onComplete={vi.fn()} />);

    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(getField().getAttribute('autocomplete')).toBe('one-time-code');
    expect(getField().getAttribute('inputmode')).toBe('numeric');
    expect(getBoxes(container)).toHaveLength(6);
  });

  it('shows each digit in its own box and completes at the sixth', () => {
    const onComplete = vi.fn();
    const { container } = render(<ControlledCodeField onComplete={onComplete} />);

    fireEvent.change(getField(), { target: { value: '12345' } });
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.change(getField(), { target: { value: '123456' } });

    expect(getBoxes(container).map((box) => box.textContent).join('')).toBe('123456');
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it.each([
    ['spaces', '123 456'],
    ['a dash', '123-456'],
    ['words around it', 'Your code: 123456.'],
    ['Arabic digits', '١٢٣٤٥٦'],
  ])('reads a pasted code with %s', (_caseName, pasted) => {
    const onComplete = vi.fn();
    render(<ControlledCodeField onComplete={onComplete} />);

    fireEvent.change(getField(), { target: { value: pasted } });

    expect(getField().value).toBe('123456');
    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it('refuses letters and stops at six digits', () => {
    const onComplete = vi.fn();
    render(<ControlledCodeField onComplete={onComplete} initialValue="12" />);

    fireEvent.change(getField(), { target: { value: '12a' } });
    expect(getField().value).toBe('12');
    fireEvent.change(getField(), { target: { value: '12345678' } });

    expect(getField().value).toBe('123456');
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['the minutes before the code', 'Type this code on the Astra sign-in page. It works for 10 minutes.\n123456\nOnly your newest code works.'],
    ['the minutes after the code', 'Your code is 123456. It works for 10 minutes.'],
    ['Arabic digits', 'يعمل لمدة ١٠ دقائق ١٢٣٤٥٦'],
  ])('finds the code in a whole pasted mail, with %s', (_caseName, pasted) => {
    const onComplete = vi.fn();
    render(<ControlledCodeField onComplete={onComplete} />);

    fireEvent.input(getField(), { target: { value: pasted }, data: pasted, inputType: 'insertFromPaste' });

    expect(getField().value).toBe('123456');
    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it('reads a code split by a space even when the mail holds a shorter number after it', () => {
    const onComplete = vi.fn();
    render(<ControlledCodeField onComplete={onComplete} />);

    fireEvent.change(getField(), { target: { value: 'Your code is 123 456. It works for 10 minutes.' } });

    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it.each([
    ['a letter', 'x'],
    ['a space', ' '],
    ['a pasted word', 'code'],
  ])('ignores %s typed over a marked digit, and keeps the mark', (_caseName, stray) => {
    const { container } = render(<ControlledCodeField onComplete={vi.fn()} initialValue="124" />);
    getField().focus();
    getField().setSelectionRange(1, 1);
    fireEvent.select(getField());

    fireEvent.input(getField(), { target: { value: `1${stray}4` }, data: stray, inputType: 'insertText' });

    expect(getField().value).toBe('124');
    expect(getMarkedBoxes(container)).toEqual([1]);
  });

  it('still lets a digit typed over a marked digit replace it', () => {
    const { container } = render(<ControlledCodeField onComplete={vi.fn()} initialValue="124" />);
    getField().focus();
    getField().setSelectionRange(1, 1);
    fireEvent.select(getField());

    fireEvent.input(getField(), { target: { value: '194' }, data: '9', inputType: 'insertText' });

    expect(getField().value).toBe('194');
    expect(getBoxes(container).map((box) => box.textContent).join('')).toBe('194');
  });

  it('marks the box the caret is on, and no box without focus', () => {
    const { container } = render(<ControlledCodeField onComplete={vi.fn()} initialValue="123" />);
    const activeBoxes = () => getBoxes(container).flatMap((box, index) => (box.getAttribute('data-active') === 'true' ? [index] : []));

    expect(activeBoxes()).toEqual([]);
    getField().focus();
    getField().setSelectionRange(1, 1);
    fireEvent.select(getField());

    expect(activeBoxes()).toEqual([1]);
    fireEvent.blur(getField());
    expect(activeBoxes()).toEqual([]);
  });

  it('selects the digit under the caret, so typing replaces it', () => {
    render(<ControlledCodeField onComplete={vi.fn()} initialValue="123" />);

    getField().setSelectionRange(1, 1);
    fireEvent.select(getField());

    expect([getField().selectionStart, getField().selectionEnd]).toEqual([1, 2]);
  });

  it('moves one box at a time with the arrow keys, in both directions', () => {
    const { container } = render(<ControlledCodeField onComplete={vi.fn()} initialValue="123" />);
    const activeBox = () => getBoxes(container).findIndex((box) => box.getAttribute('data-active') === 'true');
    getField().focus();
    getField().setSelectionRange(3, 3);
    fireEvent.select(getField());

    fireEvent.keyDown(getField(), { key: 'ArrowLeft' });
    expect(activeBox()).toBe(2);
    fireEvent.keyDown(getField(), { key: 'ArrowLeft' });
    expect(activeBox()).toBe(1);
    fireEvent.keyDown(getField(), { key: 'ArrowRight' });
    expect(activeBox()).toBe(2);
  });

  it.each([
    ['after the typed digits', '12', '12125091', '125091'],
    ['over a selected digit', '12', '1250912', '125091'],
  ])('lets a whole code that arrives at once replace the digits, pasted %s', (_caseName, typed, inField, pasted) => {
    const onComplete = vi.fn();
    render(<ControlledCodeField onComplete={onComplete} initialValue={typed} />);

    fireEvent.input(getField(), { target: { value: inField }, data: pasted, inputType: 'insertFromPaste' });

    expect(getField().value).toBe(pasted);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith(pasted);
  });

  it('adds a pasted part of a code to the digits already there', () => {
    const onComplete = vi.fn();
    render(<ControlledCodeField onComplete={onComplete} initialValue="12" />);

    fireEvent.input(getField(), { target: { value: '1234' }, data: '34', inputType: 'insertFromPaste' });

    expect(getField().value).toBe('1234');
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('brings the mark back to the first box when the boxes are emptied from outside', () => {
    const { container, rerender } = render(<CodeField label={LABEL} value="123456" length={6} onChange={vi.fn()} onComplete={vi.fn()} />);
    getField().focus();
    getField().setSelectionRange(6, 6);
    fireEvent.select(getField());
    expect(getMarkedBoxes(container)).toEqual([5]);

    rerender(<CodeField label={LABEL} value="" length={6} onChange={vi.fn()} onComplete={vi.fn()} />);

    expect(getMarkedBoxes(container)).toEqual([0]);
  });

  it('keeps the digits and marks the next box when Tab brings focus back to a partly typed field', () => {
    const { container } = render(<ControlledCodeField onComplete={vi.fn()} initialValue="12" />);
    getField().focus();
    getField().setSelectionRange(0, 2);
    fireEvent.select(getField());

    fireEvent.keyUp(getField(), { key: 'Tab' });

    expect([getField().selectionStart, getField().selectionEnd]).toEqual([2, 2]);
    expect(getMarkedBoxes(container)).toEqual([2]);
  });

  it('leaves a select-all alone, because the student asked for it', () => {
    render(<ControlledCodeField onComplete={vi.fn()} initialValue="12" />);
    getField().focus();
    getField().setSelectionRange(0, 2);

    fireEvent.keyUp(getField(), { key: 'a', metaKey: true });

    expect([getField().selectionStart, getField().selectionEnd]).toEqual([0, 2]);
  });

  it('completes again when a full code is corrected', () => {
    const onComplete = vi.fn();
    render(<ControlledCodeField onComplete={onComplete} initialValue="123456" />);

    fireEvent.change(getField(), { target: { value: '923456' } });

    expect(onComplete).toHaveBeenCalledWith('923456');
  });
});
