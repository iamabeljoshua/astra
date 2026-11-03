import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountGate } from '../auth/AccountGate';
import { useAuth } from '../auth/AuthProvider';
import { useSignInDraft } from '../auth/useSignInDraft';
import {
  BIRTH_DATE_LABELS,
  FIRST_ANSWER_BOX_LABELS,
  ONBOARDING_LABELS,
  STUDENT_GOAL_LABELS,
  STUDENT_LEVEL_LABELS,
  TUTOR_NOTES_LABELS,
  TUTOR_VOICE_LABELS,
} from '../strings';
import { renderWithQueryClient } from '../test/renderWithQueryClient';

const HOME_TEXT = 'The app';
const NEEDS_BIRTH_DATE = { status: 'needs_birth_date', student: null };
const STUDENT = { id: 'student', name: 'Maya', profile: null, parentConsent: null };
const PARENT_EMAIL = 'parent@astra.test';

vi.mock('../auth/AuthProvider', () => ({ useAuth: vi.fn() }));
vi.mock('../auth/session', () => ({
  forgetSession: vi.fn(),
  getAccessToken: async () => 'test-token',
  renewSession: vi.fn(),
  signOut: vi.fn(),
}));

function Gate() {
  return (
    <MemoryRouter>
      <AccountGate signInDraft={useSignInDraft()}>
        <main>{HOME_TEXT}</main>
      </AccountGate>
    </MemoryRouter>
  );
}

type Answer = (body: unknown) => object;

function stubApi(answers: Record<string, Answer>) {
  const sent: { route: string; body: unknown }[] = [];
  vi.stubGlobal('fetch', async (request: Request) => {
    const route = `${request.method} ${new URL(request.url).pathname}`;
    const body: unknown = request.method === 'GET' ? null : await request.json();
    sent.push({ route, body });
    const answer = answers[route];
    return answer ? new Response(JSON.stringify(answer(body))) : new Response(null, { status: 404 });
  });
  return sent;
}

function stubSpeech(voices = [{ name: 'Samantha', lang: 'en-US', localService: true, default: true }]) {
  const engine = { cancel: vi.fn(), speak: vi.fn(), getVoices: () => voices };
  vi.stubGlobal('speechSynthesis', engine);
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      constructor(readonly text: string) {}
    },
  );
  return engine;
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

