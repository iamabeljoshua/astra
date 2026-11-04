import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountGate } from '../auth/AccountGate';
import { useAuth } from '../auth/AuthProvider';
import { useSignInDraft } from '../auth/useSignInDraft';
import {
  API_ERROR_LABELS,
  BIRTH_DATE_LABELS,
  ONBOARDING_LABELS,
  STUDENT_GOAL_LABELS,
  STUDENT_INTEREST_LABELS,
  STUDENT_LEVEL_LABELS,
  TUTOR_NOTES_LABELS,
} from '../strings';
import { renderWithQueryClient } from '../test/renderWithQueryClient';

const HOME_TEXT = 'The app';
const NEEDS_BIRTH_DATE = { status: 'needs_birth_date', student: null };
const STUDENT = { id: 'student', name: 'Maya', profile: null };
const PROFILE = { interests: ['space'], level: 'university', goal: 'exam' };

vi.mock('../auth/AuthProvider', () => ({ useAuth: vi.fn() }));
vi.mock('../auth/session', () => ({
  isCodeStillGood: () => false,
  readCodeRequest: () => null,
  forgetSession: vi.fn(),
  getAccessToken: async () => 'test-token',
  renewSession: vi.fn(),
  signOut: vi.fn(),
}));

function AppBehindTheGate() {
  return <main>{`${HOME_TEXT} at ${useLocation().pathname}`}</main>;
}

function Gate({ startPath = '/' }: { startPath?: string }) {
  return (
    <MemoryRouter initialEntries={[startPath]}>
      <AccountGate signInDraft={useSignInDraft()}>
        <AppBehindTheGate />
      </AccountGate>
    </MemoryRouter>
  );
}

type Answer = (body: unknown) => object | Promise<object>;

function stubApi(answers: Record<string, Answer>) {
  const sent: { route: string; body: unknown }[] = [];
  vi.stubGlobal('fetch', async (request: Request) => {
    const route = `${request.method} ${new URL(request.url).pathname}`;
    const body: unknown = request.method === 'GET' ? null : await request.json();
    sent.push({ route, body });
    const answer = answers[route];
    return answer ? new Response(JSON.stringify(await answer(body))) : new Response(null, { status: 404 });
  });
  return sent;
}

function clickContinue() {
  fireEvent.click(screen.getByRole('button', { name: ONBOARDING_LABELS.next }));
}

function clickChoice(name: string) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }));
}

function readSheetHeading() {
  return screen.getByRole('heading', { level: 2 }).textContent;
}

function readSheetRow(label: string) {
  return within(screen.getByText(label).parentElement as HTMLElement).getByRole('definition').textContent;
}

