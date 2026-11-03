import type { components } from '@astra/contracts';
import { focusManager, onlineManager } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { API_CONNECTION_LABELS, MENU_LABELS, PRODUCT_NAME } from './strings';
import { HEALTH_CHECK_RETRY_DELAY_MS, HEALTH_CHECK_TIMEOUT_MS } from './useApiConnection';

vi.mock('./auth/session', () => import('./test/signedInSession'));
vi.mock('./auth/useAccount', () => import('./test/activeAccount'));

const healthyResponse: components['schemas']['HealthResponseDto'] = { status: 'ok' };
const TIME_FOR_SEVERAL_CHECKS_MS = 30_000;
const SMALL_MARGIN_MS = 100;

function stubFetchWithHealthyApi() {
  vi.stubGlobal('fetch', async (request: Request) =>
    new URL(request.url).pathname === '/api/health'
      ? new Response(JSON.stringify(healthyResponse))
      : new Response(null, { status: 404 }),
  );
}

function fetchThatNeverAnswers(request: Request) {
  return new Promise<Response>((_resolve, reject) => {
    request.signal.addEventListener('abort', () => reject(request.signal.reason));
  });
}

function letSeveralChecksPass() {
  return act(() => vi.advanceTimersByTimeAsync(TIME_FOR_SEVERAL_CHECKS_MS));
}

