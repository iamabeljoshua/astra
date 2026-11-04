import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import {
  ACCOUNT_LABELS,
  HOME_LABELS,
  MENU_LABELS,
  PRODUCT_NAME,
  SIDEBAR_LABELS,
  THEME_LABELS,
} from '../strings';
import { EXAMPLE_STUDENT_NAME, stubFetchWithHomeScreen } from '../test/homeScreenApi';

vi.mock('../auth/session', () => import('../test/signedInSession'));
vi.mock('../auth/useAccount', () => import('../test/activeAccount'));

const { NEW_ROW_LABEL, NEW_PAGE_TEXT } = vi.hoisted(() => ({
  NEW_ROW_LABEL: 'New row',
  NEW_PAGE_TEXT: 'New page',
}));
const HOME_GREETING = HOME_LABELS.greeting(EXAMPLE_STUDENT_NAME);

vi.mock('./menu', async (importOriginal) => {
  const { MENU } = await importOriginal<typeof import('./menu')>();
  return {
    MENU: [...MENU, { path: '/new-row', label: NEW_ROW_LABEL, Page: () => <p>{NEW_PAGE_TEXT}</p> }],
  };
});

beforeEach(() => {
  stubFetchWithHomeScreen();
});

const getNavigation = () => screen.getByRole('navigation', { name: SIDEBAR_LABELS.menu });

function getMenuRow(name: string) {
  return within(getNavigation()).getByRole('link', { name });
}

describe('Sidebar', () => {
  it('renders a row and a page from one new MENU entry', async () => {
    render(<App />);

    fireEvent.click(getMenuRow(NEW_ROW_LABEL));

    await screen.findByText(NEW_PAGE_TEXT);
    expect(getMenuRow(NEW_ROW_LABEL).getAttribute('aria-current')).toBe('page');
  });

  it('marks only the current page', async () => {
    render(<App />);

    fireEvent.click(getMenuRow(MENU_LABELS.sessions));

    await screen.findByRole('heading', { name: MENU_LABELS.sessions });
    expect(getMenuRow(MENU_LABELS.sessions).getAttribute('aria-current')).toBe('page');
    expect(getMenuRow(MENU_LABELS.home).getAttribute('aria-current')).toBeNull();
  });

  it('shows the product name, an empty Recent section, the account, and the theme toggle', async () => {
    render(<App />);

    const sidebar = screen.getByRole('complementary');
    within(sidebar).getByText(PRODUCT_NAME);
    within(sidebar).getByText(SIDEBAR_LABELS.recent);
    await within(sidebar).findByText(SIDEBAR_LABELS.noSessions);
    within(sidebar).getByText('Maya');
    within(sidebar).getByRole('button', { name: ACCOUNT_LABELS.signOut });
    within(sidebar).getByRole('button', { name: THEME_LABELS.dark });
    await screen.findByRole('heading', { level: 1 });
  });

  it('opens Home for an address that has no page', async () => {
    window.history.replaceState(null, '', '/nothing-here');

    render(<App />);

    await screen.findByRole('heading', { name: HOME_GREETING });
    expect(getMenuRow(MENU_LABELS.home).getAttribute('aria-current')).toBe('page');
  });
});

describe('the phone menu', () => {
  const getMenuButton = () => screen.getByRole('button', { name: SIDEBAR_LABELS.menu });
  const isOpen = () => getMenuButton().getAttribute('aria-expanded') === 'true';

  it('opens and closes from the Menu button', () => {
    render(<App />);
    expect(isOpen()).toBe(false);

    fireEvent.click(getMenuButton());
    expect(isOpen()).toBe(true);

    fireEvent.click(getMenuButton());
    expect(isOpen()).toBe(false);
  });

  it('closes and returns focus to the Menu button when a row is chosen', () => {
    render(<App />);
    fireEvent.click(getMenuButton());

    fireEvent.click(getMenuRow(MENU_LABELS.sessions));

    expect(isOpen()).toBe(false);
    expect(document.activeElement).toBe(getMenuButton());
  });

  it('closes when the row for the current page is chosen', () => {
    render(<App />);
    fireEvent.click(getMenuButton());

    fireEvent.click(getMenuRow(MENU_LABELS.home));

    expect(isOpen()).toBe(false);
  });

  it('closes and returns focus to the Menu button on Escape', () => {
    render(<App />);
    fireEvent.click(getMenuButton());
    getMenuRow(MENU_LABELS.home).focus();

    fireEvent.keyDown(getMenuRow(MENU_LABELS.home), { key: 'Escape' });

    expect(isOpen()).toBe(false);
    expect(document.activeElement).toBe(getMenuButton());
  });

  it('closes and returns focus to the Menu button on Escape with focus on the page body', () => {
    render(<App />);
    fireEvent.click(getMenuButton());
    expect(document.activeElement).toBe(document.body);

    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(isOpen()).toBe(false);
    expect(document.activeElement).toBe(getMenuButton());
  });

  it('closes and returns focus to the Menu button when the browser goes Back', async () => {
    render(<App />);
    fireEvent.click(getMenuRow(MENU_LABELS.sessions));
    await screen.findByRole('heading', { name: MENU_LABELS.sessions });
    fireEvent.click(getMenuButton());

    window.history.back();

    await screen.findByRole('heading', { name: HOME_GREETING });
    expect(isOpen()).toBe(false);
    expect(document.activeElement).toBe(getMenuButton());
  });

  it('leaves focus alone when a row is chosen with the menu closed', () => {
    render(<App />);
    const row = getMenuRow(MENU_LABELS.sessions);
    row.focus();

    fireEvent.click(row);

    expect(document.activeElement).toBe(row);
  });
});