async function passBirthDate() {
  await screen.findByRole('heading', { name: BIRTH_DATE_LABELS.question });
  fireEvent.change(screen.getByLabelText(BIRTH_DATE_LABELS.day), { target: { value: '14' } });
  fireEvent.change(screen.getByLabelText(BIRTH_DATE_LABELS.month), { target: { value: '3' } });
  fireEvent.change(screen.getByLabelText(BIRTH_DATE_LABELS.year), { target: { value: '2004' } });
  clickContinue();
  fireEvent.click(await screen.findByRole('button', { name: BIRTH_DATE_LABELS.confirm }));
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.mocked(useAuth).mockReturnValue({ signIn: { status: 'signedIn' }, returnProblem: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubStudentWithNoProfile() {
  return stubApi({
    'GET /api/me': () => ({ status: 'active', student: STUDENT }),
    'PUT /api/me/profile': (body) => ({ status: 'active', student: { ...STUDENT, profile: body } }),
  });
}

function stubSlowSave() {
  let finishSave = () => {};
  const isSaveFinished = new Promise<void>((resolve) => {
    finishSave = resolve;
  });
  const sent = stubApi({
    'GET /api/me': () => ({ status: 'active', student: STUDENT }),
    'PUT /api/me/profile': async (body) => {
      await isSaveFinished;
      return { status: 'active', student: { ...STUDENT, profile: body } };
    },
  });
  return { sent, finishSave };
}

function readSavedGoals(sent: ReturnType<typeof stubApi>) {
  return sent.filter(({ route }) => route === 'PUT /api/me/profile').map(({ body }) => (body as { goal: string }).goal);
}

async function reachGoalStep() {
  await screen.findByRole('heading', { name: ONBOARDING_LABELS.levelQuestion });
  clickChoice(STUDENT_LEVEL_LABELS.university);
  await screen.findByRole('heading', { name: ONBOARDING_LABELS.intoQuestion });
  clickContinue();
  await screen.findByRole('heading', { name: ONBOARDING_LABELS.goalQuestion });
}

describe('onboarding', () => {
  it('asks one thing per screen, fills the sheet, and goes to Home after the goal', async () => {
    const sent = stubApi({
      'GET /api/me': () => NEEDS_BIRTH_DATE,
      'POST /api/me/birth-date': () => ({ status: 'active', student: STUDENT }),
      'PUT /api/me/profile': (body) => ({ status: 'active', student: { ...STUDENT, profile: body } }),
    });
    renderWithQueryClient(<Gate />);

    await screen.findByRole('heading', { name: ONBOARDING_LABELS.nameQuestion });
    expect(screen.queryByLabelText(BIRTH_DATE_LABELS.year)).toBeNull();
    fireEvent.change(screen.getByLabelText(ONBOARDING_LABELS.namePlaceholder), { target: { value: 'Maya' } });
    expect(readSheetHeading()).toBe(`${TUTOR_NOTES_LABELS.madeFor} Maya`);
    clickContinue();

    await passBirthDate();
    await screen.findByRole('heading', { name: ONBOARDING_LABELS.levelQuestion });
    expect(sent.find(({ route }) => route === 'POST /api/me/birth-date')?.body).toEqual({ birthDate: '2004-03-14', name: 'Maya' });
    clickChoice(STUDENT_LEVEL_LABELS.university);
    expect(readSheetRow(TUTOR_NOTES_LABELS.level)).toBe(STUDENT_LEVEL_LABELS.university);

    await screen.findByRole('heading', { name: ONBOARDING_LABELS.intoQuestion });
    fireEvent.click(screen.getByRole('button', { name: STUDENT_INTEREST_LABELS.space }));
    fireEvent.click(screen.getByRole('button', { name: STUDENT_INTEREST_LABELS.music }));
    expect(readSheetRow(TUTOR_NOTES_LABELS.into)).toBe('Space, Music');
    clickContinue();

    await screen.findByRole('heading', { name: ONBOARDING_LABELS.goalQuestion });
    clickChoice(STUDENT_GOAL_LABELS.exam);
    expect(readSheetRow(TUTOR_NOTES_LABELS.goal)).toBe(STUDENT_GOAL_LABELS.exam);

    await screen.findByText(`${HOME_TEXT} at /`);
    expect(sent.filter(({ route }) => route === 'PUT /api/me/profile').map(({ body }) => body)).toEqual([
      { name: 'Maya', interests: ['space', 'music'], level: 'university', goal: 'exam' },
    ]);
  });

  it('offers the three goals', async () => {
    stubStudentWithNoProfile();
    renderWithQueryClient(<Gate />);

    await reachGoalStep();

    for (const goal of ['Improve my grades', 'Get ready for an exam', "Learn anything I'm curious about"]) {
      screen.getByRole('button', { name: goal });
    }
  });

  it('lets a student choose many interests and change their mind, with no box to type in', async () => {
    stubStudentWithNoProfile();
    renderWithQueryClient(<Gate />);
    await screen.findByRole('heading', { name: ONBOARDING_LABELS.levelQuestion });
    clickChoice(STUDENT_LEVEL_LABELS.university);
    await screen.findByRole('heading', { name: ONBOARDING_LABELS.intoQuestion });

    expect(screen.queryByRole('textbox')).toBeNull();
    const space = screen.getByRole('button', { name: STUDENT_INTEREST_LABELS.space });
    const music = screen.getByRole('button', { name: STUDENT_INTEREST_LABELS.music });
    fireEvent.click(space);
    fireEvent.click(music);
    expect(space.getAttribute('aria-pressed')).toBe('true');
    expect(music.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(space);

    expect(space.getAttribute('aria-pressed')).toBe('false');
    expect(readSheetRow(TUTOR_NOTES_LABELS.into)).toBe(STUDENT_INTEREST_LABELS.music);
  });

  it('saves an empty interest list when the student chooses none', async () => {
    const sent = stubStudentWithNoProfile();
    renderWithQueryClient(<Gate />);

    await reachGoalStep();
    clickChoice(STUDENT_GOAL_LABELS.curiosity);

    await screen.findByText(`${HOME_TEXT} at /`);
    expect(sent.at(-1)?.body).toEqual({ name: 'Maya', interests: [], level: 'university', goal: 'curiosity' });
  });

  it('ends at Home wherever the student signed in', async () => {
    stubStudentWithNoProfile();
    renderWithQueryClient(<Gate startPath="/sessions" />);

    await reachGoalStep();
    clickChoice(STUDENT_GOAL_LABELS.class);

    await screen.findByText(`${HOME_TEXT} at /`);
  });

  it('says so when the last save fails, and saves on the next try', async () => {
    let isDown = true;
    const sent = stubApi({
      'GET /api/me': () => ({ status: 'active', student: STUDENT }),
      'PUT /api/me/profile': (body) => {
        if (isDown) throw new TypeError('network');
        return { status: 'active', student: { ...STUDENT, profile: body } };
      },
    });
    renderWithQueryClient(<Gate />);

    await reachGoalStep();
    clickChoice(STUDENT_GOAL_LABELS.exam);

    expect((await screen.findByRole('alert')).textContent).toBe(API_ERROR_LABELS.network);
    expect(screen.queryByText(`${HOME_TEXT} at /`)).toBeNull();

    isDown = false;
    clickChoice(STUDENT_GOAL_LABELS.exam);

    await screen.findByText(`${HOME_TEXT} at /`);
    expect(sent.filter(({ route }) => route === 'PUT /api/me/profile')).toHaveLength(2);
  });

  it('holds the goal it is saving, so the sheet never shows a goal that was not saved', async () => {
    const { sent, finishSave } = stubSlowSave();
    renderWithQueryClient(<Gate />);
    await reachGoalStep();

    clickChoice(STUDENT_GOAL_LABELS.class);
    await waitFor(() => expect(readSavedGoals(sent)).toEqual(['class']));
    clickChoice(STUDENT_GOAL_LABELS.exam);

    expect(readSheetRow(TUTOR_NOTES_LABELS.goal)).toBe(STUDENT_GOAL_LABELS.class);
    expect(screen.getByRole('button', { name: STUDENT_GOAL_LABELS.exam }).getAttribute('aria-pressed')).toBe('false');

    finishSave();
    await screen.findByText(`${HOME_TEXT} at /`);
    expect(readSavedGoals(sent)).toEqual(['class']);
  });

  it('takes Back away while the goal saves, so no answer can change behind the save', async () => {
    const { sent, finishSave } = stubSlowSave();
    renderWithQueryClient(<Gate />);
    await reachGoalStep();

    clickChoice(STUDENT_GOAL_LABELS.class);
    await waitFor(() => expect(readSavedGoals(sent)).toEqual(['class']));

    await waitFor(() => expect(screen.queryByRole('button', { name: ONBOARDING_LABELS.back })).toBeNull());

    finishSave();
    await screen.findByText(`${HOME_TEXT} at /`);
  });

  it('saves the last goal when the student changes their mind before the save starts', async () => {
    const sent = stubStudentWithNoProfile();
    renderWithQueryClient(<Gate />);
    await reachGoalStep();

    clickChoice(STUDENT_GOAL_LABELS.class);
    clickChoice(STUDENT_GOAL_LABELS.exam);

    await screen.findByText(`${HOME_TEXT} at /`);
    expect(readSavedGoals(sent)).toEqual(['exam']);
  });

  it('does not bring a failed save\'s alert back after Back and Continue, when nothing was tried again', async () => {
    stubApi({
      'GET /api/me': () => ({ status: 'active', student: STUDENT }),
      'PUT /api/me/profile': () => {
        throw new TypeError('network');
      },
    });
    renderWithQueryClient(<Gate />);
    await reachGoalStep();
    clickChoice(STUDENT_GOAL_LABELS.exam);
    await screen.findByRole('alert');

    fireEvent.click(screen.getByRole('button', { name: ONBOARDING_LABELS.back }));
    await screen.findByRole('heading', { name: ONBOARDING_LABELS.intoQuestion });
    clickContinue();
    await screen.findByRole('heading', { name: ONBOARDING_LABELS.goalQuestion });

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps the name of a student who goes back from the level', async () => {
    stubStudentWithNoProfile();
    renderWithQueryClient(<Gate />);
    await screen.findByRole('heading', { name: ONBOARDING_LABELS.levelQuestion });

    fireEvent.click(screen.getByRole('button', { name: ONBOARDING_LABELS.back }));

    const input = await screen.findByLabelText<HTMLInputElement>(ONBOARDING_LABELS.namePlaceholder);
    expect(input.value).toBe('Maya');
  });

  it('asks a student with a date of birth and no profile only what is left', async () => {
    stubStudentWithNoProfile();
    renderWithQueryClient(<Gate />);

    await screen.findByRole('heading', { name: ONBOARDING_LABELS.levelQuestion });

    expect(screen.queryByText(HOME_TEXT, { exact: false })).toBeNull();
    expect(screen.queryByLabelText(BIRTH_DATE_LABELS.year)).toBeNull();
  });

  it('never sends a student with a profile back through it', async () => {
    stubApi({ 'GET /api/me': () => ({ status: 'active', student: { ...STUDENT, profile: PROFILE } }) });

    renderWithQueryClient(<Gate />);

    await screen.findByText(`${HOME_TEXT} at /`);
    expect(screen.queryByRole('heading', { name: ONBOARDING_LABELS.levelQuestion })).toBeNull();
  });

  it('will not leave the name question blank', async () => {
    stubApi({ 'GET /api/me': () => NEEDS_BIRTH_DATE });
    renderWithQueryClient(<Gate />);
    await screen.findByRole('heading', { name: ONBOARDING_LABELS.nameQuestion });

    clickContinue();

    screen.getByText(ONBOARDING_LABELS.nameMissing);
    expect(screen.queryByRole('heading', { name: BIRTH_DATE_LABELS.question })).toBeNull();
  });

  it.each([
    ['a zero-width space', '\u200b'],
    ['a soft hyphen and a space', '\u00ad '],
  ])('treats a name of only %s as no name, and asks for it here, not at the date', async (_caseName, name) => {
    const sent = stubApi({ 'GET /api/me': () => NEEDS_BIRTH_DATE });
    renderWithQueryClient(<Gate />);
    fireEvent.change(await screen.findByLabelText(ONBOARDING_LABELS.namePlaceholder), { target: { value: name } });

    clickContinue();

    screen.getByText(ONBOARDING_LABELS.nameMissing);
    expect(screen.queryByRole('heading', { name: BIRTH_DATE_LABELS.question })).toBeNull();
    expect(sent.filter(({ route }) => route !== 'GET /api/me')).toEqual([]);
  });

  it('keeps the name for a closed account out of every request but the answer', async () => {
    const sent = stubApi({
      'GET /api/me': () => NEEDS_BIRTH_DATE,
      'POST /api/me/birth-date': () => ({ status: 'closed', student: null }),
    });
    renderWithQueryClient(<Gate />);
    fireEvent.change(await screen.findByLabelText(ONBOARDING_LABELS.namePlaceholder), { target: { value: 'Maya' } });
    clickContinue();

    await passBirthDate();

    await waitFor(() => expect(screen.queryByLabelText(BIRTH_DATE_LABELS.year)).toBeNull());
    expect(sent.filter(({ body }) => JSON.stringify(body).includes('Maya')).map(({ route }) => route)).toEqual(['POST /api/me/birth-date']);
  });
});
