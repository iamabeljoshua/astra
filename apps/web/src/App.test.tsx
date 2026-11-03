import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { APP_ERROR_LABELS, HOME_LABELS, PRODUCT_NAME } from './strings';
import { EXAMPLE_HOME_SCREEN, stubFetchWithHomeScreen } from './test/homeScreenApi';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('App', () => {
  it('shows the product name in the page and the browser tab', async () => {
    stubFetchWithHomeScreen();

    render(<App />);

    await screen.findByRole('heading', { name: HOME_LABELS.greeting(EXAMPLE_HOME_SCREEN.studentName) });
    expect(screen.getAllByText(PRODUCT_NAME).length).toBeGreaterThan(0);
    expect(document.title).toBe(PRODUCT_NAME);
  });

  it('shows a calm line and a reload control when a screen crashes', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ studentName: 'Maya' })));

    render(<App />);

    await screen.findByText(APP_ERROR_LABELS.message);
    screen.getByRole('button', { name: APP_ERROR_LABELS.reload });
    expect(document.title).toBe(PRODUCT_NAME);
  });
});
