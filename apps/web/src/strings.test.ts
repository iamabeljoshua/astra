import { act, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { MENU_LABELS, PRODUCT_NAME, SIDEBAR_LABELS } from './strings';
import { EXAMPLE_HOME_SCREEN, stubFetchWithHomeScreen } from './test/homeScreenApi';

vi.mock('./auth/session', () => import('./test/signedInSession'));
vi.mock('./auth/useAccount', () => import('./test/activeAccount'));

const STUDENT_NAME_FROM_API = 'Maya';
const MARKED_STRING = /^«.*»$/s;
const TEXT_ATTRIBUTES = ['aria-label', 'title', 'alt', 'placeholder'];
const MARKED_SESSION_TITLE = '«Free-body diagrams»';
const MARKED_HOME_SCREEN = {
  ...EXAMPLE_HOME_SCREEN,
  studentName: '«Maya»',
  continueSession: {
    ...EXAMPLE_HOME_SCREEN.continueSession!,
    title: MARKED_SESSION_TITLE,
    detail: '«Next up»',
  },
  picks: EXAMPLE_HOME_SCREEN.picks.map((pick) => ({
    ...pick,
    title: `«${pick.title}»`,
    subject: `«${pick.subject}»`,
    reason: `«${pick.reason}»`,
  })),
};

vi.mock('./strings', async (importOriginal) => {
  const markStrings = (value: unknown): unknown => {
    if (typeof value === 'string') return `«${value}»`;
    if (typeof value === 'function') return (...text: unknown[]) => `«${value(...text)}»`;
    return Object.fromEntries(Object.entries(value as object).map(([key, inner]) => [key, markStrings(inner)]));
  };
  return markStrings(await importOriginal());
});

function getTextsOnPage() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const texts: string[] = [];
  while (walker.nextNode()) {
    const text = walker.currentNode.textContent?.trim();
    if (text) texts.push(text);
  }
  for (const attribute of TEXT_ATTRIBUTES) {
    for (const element of document.querySelectorAll(`[${attribute}]`)) {
      const text = element.getAttribute(attribute);
      if (text) texts.push(text);
    }
  }
  return texts;
}

beforeEach(() => {
  stubFetchWithHomeScreen(MARKED_HOME_SCREEN);
});

describe('strings.ts', () => {
  it.each([
    [MENU_LABELS.home, MARKED_SESSION_TITLE],
    [MENU_LABELS.sessions, MENU_LABELS.sessions],
  ])('supplies all the text on the %s page', async (menuLabel, textOnceLoaded) => {
    render(createElement(App));
    fireEvent.click(screen.getByRole('button', { name: SIDEBAR_LABELS.menu }));

    fireEvent.click(screen.getByRole('link', { name: menuLabel }));
    await screen.findByRole('heading', { level: 1 });
    await screen.findAllByText(textOnceLoaded);

    const texts = getTextsOnPage();
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.filter((text) => !MARKED_STRING.test(text) && text !== STUDENT_NAME_FROM_API)).toEqual([]);
  });

  it('changes the product name in the page and the browser tab', async () => {
    render(createElement(App));
    await act(() => Promise.resolve());

    expect(screen.getAllByText(PRODUCT_NAME).length).toBeGreaterThan(0);
    expect(document.title).toBe(PRODUCT_NAME);
  });

  it('is the only place in the page source that holds the product name', async () => {
    const actualStrings = await vi.importActual<typeof import('./strings')>('./strings');
    const indexHtml = readFileSync(join(import.meta.dirname, '../index.html'), 'utf8');

    expect(indexHtml).not.toContain(actualStrings.PRODUCT_NAME);
  });
});
