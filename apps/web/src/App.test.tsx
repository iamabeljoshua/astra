import type { HealthResponse } from '@astra/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { API_CONNECTION_LABELS, PRODUCT_NAME } from './strings';

const healthyResponse: HealthResponse = { status: 'ok' };

function stubFetchWithHealthyApi() {
  vi.stubGlobal('fetch', async (url: string) =>
    url === '/api/health'
      ? new Response(JSON.stringify(healthyResponse))
      : new Response(null, { status: 404 }),
  );
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
});
