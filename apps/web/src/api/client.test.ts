import type { operations, paths } from '@astra/contracts';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { things } from '../test/thingsApi';
import { ApiError } from './apiError';
import { api } from './client';
import { DEFAULT_REQUEST_TIMEOUT_MS } from './requestTimeout';

const VALID_THING = { title: 'First thing' };
const BAD_REQUEST = { error: 'Bad Request', statusCode: 400 };
const SMALL_MARGIN_MS = 100;

function stubFetch(answer: (request: Request) => Promise<Response>) {
  const fetchStub = vi.fn(answer);
  vi.stubGlobal('fetch', fetchStub);
  return fetchStub;
}

function stubAnswer(status: number, body?: unknown) {
  return stubFetch(async () => new Response(body === undefined ? null : JSON.stringify(body), { status }));
}

async function getFailure(request: Promise<unknown>) {
  const rejection = await request.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(rejection).toBeInstanceOf(ApiError);
  const { kind, status, fieldMessages } = rejection as ApiError;
  return { kind, status, fieldMessages };
}

// pnpm typecheck fails if any of these calls compiles. They never run.
void (async () => {
  // @ts-expect-error the API has no such route.
  await api.get('/no-such-route');
  // @ts-expect-error the health route has no POST.
  await api.post('/health');
  // @ts-expect-error the health route takes no body.
  await api.get('/health', { body: { status: 'ok' } });
  // @ts-expect-error a body is required.
  await things.post('/things');
  // @ts-expect-error a body is required.
  await things.post('/things', {});
  // @ts-expect-error title must be a string.
  await things.post('/things', { body: { title: 42 } });
  // @ts-expect-error the body has no field called name.
  await things.post('/things', { body: { name: 'First thing' } });
  // @ts-expect-error the body has no field called extra.
  await things.post('/things', { body: { title: 'First thing', extra: true } });
  // @ts-expect-error a query is required.
  await things.get('/things');
  // @ts-expect-error limit must be a number.
  await things.get('/things', { params: { query: { limit: 'many' } } });
  // @ts-expect-error the route parameter is required.
  await things.get('/things/{thingId}', { params: { path: {} } });
  // @ts-expect-error a timeout is a number of milliseconds.
  await api.get('/health', { timeoutMs: 'soon' });
  // @ts-expect-error id is a string.
  const wrongField: number = (await things.post('/things', { body: VALID_THING })).id;
  void wrongField;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a call that succeeds', () => {
  it('reads its types from the paths and operations that contracts exports', () => {
    expectTypeOf<paths['/health']['get']>().toEqualTypeOf<operations['HealthController_getHealth']>();
    expectTypeOf(api.get<'/health'>).returns.resolves.toEqualTypeOf<{ status: 'ok' }>();
  });

  it('gives the caller the typed response', async () => {
    stubAnswer(200, { status: 'ok' });

    const health = await api.get('/health');

    expect(health.status).toBe('ok');
  });

  it('calls the API under the same origin as the page', async () => {
    const fetchStub = stubAnswer(200, { status: 'ok' });

    await api.get('/health');

    expect(fetchStub.mock.calls[0]?.[0].url).toBe(`${window.location.origin}/api/health`);
  });

  it('sends the body as JSON', async () => {
    const fetchStub = stubAnswer(201, { id: '1', ...VALID_THING });

    const thing = await things.post('/things', { body: VALID_THING });

    const request = fetchStub.mock.calls[0]?.[0];
    expect(request?.method).toBe('POST');
    expect(await request?.json()).toEqual(VALID_THING);
    expect(thing.id).toBe('1');
  });

  it('sends the query string and the route parameter', async () => {
    const fetchStub = stubAnswer(200, []);

    await things.get('/things', { params: { query: { limit: 5 } } });
    await things.get('/things/{thingId}', { params: { path: { thingId: 'a/b' } } });

    expect(fetchStub.mock.calls[0]?.[0].url).toBe('http://localhost/api/things?limit=5');
    expect(fetchStub.mock.calls[1]?.[0].url).toBe('http://localhost/api/things/a%2Fb');
  });

  it('accepts a 204 with no body from a call that changes data', async () => {
    stubAnswer(204);

    await expect(things.delete('/things/{thingId}', { params: { path: { thingId: '1' } } })).resolves.toBeUndefined();
  });
});

