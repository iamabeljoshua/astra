import { onlineManager, useMutation, useQuery } from '@tanstack/react-query';
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { API_ERROR_LABELS } from '../strings';
import { renderWithQueryClient } from '../test/renderWithQueryClient';
import { things } from '../test/thingsApi';
import type { ApiError } from './apiError';
import { api } from './client';
import { createQueryClient } from './queryClient';
import { DEFAULT_REQUEST_TIMEOUT_MS } from './requestTimeout';

const TIME_FOR_EVERY_RETRY_MS = 30_000;
const TITLE_REJECTED_LABEL = 'title rejected';
const TITLE_REJECTED_BODY = {
  message: ['title must be a string'],
  error: 'Bad Request',
  statusCode: 400,
  fieldMessages: { title: ['title must be a string'] },
};

function stubFetchAnswer(status: number, body: unknown) {
  const fetchStub = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchStub);
  return fetchStub;
}

function HealthStatus() {
  const { data: health, error } = useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => api.get('/health', { signal }),
  });
  if (error) return <p>{API_ERROR_LABELS[error.kind]}</p>;
  return <p>{health?.status ?? 'loading'}</p>;
}

function CreateThing() {
  const createThing = useMutation({ mutationFn: (title: string) => things.post('/things', { body: { title } }) });
  return (
    <>
      <button onClick={() => createThing.mutate('First thing')}>create</button>
      {createThing.error && <p>{API_ERROR_LABELS[createThing.error.kind]}</p>}
      {createThing.error?.fieldMessages.title && <p>{TITLE_REJECTED_LABEL}</p>}
    </>
  );
}

describe('a screen that uses a query', () => {
  it('shows loading and then the data', async () => {
    stubFetchAnswer(200, { status: 'ok' });

    renderWithQueryClient(<HealthStatus />);

    screen.getByText('loading');
    await screen.findByText('ok');
  });

  it.each([
    ['a 500', () => stubFetchAnswer(500, {}), API_ERROR_LABELS.server],
    ['a 404', () => stubFetchAnswer(404, {}), API_ERROR_LABELS.rejected],
    ['a network failure', () => vi.stubGlobal('fetch', () => Promise.reject(new TypeError('down'))), API_ERROR_LABELS.network],
  ])('shows the text for %s', async (_name, stub, label) => {
    stub();

    renderWithQueryClient(<HealthStatus />);

    await screen.findByText(label);
  });

  it('types the error as an ApiError', () => {
    expectTypeOf<ReturnType<typeof useQuery<string>>['error']>().toEqualTypeOf<ApiError | null>();
    expectTypeOf<ReturnType<typeof useMutation<string>>['error']>().toEqualTypeOf<ApiError | null>();
  });
});

describe('a screen that uses a mutation', () => {
  it('receives the field that a validation 400 rejected', async () => {
    stubFetchAnswer(400, TITLE_REJECTED_BODY);

    renderWithQueryClient(<CreateThing />);
    fireEvent.click(screen.getByRole('button'));

    await screen.findByText(TITLE_REJECTED_LABEL);
    screen.getByText(API_ERROR_LABELS.validation);
  });

  it('sends a failed mutation once', async () => {
    const fetchStub = stubFetchAnswer(500, {});

    renderWithQueryClient(<CreateThing />);
    fireEvent.click(screen.getByRole('button'));

    await screen.findByText(API_ERROR_LABELS.server);
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });
});

