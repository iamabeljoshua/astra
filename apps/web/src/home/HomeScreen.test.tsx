import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../api/queryClient';
import { ARTWORK_LABELS, CHAT_BOX_LABELS, HOME_LABELS } from '../strings';
import { notifyResizeObservers } from '../test/fakeLayout';
import { EXAMPLE_HOME_SCREEN, EXAMPLE_STUDENT_NAME, stubFetchWithHomeScreen } from '../test/homeScreenApi';
import { renderWithQueryClient } from '../test/renderWithQueryClient';
import { HomeScreen } from './HomeScreen';

const { continueSession: UNFINISHED_SESSION, picks: PICKS } = EXAMPLE_HOME_SCREEN;
const SESSION_TITLE = UNFINISHED_SESSION!.title;
const QUESTION = 'Why is the sky dark at night?';
const STILL_LOADING_LINE_AT_MS = 4_000;
const FAILURE_LINE_AT_MS = 30_000;
const SLOW_API_MS = 5_000;
const SMALL_MARGIN_MS = 100;
const UNKNOWN_ARTWORK = 'a-name-from-a-newer-api' as 'wave';
const HOME_SCREEN = (
  <MemoryRouter>
    <HomeScreen />
  </MemoryRouter>
);

const getTextBox = () => screen.getByRole<HTMLTextAreaElement>('textbox', { name: CHAT_BOX_LABELS.label });

function typeQuestion() {
  fireEvent.change(getTextBox(), { target: { value: QUESTION } });
}

async function renderLoadedHome(homeScreen = EXAMPLE_HOME_SCREEN) {
  stubFetchWithHomeScreen(homeScreen);
  const rendered = renderWithQueryClient(HOME_SCREEN);
  await screen.findByRole('heading', { level: 1, name: HOME_LABELS.greeting(EXAMPLE_STUDENT_NAME) });
  return rendered;
}

function stubFetchWithStatus500() {
  vi.stubGlobal('fetch', async () => new Response('{}', { status: 500 }));
}

function getTryAgainButton() {
  return screen.getByRole('button', { name: HOME_LABELS.tryAgain });
}

async function renderFailedHome() {
  stubFetchWithStatus500();
  renderWithQueryClient(HOME_SCREEN);
  await screen.findByRole('alert');
}

function renderHomeWithAppRetries(fetchStub: () => Promise<Response>) {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', fetchStub);
  render(
    <QueryClientProvider client={createQueryClient()}>{HOME_SCREEN}</QueryClientProvider>,
  );
}

function renderHomeOnHungApi() {
  const fetchThatNeverAnswers = vi.fn(() => new Promise<Response>(() => undefined));
  renderHomeWithAppRetries(fetchThatNeverAnswers);
  return fetchThatNeverAnswers;
}