describe('a validation 400', () => {
  it.each([
    [
      'an invalid route parameter',
      { ...BAD_REQUEST, message: ['studentId must be a UUID'], fieldMessages: { studentId: ['studentId must be a UUID'] } },
    ],
    [
      'a limit on a query number',
      { ...BAD_REQUEST, message: ['limit must not be less than 1'], fieldMessages: { limit: ['limit must not be less than 1'] } },
    ],
    [
      'a choice',
      {
        ...BAD_REQUEST,
        message: ['language must be one of the following values: en'],
        fieldMessages: { language: ['language must be one of the following values: en'] },
      },
    ],
    [
      'a field the DTO does not declare',
      { ...BAD_REQUEST, message: ['property extra should not exist'], fieldMessages: { extra: ['property extra should not exist'] } },
    ],
    [
      'a bad list value',
      { ...BAD_REQUEST, message: ['each value in tags must be a string'], fieldMessages: { tags: ['each value in tags must be a string'] } },
    ],
    [
      'a field inside a nested object',
      {
        ...BAD_REQUEST,
        message: ['inner.label must have visible text and no invalid characters'],
        fieldMessages: { 'inner.label': ['inner.label must have visible text and no invalid characters'] },
      },
    ],
    [
      'a field inside a list item',
      {
        ...BAD_REQUEST,
        message: ['items.1.label must have visible text and no invalid characters'],
        fieldMessages: { 'items.1.label': ['items.1.label must have visible text and no invalid characters'] },
      },
    ],
    [
      'an undeclared field inside a nested object',
      {
        ...BAD_REQUEST,
        message: ['inner.property extra should not exist'],
        fieldMessages: { 'inner.extra': ['inner.property extra should not exist'] },
      },
    ],
    [
      'an undeclared field inside a list item',
      {
        ...BAD_REQUEST,
        message: ['items.0.property extra should not exist'],
        fieldMessages: { 'items.0.extra': ['items.0.property extra should not exist'] },
      },
    ],
    [
      'a list item that is not an object',
      {
        ...BAD_REQUEST,
        message: ['items.each value in nested property items must be either object or array'],
        fieldMessages: {
          items: ['each value in items must be an object'],
          'items.0': ['items.each value in nested property items must be either object or array'],
        },
      },
    ],
    [
      'a custom message',
      { ...BAD_REQUEST, message: ['Pick a nickname.'], fieldMessages: { nickname: ['Pick a nickname.'] } },
    ],
    [
      'a custom message that names another field',
      { ...BAD_REQUEST, message: ['title must be unique'], fieldMessages: { subject: ['title must be unique'] } },
    ],
    [
      'a default message that does not start with the field',
      { ...BAD_REQUEST, message: ["All labels's elements must be unique"], fieldMessages: { labels: ["All labels's elements must be unique"] } },
    ],
    [
      'several rules on several fields',
      {
        ...BAD_REQUEST,
        message: [
          'title must have visible text and no invalid characters',
          'title must be shorter than or equal to 200 characters',
          'title must be a string',
          'subject must have visible text and no invalid characters',
          'subject must be shorter than or equal to 60 characters',
          'subject must be a string',
          'language must be one of the following values: en',
        ],
        fieldMessages: {
          title: [
            'title must have visible text and no invalid characters',
            'title must be shorter than or equal to 200 characters',
            'title must be a string',
          ],
          subject: [
            'subject must have visible text and no invalid characters',
            'subject must be shorter than or equal to 60 characters',
            'subject must be a string',
          ],
          language: ['language must be one of the following values: en'],
        },
      },
    ],
  ])('gives the screen the fields for %s', async (_name, body) => {
    stubAnswer(400, body);

    const failure = await getFailure(things.post('/things', { body: VALID_THING }));

    expect(failure).toEqual({ kind: 'validation', status: 400, fieldMessages: body.fieldMessages });
  });

  it('is a validation error with no field when the request is nested too deeply', async () => {
    stubAnswer(400, { ...BAD_REQUEST, message: ['The request is nested too deeply.'], fieldMessages: {} });

    const failure = await getFailure(things.post('/things', { body: VALID_THING }));

    expect(failure).toEqual({ kind: 'validation', status: 400, fieldMessages: {} });
  });

  it.each([
    ['no field data', { ...BAD_REQUEST, message: ['title must be a string'] }],
    ['field data that is null', { ...BAD_REQUEST, fieldMessages: null }],
    ['field data that is a list', { ...BAD_REQUEST, fieldMessages: ['title'] }],
  ])('is not a validation error for a 400 with %s', async (_name, body) => {
    stubAnswer(400, body);

    const failure = await getFailure(things.post('/things', { body: VALID_THING }));

    expect(failure).toEqual({ kind: 'rejected', status: 400, fieldMessages: {} });
  });
});

