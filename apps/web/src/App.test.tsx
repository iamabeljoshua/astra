import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { APP_ERROR_LABELS, HOME_LABELS, PRODUCT_NAME } from './strings';
import { EXAMPLE_STUDENT_NAME, stubFetchWithHomeScreen } from './test/homeScreenApi';

vi.mock('./auth/session', () => import('./test/signedInSession'));
vi.mock('./auth/useAccount', () => import('./test/activeAccount'));

const CRASHING_PAGE_PATH = '/crashing-page';

vi.mock('./shell/menu', async (importOriginal) => {
  const { MENU } = await importOriginal<typeof import('./shell/menu')>();
  const CrashingPage = () => {
    throw new Error('a bug in a page');
  };
  return { MENU: [...MENU, { path: '/crashing-page', label: 'Crashing page', Page: CrashingPage }] };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('App', () => {
  it('shows the product name in the page and the browser tab', async () => {
    stubFetchWithHomeScreen();

    render(<App />);

    await screen.findByRole('heading', { name: HOME_LABELS.greeting(EXAMPLE_STUDENT_NAME) });
    expect(screen.getAllByText(PRODUCT_NAME).length).toBeGreaterThan(0);
    expect(document.title).toBe(PRODUCT_NAME);
  });

  it('shows the crash page with a reload control when a page crashes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    window.history.replaceState(null, '', CRASHING_PAGE_PATH);

    render(<App />);

    screen.getByRole('heading', { level: 1, name: APP_ERROR_LABELS.heading });
    screen.getByRole('button', { name: APP_ERROR_LABELS.reload });
    expect(document.title).toBe(PRODUCT_NAME);
  });
});