describe('App', () => {
  it('shows the product name in the page and the browser tab', async () => {
    stubFetchWithHealthyApi();

    render(<App />);

    await screen.findByText(API_CONNECTION_LABELS.connected);
    expect(screen.getAllByText(PRODUCT_NAME).length).toBeGreaterThan(0);
    expect(document.title).toBe(PRODUCT_NAME);
  });

  it('says the API is connected when the health check passes', async () => {
    stubFetchWithHealthyApi();

    render(<App />);

    screen.getByText(API_CONNECTION_LABELS.checking);
    await screen.findByText(API_CONNECTION_LABELS.connected);
  });

  it('says the API is not connected when the request fails', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('network down')));

    render(<App />);

    await screen.findByText(API_CONNECTION_LABELS.notConnected);
  });

  it('says the API is not connected when the dev proxy cannot reach it', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 502 }));

    render(<App />);

    await screen.findByText(API_CONNECTION_LABELS.notConnected);
  });

  it('says the API is not connected when the health route is missing', async () => {
    vi.stubGlobal(
      'fetch',
      async () => new Response(JSON.stringify({ statusCode: 404 }), { status: 404 }),
    );

    render(<App />);

    await screen.findByText(API_CONNECTION_LABELS.notConnected);
  });

  describe('over time', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
      vi.useRealTimers();
      focusManager.setFocused(undefined);
      onlineManager.setOnline(true);
    });

    it('says the API is connected with no reload when a later check passes', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockImplementationOnce(async () => new Response('', { status: 502 }))
          .mockImplementation(async () => new Response(JSON.stringify(healthyResponse))),
      );

      render(<App />);

      await screen.findByText(API_CONNECTION_LABELS.notConnected);
      await letSeveralChecksPass();
      await screen.findByText(API_CONNECTION_LABELS.connected);
    });

    it('says the API is not connected when a check never answers', async () => {
      vi.stubGlobal('fetch', fetchThatNeverAnswers);

      render(<App />);

      screen.getByText(API_CONNECTION_LABELS.checking);
      await letSeveralChecksPass();
      await screen.findByText(API_CONNECTION_LABELS.notConnected);
    });

    it('gives up on a check after 3 seconds', async () => {
      vi.stubGlobal('fetch', fetchThatNeverAnswers);

      render(<App />);

      await act(() => vi.advanceTimersByTimeAsync(HEALTH_CHECK_TIMEOUT_MS - SMALL_MARGIN_MS));
      screen.getByText(API_CONNECTION_LABELS.checking);
      await act(() => vi.advanceTimersByTimeAsync(2 * SMALL_MARGIN_MS));
      screen.getByText(API_CONNECTION_LABELS.notConnected);
    });

    it('sends no more checks once connected', async () => {
      const fetchHealth = vi.fn(async () => new Response(JSON.stringify(healthyResponse)));
      vi.stubGlobal('fetch', fetchHealth);

      render(<App />);

      await screen.findByText(API_CONNECTION_LABELS.connected);
      await letSeveralChecksPass();
      expect(fetchHealth).toHaveBeenCalledTimes(1);
    });

    it('keeps checking until an answer says the API is healthy', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockImplementationOnce(async () => new Response(JSON.stringify({ status: 'starting' })))
          .mockImplementation(async () => new Response(JSON.stringify(healthyResponse))),
      );

      render(<App />);

      await screen.findByText(API_CONNECTION_LABELS.notConnected);
      await letSeveralChecksPass();
      await screen.findByText(API_CONNECTION_LABELS.connected);
    });

    it('stays on not connected while a later check waits for its answer', async () => {
      const fetchHealth = vi
        .fn()
        .mockImplementationOnce(async () => new Response('', { status: 502 }))
        .mockImplementation(fetchThatNeverAnswers);
      vi.stubGlobal('fetch', fetchHealth);

      render(<App />);

      await screen.findByText(API_CONNECTION_LABELS.notConnected);
      await act(() => vi.advanceTimersByTimeAsync(HEALTH_CHECK_RETRY_DELAY_MS + SMALL_MARGIN_MS));
      expect(fetchHealth).toHaveBeenCalledTimes(2);
      screen.getByText(API_CONNECTION_LABELS.notConnected);
    });

    it('waits 2 seconds after a failed check before the next one', async () => {
      const fetchHealth = vi.fn(async () => new Response('', { status: 502 }));
      vi.stubGlobal('fetch', fetchHealth);

      render(<App />);

      await screen.findByText(API_CONNECTION_LABELS.notConnected);
      expect(fetchHealth).toHaveBeenCalledTimes(1);
      await act(() => vi.advanceTimersByTimeAsync(HEALTH_CHECK_RETRY_DELAY_MS - SMALL_MARGIN_MS));
      expect(fetchHealth).toHaveBeenCalledTimes(1);
      await act(() => vi.advanceTimersByTimeAsync(2 * SMALL_MARGIN_MS));
      expect(fetchHealth).toHaveBeenCalledTimes(2);
    });

    it('keeps checking while the tab is hidden', async () => {
      const fetchHealth = vi.fn(async () => new Response('', { status: 502 }));
      vi.stubGlobal('fetch', fetchHealth);
      focusManager.setFocused(false);

      render(<App />);

      await letSeveralChecksPass();
      expect(fetchHealth.mock.calls.length).toBeGreaterThan(1);
    });

    it('keeps checking while the browser reports it is offline', async () => {
      onlineManager.setOnline(false);
      const fetchHealth = vi.fn(() => Promise.reject(new TypeError('offline')));
      vi.stubGlobal('fetch', fetchHealth);

      render(<App />);

      await letSeveralChecksPass();
      screen.getByText(API_CONNECTION_LABELS.notConnected);
      expect(fetchHealth.mock.calls.length).toBeGreaterThan(1);
    });

    it('checks again each time Home opens', async () => {
      const fetchHealth = vi.fn(async () => new Response(JSON.stringify(healthyResponse)));
      vi.stubGlobal('fetch', fetchHealth);

      render(<App />);
      await screen.findByText(API_CONNECTION_LABELS.connected);

      fireEvent.click(screen.getByRole('link', { name: MENU_LABELS.sessions }));
      await letSeveralChecksPass();
      fireEvent.click(screen.getByRole('link', { name: MENU_LABELS.home }));

      screen.getByText(API_CONNECTION_LABELS.checking);
      await screen.findByText(API_CONNECTION_LABELS.connected);
      expect(fetchHealth).toHaveBeenCalledTimes(2);
    });

    it('sends no more checks after the page unmounts', async () => {
      const fetchHealth = vi.fn(async () => new Response('', { status: 502 }));
      vi.stubGlobal('fetch', fetchHealth);

      const { unmount } = render(<App />);

      await screen.findByText(API_CONNECTION_LABELS.notConnected);
      unmount();
      await letSeveralChecksPass();
      expect(fetchHealth).toHaveBeenCalledTimes(1);
    });

    it('cancels the open check and sends no more when the page unmounts', async () => {
      const fetchHealth = vi.fn(fetchThatNeverAnswers);
      vi.stubGlobal('fetch', fetchHealth);

      const { unmount } = render(<App />);

      await vi.waitFor(() => expect(fetchHealth).toHaveBeenCalled());
      unmount();
      expect(fetchHealth.mock.calls[0]?.[0].signal.aborted).toBe(true);
      await letSeveralChecksPass();
      expect(fetchHealth).toHaveBeenCalledTimes(1);
    });
  });
});
