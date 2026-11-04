import { act, fireEvent, screen } from '@testing-library/react';
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

function confirmDate() {
  fireEvent.click(screen.getByRole('button', { name: strings.BIRTH_DATE_LABELS.confirm }));
}

function stubApiAnswer(status: number, body: object) {
  const sentBodies: unknown[] = [];
  vi.stubGlobal('fetch', async (request: Request) => {
    sentBodies.push(await request.json());
    return new Response(JSON.stringify(body), { status });
  });
  return sentBodies;
}

const STUDENT_NAME = 'Maya';
const STEP_PROPS = { studentName: STUDENT_NAME, progress: '2 of 5', onBack: () => undefined };
const NOT_ANSWERED_YET = () => new Promise<Response>(() => undefined);
const LONGER_THAN_A_SEND_TAKES_MS = 50;

function waitLongerThanASendTakes() {
  return act(() => new Promise((resolve) => setTimeout(resolve, LONGER_THAN_A_SEND_TAKES_MS)));
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the date of birth question', () => {
  it('gives no hint of an age limit in its words', () => {
    const { container } = renderWithQueryClient(<BirthDatePage {...STEP_PROPS} />);

    const placeholders = [...container.querySelectorAll('input')].map((input) => input.placeholder).join(' ');
    expect(`${container.textContent} ${placeholders}`).not.toMatch(AGE_LIMIT_WORDS);
  });

  it('shows no example date that a student could copy', () => {
    const { container } = renderWithQueryClient(<BirthDatePage {...STEP_PROPS} />);

    const placeholders = [...container.querySelectorAll('input')].map((input) => input.placeholder);
    expect(placeholders.join('')).not.toMatch(/\d/);
  });

  it('sets no limit on the dates a student can type', () => {
    renderWithQueryClient(<BirthDatePage {...STEP_PROPS} />);

    const year = screen.getByLabelText('Year');
    for (const attribute of ['min', 'max', 'pattern', 'list']) {
      expect(year.getAttribute(attribute)).toBeNull();
    }
  });

  it('keeps the age limit out of every screen, so only the Terms and the Privacy Policy state it', () => {
    const { LEGAL_PAGES, ...screenStrings } = strings;

    expect(getAllText(screenStrings).join(' ')).not.toMatch(/\b13\b|thirteen|old enough|too young|minimum age|age limit/i);
    expect(getAllText(LEGAL_PAGES).join(' ')).toMatch(/\b13\b/);
  });

  it.each(['2026', '2025', '1950'])('sends a date in %s to the server without judging the age itself', async (year) => {
    const sentBodies = stubApiAnswer(200, { status: 'active', student: null });
    renderWithQueryClient(<BirthDatePage {...STEP_PROPS} />);

    enterDate('14', '3', year);
    submitDate();
    confirmDate();

    await vi.waitFor(() => expect(sentBodies).toEqual([{ birthDate: `${year}-03-14`, name: STUDENT_NAME }]));
  });

  it.each([
    ['Arabic-Indic', '٣', '٤', '٢٠٠٤', '2004-04-03'],
    ['Devanagari', '३', '४', '२००४', '2004-04-03'],
    ['full-width', '３', '４', '２００４', '2004-04-03'],
    ['Bengali', '৩', '৪', '২০০৪', '2004-04-03'],
  ])('reads %s digits', async (_script, day, month, year, expected) => {
    const sentBodies = stubApiAnswer(200, { status: 'active', student: null });
    renderWithQueryClient(<BirthDatePage {...STEP_PROPS} />);

    enterDate(day, month, year);
    submitDate();
    confirmDate();

    await vi.waitFor(() => expect(sentBodies).toEqual([{ birthDate: expected, name: STUDENT_NAME }]));
  });

  it.each(['0000', '0001'])('refuses year %s in the field, before there is anything to confirm', async (year) => {
    const sentBodies = stubApiAnswer(200, { status: 'active', student: null });
    renderWithQueryClient(<BirthDatePage {...STEP_PROPS} />);

    enterDate('14', '3', year);
    submitDate();

    screen.getByText(strings.BIRTH_DATE_LABELS.rejected);
    expect(screen.queryByRole('button', { name: strings.BIRTH_DATE_LABELS.confirm })).toBeNull();
    expect(sentBodies).toEqual([]);
  });

  it('tells a screen reader a slow confirm is on its way', async () => {
    vi.stubGlobal('fetch', NOT_ANSWERED_YET);
    renderWithQueryClient(<BirthDatePage {...STEP_PROPS} />);
    enterDate('14', '3', '2004');
    submitDate();
    expect(screen.getByRole('status').textContent).toBe('');

    confirmDate();

    await vi.waitFor(() => expect(screen.getByRole('status').textContent).toBe(strings.BIRTH_DATE_LABELS.saving));
  });

  it('clears the message when the student changes the date', async () => {
    renderWithQueryClient(<BirthDatePage {...STEP_PROPS} />);

    enterDate('', '3', '2004');
    submitDate();
    screen.getByText(strings.BIRTH_DATE_LABELS.rejected);

    fireEvent.change(screen.getByLabelText(strings.BIRTH_DATE_LABELS.day), { target: { value: '1' } });

    expect(screen.queryByText(strings.BIRTH_DATE_LABELS.rejected)).toBeNull();
  });

  it('goes back to the date with a message when the server rejects it, and clears the message on a change', async () => {
    stubApiAnswer(400, { message: ['birthDate is wrong'], fieldMessages: { birthDate: ['birthDate is wrong'] } });
    renderWithQueryClient(<BirthDatePage {...STEP_PROPS} />);
    enterDate('1', '1', '2999');
    submitDate();
    confirmDate();

    await screen.findByText(strings.BIRTH_DATE_LABELS.rejected);
    expect(screen.getByLabelText<HTMLInputElement>(strings.BIRTH_DATE_LABELS.year).value).toBe('2999');

    fireEvent.change(screen.getByLabelText(strings.BIRTH_DATE_LABELS.year), { target: { value: '2004' } });

    await vi.waitFor(() => expect(screen.queryByText(strings.BIRTH_DATE_LABELS.rejected)).toBeNull());
  });

  describe('the confirm step', () => {
    it.each([
      ['a date that closes an account', '1', '1', '2020'],
      ['a date that opens one', '14', '3', '2004'],
      ['a date around the age limit', '3', '11', '2013'],
    ])('asks about %s in the same words, and sends nothing until the student confirms', async (_caseName, day, month, year) => {
      const sentBodies = stubApiAnswer(200, { status: 'active', student: null });
      const { container } = renderWithQueryClient(<BirthDatePage {...STEP_PROPS} />);
      enterDate(day, month, year);

      submitDate();

      const expectedDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))));
      screen.getByRole('heading', { name: strings.BIRTH_DATE_LABELS.confirmQuestion });
      screen.getByText(expectedDate);
      expect(container.textContent?.replace(expectedDate, '')).not.toMatch(AGE_LIMIT_WORDS);
      await waitLongerThanASendTakes();
      expect(sentBodies).toEqual([]);

      confirmDate();

      await vi.waitFor(() => expect(sentBodies).toHaveLength(1));
    });

    it('goes back with the typed date kept when the student changes it, having sent nothing', async () => {
      const sentBodies = stubApiAnswer(200, { status: 'active', student: null });
      renderWithQueryClient(<BirthDatePage {...STEP_PROPS} />);
      enterDate('14', '3', '2004');
      submitDate();

      fireEvent.click(screen.getByRole('button', { name: strings.BIRTH_DATE_LABELS.change }));

      expect(screen.getByLabelText<HTMLInputElement>(strings.BIRTH_DATE_LABELS.day).value).toBe('14');
      expect(screen.getByLabelText<HTMLInputElement>(strings.BIRTH_DATE_LABELS.year).value).toBe('2004');
      await waitLongerThanASendTakes();
      expect(sentBodies).toEqual([]);
    });

    it('refuses a date that does not exist before the student has to confirm it', () => {
      renderWithQueryClient(<BirthDatePage {...STEP_PROPS} />);
      enterDate('31', '2', '2004');

      submitDate();

      screen.getByText(strings.BIRTH_DATE_LABELS.rejected);
      expect(screen.queryByRole('heading', { name: strings.BIRTH_DATE_LABELS.confirmQuestion })).toBeNull();
    });

    it('moves focus to the question, and ties the date to the question and the button', () => {
      renderWithQueryClient(<BirthDatePage {...STEP_PROPS} />);
      enterDate('14', '3', '2004');

      submitDate();

      const heading = screen.getByRole('heading', { name: strings.BIRTH_DATE_LABELS.confirmQuestion });
      const button = screen.getByRole('button', { name: strings.BIRTH_DATE_LABELS.confirm });
      expect(document.activeElement).toBe(heading);
      expect(heading.getAttribute('aria-describedby')).toBe(button.getAttribute('aria-describedby'));
      expect(document.getElementById(heading.getAttribute('aria-describedby') ?? '')?.textContent).toContain('2004');
    });

    it('stays here and says what went wrong when saving fails, so the student can confirm again', async () => {
      stubApiAnswer(500, {});
      renderWithQueryClient(<BirthDatePage {...STEP_PROPS} />);
      enterDate('14', '3', '2004');
      submitDate();

      confirmDate();

      await screen.findByText(strings.API_ERROR_LABELS.server);
      screen.getByRole('button', { name: strings.BIRTH_DATE_LABELS.confirm });
    });
  });

  it('names the date fields as a group, and ties a rejected date to its message', () => {
    renderWithQueryClient(<BirthDatePage {...STEP_PROPS} />);
    screen.getByRole('group', { name: strings.BIRTH_DATE_LABELS.questionFor(STUDENT_NAME) });
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
    renderWithQueryClient(<BirthDatePage {...STEP_PROPS} />);
    enterDate('14', '3', '2004');
    submitDate();
    const button = screen.getByRole<HTMLButtonElement>('button', { name: strings.BIRTH_DATE_LABELS.confirm });
    button.focus();

    confirmDate();
    confirmDate();
    await vi.waitFor(() => expect(button.getAttribute('aria-disabled')).toBe('true'));
    confirmDate();
    await waitLongerThanASendTakes();

    expect(document.activeElement).toBe(button);
    expect(button.disabled).toBe(false);
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it('can send a corrected date after the student changes it while the first is on its way', async () => {
    const fetchStub = vi.fn(NOT_ANSWERED_YET);
    vi.stubGlobal('fetch', fetchStub);
    renderWithQueryClient(<BirthDatePage {...STEP_PROPS} />);
    enterDate('14', '3', '2004');
    submitDate();
    confirmDate();
    await vi.waitFor(() => expect(fetchStub).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: strings.BIRTH_DATE_LABELS.change }));
    enterDate('14', '3', '2005');
    submitDate();
    confirmDate();

    await vi.waitFor(() => expect(fetchStub).toHaveBeenCalledTimes(2));
  });

  it('can send again after a failed send', async () => {
    const sentBodies = stubApiAnswer(500, {});
    renderWithQueryClient(<BirthDatePage {...STEP_PROPS} />);
    enterDate('14', '3', '2004');
    submitDate();
    confirmDate();
    await screen.findByText(strings.API_ERROR_LABELS.server);

    confirmDate();

    await vi.waitFor(() => expect(sentBodies).toHaveLength(2));
  });

  it.each([
    ['a wide screen, on the first field', true, () => screen.getAllByRole('textbox')[0]!],
    ['a phone, on the heading', false, () => screen.getByRole('heading', { level: 1 })],
  ])('moves focus into the step on %s', (_caseName, isWide, getExpected) => {
    vi.stubGlobal('matchMedia', () => ({ matches: isWide }));

    renderWithQueryClient(<BirthDatePage {...STEP_PROPS} />);

    expect(document.activeElement).toBe(getExpected());
  });
});
