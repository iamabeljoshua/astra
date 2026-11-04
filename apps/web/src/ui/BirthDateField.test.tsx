import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BIRTH_DATE_LABELS } from '../strings';
import { BirthDateField, type DateParts } from './BirthDateField';

const QUESTION_ID = 'question';

function Field({ onChange }: { onChange?: (parts: DateParts) => void }) {
  const [value, setValue] = useState<DateParts>({ day: '', month: '', year: '' });
  return (
    <>
      <h1 id={QUESTION_ID}>When</h1>
      <BirthDateField
        labelledBy={QUESTION_ID}
        value={value}
        isInvalid={false}
        onChange={(parts) => {
          setValue(parts);
          onChange?.(parts);
        }}
      />
    </>
  );
}

function getPart(label: string) {
  return screen.getByLabelText<HTMLInputElement>(label);
}

function useLocale(locale: string) {
  const format = Intl.DateTimeFormat;
  vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function createFormat(_locales, options) {
    return new format(locale, options);
  } as typeof Intl.DateTimeFormat);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BirthDateField', () => {
  it('names the group by the question and offers a number keypad and autofill on each part', () => {
    render(<Field />);

    screen.getByRole('group', { name: 'When' });
    for (const [label, autoComplete] of [
      [BIRTH_DATE_LABELS.day, 'bday-day'],
      [BIRTH_DATE_LABELS.month, 'bday-month'],
      [BIRTH_DATE_LABELS.year, 'bday-year'],
    ] as const) {
      expect(getPart(label).getAttribute('inputmode')).toBe('numeric');
      expect(getPart(label).getAttribute('autocomplete')).toBe(autoComplete);
    }
  });

  it.each([
    ['en-NG', ['day', 'month', 'year']],
    ['en-US', ['month', 'day', 'year']],
    ['ja-JP', ['year', 'month', 'day']],
  ])('orders the parts the way %s writes a date', (locale, expected) => {
    useLocale(locale);
    render(<Field />);

    const labels = screen.getAllByRole('textbox').map((input) => input.getAttribute('autocomplete')?.replace('bday-', ''));
    expect(labels).toEqual(expected);
  });

  it('moves on when a part is finished, and not while it could still grow', () => {
    useLocale('en-NG');
    render(<Field />);
    getPart(BIRTH_DATE_LABELS.day).focus();

    fireEvent.change(getPart(BIRTH_DATE_LABELS.day), { target: { value: '1' } });
    expect(document.activeElement).toBe(getPart(BIRTH_DATE_LABELS.day));
    fireEvent.change(getPart(BIRTH_DATE_LABELS.day), { target: { value: '14' } });
    expect(document.activeElement).toBe(getPart(BIRTH_DATE_LABELS.month));
    fireEvent.change(getPart(BIRTH_DATE_LABELS.month), { target: { value: '3' } });

    expect(document.activeElement).toBe(getPart(BIRTH_DATE_LABELS.year));
  });

  it('moves on when the student types a separator', () => {
    useLocale('en-NG');
    render(<Field />);
    getPart(BIRTH_DATE_LABELS.day).focus();
    fireEvent.change(getPart(BIRTH_DATE_LABELS.day), { target: { value: '1' } });

    fireEvent.change(getPart(BIRTH_DATE_LABELS.day), { target: { value: '1/' } });

    expect(getPart(BIRTH_DATE_LABELS.day).value).toBe('1');
    expect(document.activeElement).toBe(getPart(BIRTH_DATE_LABELS.month));
  });

  it('goes back a part on Backspace in an empty one', () => {
    useLocale('en-NG');
    render(<Field />);
    getPart(BIRTH_DATE_LABELS.month).focus();

    fireEvent.keyDown(getPart(BIRTH_DATE_LABELS.month), { key: 'Backspace' });

    expect(document.activeElement).toBe(getPart(BIRTH_DATE_LABELS.day));
  });

  it.each([
    ['in this field\'s order', '14/03/2004'],
    ['year first', '2004-03-14'],
  ])('fills every part from a date pasted %s', (_caseName, pasted) => {
    useLocale('en-NG');
    render(<Field />);

    fireEvent.change(getPart(BIRTH_DATE_LABELS.day), { target: { value: pasted } });

    expect([getPart(BIRTH_DATE_LABELS.day).value, getPart(BIRTH_DATE_LABELS.month).value, getPart(BIRTH_DATE_LABELS.year).value]).toEqual(['14', '03', '2004']);
  });

  it('takes digits from other numbering systems and refuses letters', () => {
    render(<Field />);

    fireEvent.change(getPart(BIRTH_DATE_LABELS.year), { target: { value: '٢٠٠٤' } });
    expect(getPart(BIRTH_DATE_LABELS.year).value).toBe('2004');
    fireEvent.change(getPart(BIRTH_DATE_LABELS.day), { target: { value: 'ab' } });

    expect(getPart(BIRTH_DATE_LABELS.day).value).toBe('');
  });
});
