import type { operations, paths } from '@astra/contracts';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { ApiError } from './apiError';
import { api, createApiClient } from './client';

type JsonContent<Body> = { content: { 'application/json': Body } };

interface ThingPaths {
  '/things': {
    get: {
      parameters: { query: { limit: number } };
      responses: { 200: JsonContent<{ id: string }[]> };
    };
    post: {
      requestBody: JsonContent<{ title: string }>;
      responses: { 201: JsonContent<{ id: string; title: string }> };
    };
  };
  '/things/{thingId}': {
    get: {
      parameters: { path: { thingId: string } };
      responses: { 200: JsonContent<{ id: string }> };
    };
    delete: {
      parameters: { path: { thingId: string } };
      responses: { 204: { content?: never } };
    };
  };
}

const VALID_THING = { title: 'First thing' };
const things = createApiClient<ThingPaths>('http://localhost/api');

function stubFetch(answer: (request: Request) => Promise<Response>) {
  const fetchStub = vi.fn(answer);
  vi.stubGlobal('fetch', fetchStub);
  return fetchStub;
}

function stubAnswer(status: number, body?: unknown) {
  return stubFetch(async () => new Response(body === undefined ? null : JSON.stringify(body), { status }));
}

function validationBody(...sentences: string[]) {
  return { message: sentences, error: 'Bad Request', statusCode: 400 };
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
  // Each sentence is copied from a real ValidationPipe response.
  it.each([
    ['a wrong type', 'title must be a string', 'title'],
    ['an invalid format', 'thingId must be a UUID', 'thingId'],
    ['a limit on a query number', 'limit must not be less than 1', 'limit'],
    ['a choice', 'level must be one of the following values: a, b', 'level'],
    ['a field the DTO does not declare', 'property extra should not exist', 'extra'],
    ['a bad list value', 'each value in tags must be a string', 'tags'],
    ['a field inside a nested object', 'inner.innerName must be a string', 'inner.innerName'],
    ['a field inside a list item', 'items.0.innerName must be a string', 'items.0.innerName'],
    ['an undeclared field inside a nested object', 'inner.property extra should not exist', 'inner.extra'],
    ['an undeclared field inside a list item', 'items.0.property extra should not exist', 'items.0.extra'],
    ['a bad list value inside a nested object', 'inner.each value in tags must be a string', 'inner.tags'],
  ])('names the field for %s', async (_name, sentence, fieldPath) => {
    stubAnswer(400, validationBody(sentence));

    const failure = await getFailure(things.post('/things', { body: VALID_THING }));

    expect(failure).toEqual({ kind: 'validation', status: 400, fieldMessages: { [fieldPath]: [sentence] } });
  });

  it('groups several sentences by field', async () => {
    stubAnswer(400, validationBody('limit must not be less than 1', 'limit must be an integer number', 'title must be a string'));

    const failure = await getFailure(things.post('/things', { body: VALID_THING }));

    expect(failure.fieldMessages).toEqual({
      limit: ['limit must not be less than 1', 'limit must be an integer number'],
      title: ['title must be a string'],
    });
  });

  it.each([
    ['a custom message', 'Pick a nickname.'],
    ['a sentence that does not start with the field', "All tags's elements must be unique"],
  ])('stays a validation error and guesses no field for %s', async (_name, sentence) => {
    stubAnswer(400, validationBody(sentence));

    const failure = await getFailure(things.post('/things', { body: VALID_THING }));

    expect(failure).toEqual({ kind: 'validation', status: 400, fieldMessages: {} });
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