describe('every other failure has the same shape', () => {
  it.each([
    ['a 400 that is not validation', 400, { message: 'Unexpected end of JSON input', error: 'Bad Request', statusCode: 400 }, 'rejected'],
    ['a missing route', 404, { message: 'Cannot GET /nowhere', error: 'Not Found', statusCode: 404 }, 'rejected'],
    ['a sign-in failure', 401, { message: 'Unauthorized', statusCode: 401 }, 'rejected'],
    ['a 500', 500, { statusCode: 500, message: 'Internal server error' }, 'server'],
    ['a bad gateway with no body', 502, undefined, 'server'],
  ])('%s', async (_name, status, body, kind) => {
    stubAnswer(status, body);

    expect(await getFailure(api.get('/health'))).toEqual({ kind, status, fieldMessages: {} });
  });

  it('a 500 with a page instead of JSON', async () => {
    stubFetch(async () => new Response('<h1>Error</h1>', { status: 500 }));

    expect(await getFailure(api.get('/health'))).toEqual({ kind: 'server', status: 500, fieldMessages: {} });
  });

  it('a network failure', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));

    expect(await getFailure(api.get('/health'))).toEqual({ kind: 'network', status: null, fieldMessages: {} });
  });

  it('a request aborted while it waits', async () => {
    stubFetch(
      (request) =>
        new Promise((_resolve, reject) => {
          request.signal.addEventListener('abort', () => reject(request.signal.reason));
        }),
    );
    const controller = new AbortController();

    const request = api.get('/health', { signal: controller.signal });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    controller.abort(new Error('Any reason'));

    expect(await getFailure(request)).toEqual({ kind: 'aborted', status: null, fieldMessages: {} });
  });

  it('a success that is not JSON', async () => {
    stubFetch(async () => new Response('<!doctype html>', { status: 200 }));

    expect(await getFailure(api.get('/health'))).toEqual({ kind: 'network', status: null, fieldMessages: {} });
  });

  it('a read that answers with no body', async () => {
    stubAnswer(200);

    expect(await getFailure(api.get('/health'))).toEqual({ kind: 'network', status: null, fieldMessages: {} });
  });
});

