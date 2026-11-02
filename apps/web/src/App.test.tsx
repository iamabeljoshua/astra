import type { HealthResponse } from '@astra/contracts';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { API_CONNECTION_LABELS, PRODUCT_NAME } from './strings';

const healthyResponse: HealthResponse = { status: 'ok' };
const TIME_FOR_SEVERAL_CHECKS_MS = 30_000;

function stubFetchWithHealthyApi() {
  vi.stubGlobal('fetch', async (url: string) =>
    url === '/api/health'
      ? new Response(JSON.stringify(healthyResponse))
      : new Response(null, { status: 404 }),
  );
}

function fetchThatNeverAnswers(_url: string, init?: RequestInit) {
  return new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
  });
}

function letSeveralChecksPass() {
  return act(() => vi.advanceTimersByTimeAsync(TIME_FOR_SEVERAL_CHECKS_MS));
}

describe('App', () => {
  it('shows the product name in the page and the browser tab', async () => {
    stubFetchWithHealthyApi();

    render(<App />);

    await screen.findByRole('heading', { name: PRODUCT_NAME });
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

    it('sends no more checks once connected', async () => {
      const fetchHealth = vi.fn(async () => new Response(JSON.stringify(healthyResponse)));
      vi.stubGlobal('fetch', fetchHealth);

      render(<App />);

      await screen.findByText(API_CONNECTION_LABELS.connected);
      await letSeveralChecksPass();
      expect(fetchHealth).toHaveBeenCalledTimes(1);
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

      unmount();
      expect(fetchHealth.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
      await letSeveralChecksPass();
      expect(fetchHealth).toHaveBeenCalledTimes(1);
    });
  });
});
