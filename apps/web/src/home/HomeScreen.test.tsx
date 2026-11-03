import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_ERROR_LABELS, CHAT_BOX_LABELS, DRAWING_LABELS, HOME_LABELS } from '../strings';
import { EXAMPLE_HOME_SCREEN, stubFetchWithHomeScreen } from '../test/homeScreenApi';
import { renderWithQueryClient } from '../test/renderWithQueryClient';
import { HomeScreen } from './HomeScreen';

const { continueSession: UNFINISHED_SESSION, picks: PICKS } = EXAMPLE_HOME_SCREEN;
const SESSION_TITLE = UNFINISHED_SESSION!.title;
const QUESTION = 'Why is the sky dark at night?';

const getTextBox = () => screen.getByRole<HTMLTextAreaElement>('textbox', { name: CHAT_BOX_LABELS.label });

function typeQuestion() {
  fireEvent.change(getTextBox(), { target: { value: QUESTION } });
}

async function renderLoadedHome(homeScreen = EXAMPLE_HOME_SCREEN) {
  stubFetchWithHomeScreen(homeScreen);
  const rendered = renderWithQueryClient(<HomeScreen />);
  await screen.findByRole('heading', { level: 1, name: HOME_LABELS.greeting(homeScreen.studentName) });
  return rendered;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HomeScreen', () => {
  describe('with data', () => {
    it('greets the student by name and asks what they want to learn next', async () => {
      await renderLoadedHome();

      screen.getByText(HOME_LABELS.question);
    });

    it('offers the unfinished session with a drawing from its board', async () => {
      await renderLoadedHome();

      screen.getByRole('heading', { level: 2, name: SESSION_TITLE });
      screen.getByText(UNFINISHED_SESSION!.detail!);
      screen.getByRole('button', { name: HOME_LABELS.continueButton });
      screen.getByRole('img', { name: DRAWING_LABELS.forces });
    });

    it('names the subject when the session has no line on where it left off', async () => {
      await renderLoadedHome({
        ...EXAMPLE_HOME_SCREEN,
        continueSession: { ...UNFINISHED_SESSION!, detail: null },
      });

      screen.getByText(UNFINISHED_SESSION!.subject);
    });

    it('leaves out the drawing when the session has no drawing', async () => {
      await renderLoadedHome({
        ...EXAMPLE_HOME_SCREEN,
        continueSession: { ...UNFINISHED_SESSION!, artwork: 'saturn' },
      });

      screen.getByRole('heading', { level: 2, name: SESSION_TITLE });
      expect(screen.queryByRole('img')).toBeNull();
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

      renderWithQueryClient(<HomeScreen />);

      screen.getByRole('heading', { level: 1, name: HOME_LABELS.greetingWithoutName });
      screen.getByText(HOME_LABELS.loading);
      typeQuestion();
      expect(screen.getByRole<HTMLButtonElement>('button', { name: CHAT_BOX_LABELS.send }).disabled).toBe(false);
    });
  });

  describe('when the data fails to load', () => {
    it('explains the failure and keeps the greeting and the chat box', async () => {
      vi.stubGlobal('fetch', async () => new Response('{}', { status: 500 }));

      renderWithQueryClient(<HomeScreen />);

      await screen.findByText(API_ERROR_LABELS.server);
      screen.getByRole('heading', { level: 1, name: HOME_LABELS.greetingWithoutName });
      getTextBox();
    });

    it('recovers from Try again and keeps the student\'s text', async () => {
      vi.stubGlobal('fetch', async () => new Response('{}', { status: 500 }));
      renderWithQueryClient(<HomeScreen />);
      await screen.findByText(API_ERROR_LABELS.server);
      typeQuestion();

      stubFetchWithHomeScreen();
      fireEvent.click(screen.getByRole('button', { name: HOME_LABELS.tryAgain }));

      await screen.findByRole('heading', { level: 1, name: HOME_LABELS.greeting(EXAMPLE_HOME_SCREEN.studentName) });
      expect(screen.queryByText(API_ERROR_LABELS.server)).toBeNull();
      expect(getTextBox().value).toBe(QUESTION);
    });
  });

  describe('until sessions exist', () => {
    it('says that sessions open soon when the student sends, and keeps the question', async () => {
      await renderLoadedHome();
      expect(screen.getByRole('status').textContent).toBe('');
      typeQuestion();

      fireEvent.click(screen.getByRole('button', { name: CHAT_BOX_LABELS.send }));

      expect(screen.getByRole('status').textContent).toBe(HOME_LABELS.sessionsOpenSoonQuestionKept);
      expect(getTextBox().value).toBe(QUESTION);
    });

    it('drops the notice once the student edits the question', async () => {
      await renderLoadedHome();
      typeQuestion();
      fireEvent.click(screen.getByRole('button', { name: CHAT_BOX_LABELS.send }));

      fireEvent.change(getTextBox(), { target: { value: '' } });

      expect(screen.getByRole('status').textContent).toBe('');
    });

    it('says that sessions open soon when the student chooses Continue', async () => {
      await renderLoadedHome();

      fireEvent.click(screen.getByRole('button', { name: HOME_LABELS.continueButton }));

      expect(screen.getByRole('status').textContent).toBe(HOME_LABELS.sessionsOpenSoon);
    });

    it('says that sessions open soon when the student chooses a card', async () => {
      await renderLoadedHome();

      fireEvent.click(screen.getByText(PICKS[0]!.title));

      expect(screen.getByRole('status').textContent).toBe(HOME_LABELS.sessionsOpenSoon);
    });
  });
});