describe('the shared defaults', () => {
  const fetchHealth = () =>
    createQueryClient().fetchQuery({
      queryKey: ['health'],
      queryFn: ({ signal }) => api.get('/health', { signal }),
    });

  async function getCallsAfterEveryRetry(status: number) {
    const fetchStub = stubFetchAnswer(status, TITLE_REJECTED_BODY);
    const query = fetchHealth().catch(() => undefined);
    await act(() => vi.advanceTimersByTimeAsync(TIME_FOR_EVERY_RETRY_MS));
    await query;
    return fetchStub.mock.calls.length;
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    onlineManager.setOnline(true);
  });

  it('tries a server failure three times in all', async () => {
    expect(await getCallsAfterEveryRetry(500)).toBe(3);
  });

  it('tries a network failure three times in all', async () => {
    const fetchStub = vi.fn(() => Promise.reject(new TypeError('down')));
    vi.stubGlobal('fetch', fetchStub);

    const query = fetchHealth().catch(() => undefined);
    await act(() => vi.advanceTimersByTimeAsync(TIME_FOR_EVERY_RETRY_MS));
    await query;

    expect(fetchStub).toHaveBeenCalledTimes(3);
  });

  it('tries a read that never answers once, and gives it a timeout error', async () => {
    const fetchStub = vi.fn(() => new Promise<Response>(() => undefined));
    vi.stubGlobal('fetch', fetchStub);

    const query = fetchHealth().catch((thrown: ApiError) => thrown.kind);
    await act(() => vi.advanceTimersByTimeAsync(DEFAULT_REQUEST_TIMEOUT_MS + TIME_FOR_EVERY_RETRY_MS));

    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(await query).toBe('timeout');
  });

  it('tries a read that its own signal aborted three times in all', async () => {
    stubFetchAnswer(200, { status: 'ok' });
    const readWithAbortedSignal = vi.fn(() => api.get('/health', { signal: AbortSignal.abort() }));

    const query = createQueryClient()
      .fetchQuery({ queryKey: ['health'], queryFn: readWithAbortedSignal })
      .catch((thrown: ApiError) => thrown.kind);
    await act(() => vi.advanceTimersByTimeAsync(TIME_FOR_EVERY_RETRY_MS));

    expect(await query).toBe('aborted');
    expect(readWithAbortedSignal).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['a validation failure', 400],
    ['a missing route', 404],
    ['a sign-in failure', 401],
  ])('does not repeat %s, because the answer would not change', async (_name, status) => {
    expect(await getCallsAfterEveryRetry(status)).toBe(1);
  });

  it('gives a screen an error while the browser reports it is offline', async () => {
    onlineManager.setOnline(false);
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')));

    renderWithQueryClient(<HealthStatus />);

    await act(() => vi.advanceTimersByTimeAsync(0));
    screen.getByText(API_ERROR_LABELS.network);
  });

  it('gives a screen an error for a mutation while the browser reports it is offline', async () => {
    onlineManager.setOnline(false);
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')));

    renderWithQueryClient(<CreateThing />);
    fireEvent.click(screen.getByRole('button'));

    await act(() => vi.advanceTimersByTimeAsync(0));
    screen.getByText(API_ERROR_LABELS.network);
  });

  it('tries a read that failed offline again when the browser comes back online', async () => {
    onlineManager.setOnline(false);
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')));

    renderWithQueryClient(<HealthStatus />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    screen.getByText(API_ERROR_LABELS.network);

    stubFetchAnswer(200, { status: 'ok' });
    act(() => onlineManager.setOnline(true));
    await act(() => vi.advanceTimersByTimeAsync(0));

    screen.getByText('ok');
  });

  it('reuses fresh data when a screen opens again', async () => {
    const fetchStub = stubFetchAnswer(200, { status: 'ok' });
    const queryClient = createQueryClient();
    const options = { queryKey: ['health'], queryFn: () => api.get('/health') };

    await queryClient.fetchQuery(options);
    await queryClient.fetchQuery(options);
    expect(fetchStub).toHaveBeenCalledTimes(1);

    await act(() => vi.advanceTimersByTimeAsync(TIME_FOR_EVERY_RETRY_MS + 1));
    await queryClient.fetchQuery(options);
    expect(fetchStub).toHaveBeenCalledTimes(2);
  });
});

describe('renderWithQueryClient', () => {
  it('keeps the query client when a test rerenders', async () => {
    const fetchStub = stubFetchAnswer(200, { status: 'ok' });

    const { rerender } = renderWithQueryClient(<HealthStatus />);
    await screen.findByText('ok');
    rerender(<HealthStatus />);

    screen.getByText('ok');
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });
});