describe('onboarding as an adult', () => {
  it('asks one thing per screen, fills the sheet, and saves every answer', async () => {
    stubSpeech();
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
    await screen.findByRole('heading', { name: ONBOARDING_LABELS.intoQuestion });
    expect(sent.find(({ route }) => route === 'POST /api/me/birth-date')?.body).toEqual({ birthDate: '2004-03-14', name: 'Maya' });
    fireEvent.click(screen.getByRole('button', { name: 'Space' }));
    fireEvent.change(screen.getByLabelText(ONBOARDING_LABELS.intoPlaceholder), { target: { value: 'Arsenal' } });
    expect(readSheetRow(TUTOR_NOTES_LABELS.into)).toBe('Space, Arsenal');
    clickContinue();

    await screen.findByRole('heading', { name: ONBOARDING_LABELS.levelQuestion });
    clickChoice(STUDENT_LEVEL_LABELS.university);
    expect(readSheetRow(TUTOR_NOTES_LABELS.level)).toBe(STUDENT_LEVEL_LABELS.university);

    await screen.findByRole('heading', { name: ONBOARDING_LABELS.goalQuestion });
    clickChoice(STUDENT_GOAL_LABELS.exam);
    expect(readSheetRow(TUTOR_NOTES_LABELS.goal)).toBe(STUDENT_GOAL_LABELS.exam);

    await screen.findByRole('heading', { name: ONBOARDING_LABELS.voiceQuestion });
    clickChoice(TUTOR_VOICE_LABELS.noor.name);
    expect(readSheetRow(TUTOR_NOTES_LABELS.voice)).toBe(TUTOR_VOICE_LABELS.noor.name);
    clickContinue();

    await screen.findByRole('heading', { name: /I'm your tutor, and I'm an AI. You said you're into Arsenal/ });
    fireEvent.change(screen.getByLabelText(FIRST_ANSWER_BOX_LABELS.label), { target: { value: 'Why do free kicks curve?' } });
    fireEvent.click(screen.getByRole('button', { name: FIRST_ANSWER_BOX_LABELS.send }));

    await screen.findByText(HOME_TEXT);
    expect(sent.filter(({ route }) => route === 'PUT /api/me/profile').at(-1)?.body).toEqual({
      name: 'Maya',
      interests: ['Space', 'Arsenal'],
      level: 'university',
      goal: 'exam',
      voice: 'noor',
      firstQuestion: 'Why do free kicks curve?',
    });
  });

  it('plays the sample of each voice the student tries', async () => {
    const engine = stubSpeech();
    stubApi({ 'GET /api/me': () => ({ status: 'active', student: STUDENT }) });
    renderWithQueryClient(<Gate />);
    await screen.findByRole('heading', { name: ONBOARDING_LABELS.intoQuestion });
    clickContinue();
    clickChoice(STUDENT_LEVEL_LABELS.university);
    await screen.findByRole('heading', { name: ONBOARDING_LABELS.goalQuestion });
    clickChoice(STUDENT_GOAL_LABELS.exam);
    await screen.findByRole('heading', { name: ONBOARDING_LABELS.voiceQuestion });

    clickChoice(TUTOR_VOICE_LABELS.ada.name);
    clickChoice(TUTOR_VOICE_LABELS.kofi.name);
    clickChoice(TUTOR_VOICE_LABELS.noor.name);

    expect(engine.speak).toHaveBeenCalledTimes(3);
    expect(engine.speak.mock.lastCall?.[0]).toMatchObject({ text: ONBOARDING_LABELS.voiceSample('Maya') });
  });

  it('puts the cursor in the answer box on a laptop, ready to type', async () => {
    stubSpeech();
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('min-width') }));
    const profile = { interests: ['Space'], level: 'university', goal: 'exam', voice: 'ada', firstQuestion: null };
    stubApi({ 'GET /api/me': () => ({ status: 'active', student: { ...STUDENT, profile } }) });

    renderWithQueryClient(<Gate />);

    expect(await screen.findByLabelText(FIRST_ANSWER_BOX_LABELS.label)).toBe(document.activeElement);
  });

  it('shows a save failure on the first answer and keeps what was typed', async () => {
    stubSpeech();
    const profile = { interests: ['Space'], level: 'university', goal: 'exam', voice: 'ada', firstQuestion: null };
    stubApi({ 'GET /api/me': () => ({ status: 'active', student: { ...STUDENT, profile } }) });
    renderWithQueryClient(<Gate />);

    const answerBox = await screen.findByLabelText<HTMLTextAreaElement>(FIRST_ANSWER_BOX_LABELS.label);
    fireEvent.change(answerBox, { target: { value: 'Why do free kicks curve?' } });
    fireEvent.click(screen.getByRole('button', { name: FIRST_ANSWER_BOX_LABELS.send }));

    await screen.findByRole('alert');
    expect(answerBox.value).toBe('Why do free kicks curve?');
    expect(screen.queryByText(HOME_TEXT)).toBeNull();
  });

  it('will not leave the name question blank', async () => {
    stubApi({ 'GET /api/me': () => NEEDS_BIRTH_DATE });
    renderWithQueryClient(<Gate />);
    await screen.findByRole('heading', { name: ONBOARDING_LABELS.nameQuestion });

    clickContinue();

    screen.getByText(ONBOARDING_LABELS.nameMissing);
    expect(screen.queryByRole('heading', { name: BIRTH_DATE_LABELS.question })).toBeNull();
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

describe('onboarding under 18', () => {
  const NOT_ASKED = { ...STUDENT, parentConsent: { status: 'not_asked', parentEmail: null } };
  const WAITING = { ...STUDENT, parentConsent: { status: 'waiting', parentEmail: PARENT_EMAIL } };
  const APPROVED = { ...STUDENT, parentConsent: { status: 'given', parentEmail: PARENT_EMAIL } };

  it('asks for the parent, waits, and moves on once they accept', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let account: object = { status: 'active', student: NOT_ASKED };
    stubApi({
      'GET /api/me': () => account,
      'PUT /api/me/parent-consent': () => {
        account = { status: 'active', student: WAITING };
        return account;
      },
    });
    renderWithQueryClient(<Gate />);

    await screen.findByRole('heading', { name: ONBOARDING_LABELS.parentQuestion });
    fireEvent.change(screen.getByLabelText(ONBOARDING_LABELS.parentPlaceholder), { target: { value: PARENT_EMAIL } });
    clickContinue();

    await screen.findByRole('heading', { name: ONBOARDING_LABELS.waitingQuestion });
    screen.getByText(PARENT_EMAIL);
    expect(screen.queryByRole('button', { name: ONBOARDING_LABELS.next })).toBeNull();

    account = { status: 'active', student: APPROVED };
    await act(() => vi.advanceTimersByTimeAsync(6_000));

    await screen.findByRole('heading', { name: ONBOARDING_LABELS.intoQuestion });
    vi.useRealTimers();
  });

  it('lets the student change a mistyped address while waiting', async () => {
    const sent = stubApi({
      'GET /api/me': () => ({ status: 'active', student: WAITING }),
      'PUT /api/me/parent-consent': () => ({ status: 'active', student: { ...STUDENT, parentConsent: { status: 'waiting', parentEmail: 'new@astra.test' } } }),
    });
    renderWithQueryClient(<Gate />);

    fireEvent.click(await screen.findByRole('button', { name: ONBOARDING_LABELS.useAnotherAddress }));
    const input = screen.getByLabelText<HTMLInputElement>(ONBOARDING_LABELS.parentPlaceholder);
    expect(input.value).toBe(PARENT_EMAIL);
    fireEvent.change(input, { target: { value: 'new@astra.test' } });
    clickContinue();

    await screen.findByText('new@astra.test');
    expect(sent.at(-1)).toEqual({ route: 'PUT /api/me/parent-consent', body: { parentEmail: 'new@astra.test' } });
  });

  it('never opens the app for a waiting student', async () => {
    stubApi({ 'GET /api/me': () => ({ status: 'active', student: { ...WAITING, profile: { interests: [], level: 'high_school', goal: 'exam', voice: 'ada', firstQuestion: null } } }) });
    renderWithQueryClient(<Gate />);

    await screen.findByRole('heading', { name: ONBOARDING_LABELS.waitingQuestion });

    expect(screen.queryByText(HOME_TEXT)).toBeNull();
  });
});
