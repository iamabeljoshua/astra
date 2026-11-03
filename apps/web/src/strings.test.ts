import { act, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { MENU_LABELS, PRODUCT_NAME, SIDEBAR_LABELS } from './strings';

vi.mock('./auth/session', () => import('./test/signedInSession'));
vi.mock('./auth/useAccount', () => import('./test/activeAccount'));

const STUDENT_NAME_FROM_API = 'Maya';
const MARKED_STRING = /^«.*»$/s;
const TEXT_ATTRIBUTES = ['aria-label', 'title', 'alt', 'placeholder'];

vi.mock('./strings', async (importOriginal) => {
  const markStrings = (value: unknown): unknown =>
    typeof value === 'string'
      ? `«${value}»`
      : Object.fromEntries(Object.entries(value as object).map(([key, inner]) => [key, markStrings(inner)]));
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
      texts.push(element.getAttribute(attribute) ?? '');
    }
  }
  return texts;
}

async function openPage(menuLabel: string) {
  fireEvent.click(screen.getByRole('link', { name: menuLabel }));
  await screen.findByRole('heading', { level: 1 });
  await act(() => Promise.resolve());
}

beforeEach(() => {
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ status: 'ok' })));
});

describe('strings.ts', () => {
  it.each([MENU_LABELS.home, MENU_LABELS.sessions])('supplies all the text on the %s page', async (menuLabel) => {
    render(createElement(App));
    fireEvent.click(screen.getByRole('button', { name: SIDEBAR_LABELS.menu }));

    await openPage(menuLabel);

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