const waitMs = (durationMs: number) => act(() => vi.advanceTimersByTimeAsync(durationMs));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('HomeScreen', () => {
  describe('with data', () => {
    it('greets the student by name and asks what they want to learn next', async () => {
      await renderLoadedHome();

      screen.getByText(HOME_LABELS.question);
    });

    it('greets a new student who has no name yet without showing any name', async () => {
      stubFetchWithHomeScreen({ ...EXAMPLE_HOME_SCREEN, studentName: null, continueSession: null });
      renderWithQueryClient(HOME_SCREEN);

      await screen.findByText(PICKS[0]!.title);
      screen.getByRole('heading', { level: 1, name: 'Welcome.' });
    });

    it('offers the unfinished session with a drawing from its board', async () => {
      await renderLoadedHome();

      screen.getByRole('heading', { level: 2, name: SESSION_TITLE });
      screen.getByText(UNFINISHED_SESSION!.detail!);
      screen.getByRole('button', { name: HOME_LABELS.continueButton });
      screen.getByRole('img', { name: ARTWORK_LABELS.forces });
    });

    it('offers the unfinished session with a picture when its artwork is a picture', async () => {
      await renderLoadedHome({
        ...EXAMPLE_HOME_SCREEN,
        continueSession: { ...UNFINISHED_SESSION!, artwork: 'saturn' },
      });

      expect(screen.getByRole<HTMLImageElement>('img', { name: ARTWORK_LABELS.saturn }).getAttribute('src')).toBe(
        '/picks/saturn.jpg',
      );
    });

    it('names the subject when the session has no line on where it left off', async () => {
      await renderLoadedHome({
        ...EXAMPLE_HOME_SCREEN,
        continueSession: { ...UNFINISHED_SESSION!, detail: null },
      });

      screen.getByText(UNFINISHED_SESSION!.subject);
    });

    it.each([
      ['no artwork', null],
      ['an artwork name this build does not know', UNKNOWN_ARTWORK],
      ['the name of an object property', 'constructor' as 'wave'],
    ])('shows no picture on the unfinished session with %s', async (_case, artwork) => {
      await renderLoadedHome({
        ...EXAMPLE_HOME_SCREEN,
        continueSession: { ...UNFINISHED_SESSION!, artwork },
      });

      screen.getByRole('heading', { level: 2, name: SESSION_TITLE });
      expect(screen.queryByRole('img')).toBeNull();
    });

    it.each([
      ['an artwork name this build does not know', UNKNOWN_ARTWORK],
      ['the name of an object property', 'constructor' as 'wave'],
    ])('keeps a card with %s and shows no broken picture', async (_case, artwork) => {
      const { container } = await renderLoadedHome({
        ...EXAMPLE_HOME_SCREEN,
        picks: [{ ...PICKS[1]!, artwork }],
      });

      screen.getByText(PICKS[1]!.title);
      expect(container.querySelector('img')).toBeNull();
    });

    it('leaves out the continue card when no session is unfinished', async () => {
      await renderLoadedHome({ ...EXAMPLE_HOME_SCREEN, continueSession: null });

      expect(screen.queryByRole('button', { name: HOME_LABELS.continueButton })).toBeNull();
      screen.getByText(PICKS[0]!.title);
    });

    it('shows each card with its subject, length, reason, and picture', async () => {
      const { container } = await renderLoadedHome();

      const cards = screen.getAllByRole('listitem');
      expect(cards).toHaveLength(PICKS.length);
      PICKS.forEach((pick, index) => {
        const card = within(cards[index]!);
        card.getByText(HOME_LABELS.pickDetails(pick.subject, pick.lengthMinutes));
        card.getByText(pick.title);
        card.getByText(pick.reason);
      });
      expect(container.querySelector('img')?.getAttribute('src')).toBe('/picks/wave.jpg');
      expect(cards[0]!.querySelector('svg')).not.toBeNull();
    });
  });

  describe('while the data loads', () => {
    it('says so, and the chat box already works', () => {
      vi.stubGlobal('fetch', () => new Promise<Response>(() => undefined));

      renderWithQueryClient(HOME_SCREEN);

      screen.getByRole('heading', { level: 1, name: HOME_LABELS.greetingWithoutName });
      screen.getByText(HOME_LABELS.loading);
      typeQuestion();
      expect(screen.getByRole<HTMLButtonElement>('button', { name: CHAT_BOX_LABELS.send }).disabled).toBe(false);
    });
  });

  describe('when the data fails to load', () => {
    it('announces the failure and keeps the greeting and the chat box', async () => {
      await renderFailedHome();

      expect(screen.getByRole('alert').textContent).toBe(HOME_LABELS.loadFailure.server);
      screen.getByRole('heading', { level: 1, name: HOME_LABELS.greetingWithoutName });
      getTextBox();
    });

    it('recovers from Try again and keeps the student\'s text', async () => {
      await renderFailedHome();
      typeQuestion();

      stubFetchWithHomeScreen();
      fireEvent.click(getTryAgainButton());

      await screen.findByRole('heading', { level: 1, name: HOME_LABELS.greeting(EXAMPLE_STUDENT_NAME) });
      expect(screen.queryByRole('alert')).toBeNull();
      expect(getTextBox().value).toBe(QUESTION);
    });

    it('keeps focus on the greeting when Try again succeeds', async () => {
      await renderFailedHome();
      getTryAgainButton().focus();

      stubFetchWithHomeScreen();
      fireEvent.click(getTryAgainButton());

      const greeting = await screen.findByRole('heading', { level: 1, name: HOME_LABELS.greeting(EXAMPLE_STUDENT_NAME) });
      expect(document.activeElement).toBe(greeting);
    });

    it('keeps focus on the greeting and announces again when Try again fails', async () => {
      await renderFailedHome();
      const firstAnnouncement = screen.getByRole('alert');
      getTryAgainButton().focus();
      let answer!: (response: Response) => void;
      vi.stubGlobal('fetch', () => new Promise<Response>((resolve) => (answer = resolve)));

      fireEvent.click(getTryAgainButton());
      await screen.findByText(HOME_LABELS.loading);
      answer(new Response('{}', { status: 500 }));

      expect(await screen.findByRole('alert')).not.toBe(firstAnnouncement);
      expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }));
    });

    it('shows the failure line at 30 seconds when the API never answers, after one try', async () => {
      const fetchThatNeverAnswers = renderHomeOnHungApi();

      await waitMs(FAILURE_LINE_AT_MS - SMALL_MARGIN_MS);
      expect(screen.queryByRole('alert')).toBeNull();

      await waitMs(2 * SMALL_MARGIN_MS);
      expect(screen.getByRole('alert').textContent).toBe(HOME_LABELS.loadFailure.timeout);
      expect(fetchThatNeverAnswers).toHaveBeenCalledTimes(1);
    });

    it('adds one calm line after a few seconds, and still stops at 30 seconds', async () => {
      renderHomeOnHungApi();

      await waitMs(STILL_LOADING_LINE_AT_MS - SMALL_MARGIN_MS);
      screen.getByText(HOME_LABELS.loading);
      expect(screen.queryByText(HOME_LABELS.stillLoading)).toBeNull();

      await waitMs(2 * SMALL_MARGIN_MS);
      expect(screen.getByText(HOME_LABELS.stillLoading).getAttribute('role')).toBe('status');
      expect(screen.queryByText(HOME_LABELS.loading)).toBeNull();

      await waitMs(FAILURE_LINE_AT_MS - STILL_LOADING_LINE_AT_MS - 2 * SMALL_MARGIN_MS);
      screen.getByText(HOME_LABELS.stillLoading);
      expect(screen.queryByRole('alert')).toBeNull();

      await waitMs(2 * SMALL_MARGIN_MS);
      expect(screen.getByRole('alert').textContent).toBe(HOME_LABELS.loadFailure.timeout);
      expect(screen.queryByText(HOME_LABELS.stillLoading)).toBeNull();
    });

    it('recovers from Try again after the API never answered', async () => {
      renderHomeOnHungApi();
      await waitMs(FAILURE_LINE_AT_MS + SMALL_MARGIN_MS);

      stubFetchWithHomeScreen();
      fireEvent.click(getTryAgainButton());
      await waitMs(0);

      screen.getByText(PICKS[0]!.title);
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  describe('when the API is slow', () => {
    it('loads the cards on the first try from an API that takes 5 seconds', async () => {
      const fetchThatTakesFiveSeconds = vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            setTimeout(() => resolve(new Response(JSON.stringify(EXAMPLE_HOME_SCREEN))), SLOW_API_MS);
          }),
      );
      renderHomeWithAppRetries(fetchThatTakesFiveSeconds);

      await waitMs(SLOW_API_MS + SMALL_MARGIN_MS);

      screen.getByText(PICKS[0]!.title);
      expect(screen.queryByRole('alert')).toBeNull();
      expect(fetchThatTakesFiveSeconds).toHaveBeenCalledTimes(1);
    });
  });

  describe('when the data has the wrong shape', () => {
    const WRONG_SHAPE = { studentName: EXAMPLE_HOME_SCREEN.studentName } as typeof EXAMPLE_HOME_SCREEN;

    async function renderHomeThatCrashesOnRefetch() {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      stubFetchWithHomeScreen();
      const { queryClient } = renderWithQueryClient(HOME_SCREEN);
      await screen.findByText(PICKS[0]!.title);
      typeQuestion();

      stubFetchWithHomeScreen(WRONG_SHAPE);
      await queryClient.refetchQueries();
      await screen.findByRole('alert');
    }

    it('keeps the chat box and the student\'s text, and announces a heading in place of the cards', async () => {
      await renderHomeThatCrashesOnRefetch();

      within(screen.getByRole('alert')).getByRole('heading', { level: 2, name: HOME_LABELS.cardsCrashHeading });
      expect(screen.queryByText(PICKS[0]!.title)).toBeNull();
      expect(getTextBox().value).toBe(QUESTION);
    });

    it('brings the cards back from Try again once the data is right', async () => {
      await renderHomeThatCrashesOnRefetch();

      stubFetchWithHomeScreen();
      fireEvent.click(getTryAgainButton());

      await screen.findByText(PICKS[0]!.title);
      expect(screen.queryByRole('alert')).toBeNull();
      expect(getTextBox().value).toBe(QUESTION);
    });
  });

  describe('keyboard focus and the dock', () => {
    const GROWN_DOCK_HEIGHT_PX = 134.5;
    const getDockHeight = () => document.documentElement.style.getPropertyValue('--dock-height');

    it('publishes the dock height as the dock grows, and removes it on leaving', async () => {
      const { unmount } = await renderLoadedHome();
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ height: GROWN_DOCK_HEIGHT_PX } as DOMRect);

      notifyResizeObservers();
      expect(getDockHeight()).toBe(`${Math.ceil(GROWN_DOCK_HEIGHT_PX)}px`);

      unmount();
      expect(getDockHeight()).toBe('');
    });
  });
});
