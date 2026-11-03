import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithQueryClient } from '../test/renderWithQueryClient';
import * as strings from '../strings';
import { BirthDatePage } from './BirthDatePage';

const AGE_LIMIT_WORDS = /\b13\b|thirteen|old enough|too young|minimum age|age limit|at least|or older/i;

vi.mock('./session', () => ({ signOut: vi.fn(), getAccessToken: async () => null }));

function getAllText(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (typeof value === 'function') return [String(value('name', 1))];
  return Object.values(value as object).flatMap(getAllText);
}

function enterDate(day: string, month: string, year: string) {
  fireEvent.change(screen.getByLabelText(strings.BIRTH_DATE_LABELS.day), { target: { value: day } });
  fireEvent.change(screen.getByLabelText(strings.BIRTH_DATE_LABELS.month), { target: { value: month } });
  fireEvent.change(screen.getByLabelText(strings.BIRTH_DATE_LABELS.year), { target: { value: year } });
}

function submitDate() {
  fireEvent.click(screen.getByRole('button', { name: strings.BIRTH_DATE_LABELS.next }));
}

function stubApiAnswer(status: number, body: object) {
  const sentBodies: unknown[] = [];
  vi.stubGlobal('fetch', async (request: Request) => {
    sentBodies.push(await request.json());
    return new Response(JSON.stringify(body), { status });
  });
  return sentBodies;
}

const NOT_ANSWERED_YET = () => new Promise<Response>(() => undefined);

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the date of birth question', () => {
  it('gives no hint of an age limit in its words', () => {
    const { container } = renderWithQueryClient(<BirthDatePage />);

    const placeholders = [...container.querySelectorAll('input')].map((input) => input.placeholder).join(' ');
    expect(`${container.textContent} ${placeholders}`).not.toMatch(AGE_LIMIT_WORDS);
  });

  it('shows no example date that a student could copy', () => {
    const { container } = renderWithQueryClient(<BirthDatePage />);

    const placeholders = [...container.querySelectorAll('input')].map((input) => input.placeholder);
    expect(placeholders.join('')).not.toMatch(/\d/);
  });

  it('sets no limit on the dates a student can type', () => {
    renderWithQueryClient(<BirthDatePage />);

    const year = screen.getByLabelText('Year');
    for (const attribute of ['min', 'max', 'pattern', 'list']) {
      expect(year.getAttribute(attribute)).toBeNull();
    }
  });

  it('has no age limit anywhere in the text that the web app ships', () => {
    expect(getAllText(strings).join(' ')).not.toMatch(/\b13\b|thirteen|old enough|too young|minimum age|age limit/i);
  });

  it.each(['2026', '2025', '1950'])('sends a date in %s to the server without judging the age itself', async (year) => {
    const sentBodies = stubApiAnswer(200, { status: 'active', student: null });
    renderWithQueryClient(<BirthDatePage />);

    enterDate('14', '3', year);
    submitDate();

    await vi.waitFor(() => expect(sentBodies).toEqual([{ birthDate: `${year}-03-14` }]));
  });

  it.each([
    ['Arabic-Indic', '٣', '٤', '٢٠٠٤', '2004-04-03'],
    ['Devanagari', '३', '४', '२००४', '2004-04-03'],
    ['full-width', '３', '４', '２００４', '2004-04-03'],
    ['Bengali', '৩', '৪', '২০০৪', '2004-04-03'],
  ])('reads %s digits', async (_script, day, month, year, expected) => {
    const sentBodies = stubApiAnswer(200, { status: 'active', student: null });
    renderWithQueryClient(<BirthDatePage />);

    enterDate(day, month, year);
    submitDate();

    await vi.waitFor(() => expect(sentBodies).toEqual([{ birthDate: expected }]));
  });

  it('clears the message when the student changes the date', async () => {
    renderWithQueryClient(<BirthDatePage />);

    enterDate('', '3', '2004');
    submitDate();
    screen.getByText(strings.BIRTH_DATE_LABELS.rejected);

    fireEvent.change(screen.getByLabelText(strings.BIRTH_DATE_LABELS.day), { target: { value: '1' } });

    expect(screen.queryByText(strings.BIRTH_DATE_LABELS.rejected)).toBeNull();
  });

  it('clears a message from the server when the student changes the date', async () => {
    stubApiAnswer(400, { message: ['birthDate is wrong'], fieldMessages: { birthDate: ['birthDate is wrong'] } });
    renderWithQueryClient(<BirthDatePage />);
    enterDate('31', '2', '2004');
    submitDate();
    await screen.findByText(strings.BIRTH_DATE_LABELS.rejected);

    fireEvent.change(screen.getByLabelText(strings.BIRTH_DATE_LABELS.day), { target: { value: '1' } });

    await vi.waitFor(() => expect(screen.queryByText(strings.BIRTH_DATE_LABELS.rejected)).toBeNull());
  });

  it('names the date fields as a group, and ties a rejected date to its message', () => {
    renderWithQueryClient(<BirthDatePage />);
    screen.getByRole('group', { name: strings.BIRTH_DATE_LABELS.question });
    const year = screen.getByLabelText(strings.BIRTH_DATE_LABELS.year);
    expect(year.getAttribute('aria-invalid')).toBe('false');

    enterDate('', '3', '2004');
    submitDate();

    const message = screen.getByRole('alert');
    expect(year.getAttribute('aria-invalid')).toBe('true');
    expect(year.getAttribute('aria-describedby')).toBe(message.id);
  });

  it('keeps focus on the button and sends once while the answer is on its way', async () => {
    const fetchStub = vi.fn(NOT_ANSWERED_YET);
    vi.stubGlobal('fetch', fetchStub);
    renderWithQueryClient(<BirthDatePage />);
    enterDate('14', '3', '2004');
    const button = screen.getByRole<HTMLButtonElement>('button', { name: strings.BIRTH_DATE_LABELS.next });
    button.focus();

    submitDate();
    submitDate();

    expect(document.activeElement).toBe(button);
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    await vi.waitFor(() => expect(fetchStub).toHaveBeenCalledTimes(1));
  });

  it.each([
    ['a wide screen, on the first field', true, () => screen.getByLabelText(strings.BIRTH_DATE_LABELS.day)],
    ['a phone, on the heading', false, () => screen.getByRole('heading', { level: 1 })],
  ])('moves focus into the step on %s', (_caseName, isWide, getExpected) => {
    vi.stubGlobal('matchMedia', () => ({ matches: isWide }));

    renderWithQueryClient(<BirthDatePage />);

    expect(document.activeElement).toBe(getExpected());
  });
});