describe('the request timeout', () => {
  const EVERY_CALL_LIMIT_MS = 30_000;
  const LONGER_TIMEOUT_MS = 120_000;
  const fetchThatIgnoresItsSignal = () => new Promise<Response>(() => undefined);
  const ABORTED_FAILURE = { kind: 'aborted', status: null, fieldMessages: {} };
  const TIMEOUT_FAILURE = { kind: 'timeout', status: null, fieldMessages: {} };

  const waitMs = (durationMs: number) => vi.advanceTimersByTimeAsync(durationMs);

  async function isPending(request: Promise<unknown>) {
    const stillPending = Symbol('still pending');
    return (await Promise.race([request, stillPending])) === stillPending;
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stops a read at 30 seconds, even if the request ignores its signal', async () => {
    stubFetch(fetchThatIgnoresItsSignal);

    const failure = getFailure(api.get('/health'));

    await waitMs(EVERY_CALL_LIMIT_MS - SMALL_MARGIN_MS);
    expect(await isPending(failure)).toBe(true);
    await waitMs(2 * SMALL_MARGIN_MS);
    expect(await failure).toEqual(TIMEOUT_FAILURE);
  });

  it('gives the caller an answer that arrives just inside the limit', async () => {
    stubFetch(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(new Response(JSON.stringify({ status: 'ok' }))), EVERY_CALL_LIMIT_MS - SMALL_MARGIN_MS);
        }),
    );

    const answer = api.get('/health');
    await waitMs(EVERY_CALL_LIMIT_MS);

    expect((await answer).status).toBe('ok');
  });

  it('stops a call that changes data at the default timeout', async () => {
    stubFetch(fetchThatIgnoresItsSignal);

    const failure = getFailure(things.post('/things', { body: VALID_THING }));

    await waitMs(DEFAULT_REQUEST_TIMEOUT_MS + SMALL_MARGIN_MS);
    expect(await failure).toEqual(TIMEOUT_FAILURE);
  });

  it('aborts the request, so that the browser closes it', async () => {
    const fetchStub = stubFetch(fetchThatIgnoresItsSignal);

    const failure = getFailure(api.get('/health'));

    await waitMs(DEFAULT_REQUEST_TIMEOUT_MS + SMALL_MARGIN_MS);
    await failure;
    expect(fetchStub.mock.calls[0]?.[0].signal.aborted).toBe(true);
  });

  it('stops an answer whose body never finishes', async () => {
    stubFetch(async () => new Response(new ReadableStream()));

    const failure = getFailure(api.get('/health'));

    await waitMs(DEFAULT_REQUEST_TIMEOUT_MS + SMALL_MARGIN_MS);
    expect(await failure).toEqual(TIMEOUT_FAILURE);
  });

  it('lets a caller set a longer timeout', async () => {
    stubFetch(fetchThatIgnoresItsSignal);

    const failure = getFailure(api.get('/health', { timeoutMs: LONGER_TIMEOUT_MS }));

    await waitMs(LONGER_TIMEOUT_MS - SMALL_MARGIN_MS);
    expect(await isPending(failure)).toBe(true);
    await waitMs(2 * SMALL_MARGIN_MS);
    expect(await failure).toEqual(TIMEOUT_FAILURE);
  });

  it('lets a caller wait without a limit by passing Infinity', async () => {
    stubFetch(fetchThatIgnoresItsSignal);
    const controller = new AbortController();

    const failure = getFailure(api.get('/health', { timeoutMs: Infinity, signal: controller.signal }));

    await waitMs(LONGER_TIMEOUT_MS);
    expect(await isPending(failure)).toBe(true);
    controller.abort();
    expect(await failure).toEqual(ABORTED_FAILURE);
  });

  it('stops as soon as the caller aborts, even if the request ignores its signal', async () => {
    stubFetch(fetchThatIgnoresItsSignal);
    const controller = new AbortController();

    const failure = getFailure(api.get('/health', { signal: controller.signal }));
    controller.abort();

    expect(await failure).toEqual(ABORTED_FAILURE);
  });

  it('keeps an abort from the caller an abort, even when its reason is a TimeoutError', async () => {
    stubFetch(fetchThatIgnoresItsSignal);
    const controller = new AbortController();

    const failure = getFailure(api.get('/health', { signal: controller.signal }));
    controller.abort(new DOMException('The caller gave up.', 'TimeoutError'));

    expect(await failure).toEqual(ABORTED_FAILURE);
  });

  it('stops a call whose signal has already aborted', async () => {
    stubFetch(fetchThatIgnoresItsSignal);

    expect(await getFailure(api.get('/health', { signal: AbortSignal.abort() }))).toEqual(ABORTED_FAILURE);
  });

  it.each([
    ['an answer', () => stubAnswer(200, { status: 'ok' })],
    ['a failure', () => stubAnswer(500, {})],
    ['a network failure', () => stubFetch(() => Promise.reject(new TypeError('down')))],
  ])('leaves no timer behind after %s', async (_name, stub) => {
    stub();

    await api.get('/health').catch(() => undefined);

    expect(vi.getTimerCount()).toBe(0);
  });
});
