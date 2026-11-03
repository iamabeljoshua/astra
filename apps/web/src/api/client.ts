import type { paths } from '@astra/contracts';
import createClient, { type FetchOptions, type FetchResponse, type Middleware } from 'openapi-fetch';
import { ApiError, getApiErrorFromResponse } from './apiError';
import { DEFAULT_REQUEST_TIMEOUT_MS, sendWithTimeout } from './requestTimeout';

const API_BASE_PATH = '/api';

type ApiMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

type RouteWith<Paths, Method extends ApiMethod> = {
  [Route in keyof Paths]: Paths[Route] extends Record<Method, object> ? Route : never;
}[keyof Paths];

type OperationOf<PathItem, Method extends ApiMethod> = PathItem extends Record<Method, infer Operation extends object>
  ? Operation
  : never;

interface RequestTimeoutOption {
  timeoutMs?: number;
}

type ApiCallOptions<Operation> = Partial<FetchOptions<Operation>> extends FetchOptions<Operation>
  ? [options?: FetchOptions<Operation> & RequestTimeoutOption]
  : [options: FetchOptions<Operation> & RequestTimeoutOption];

type ApiCallData<Operation extends object> = NonNullable<
  FetchResponse<Operation, unknown, `${string}/${string}`>['data']
>;

type ApiClient<Paths> = {
  [Method in ApiMethod]: <Route extends RouteWith<Paths, Method>>(
    route: Route,
    ...options: ApiCallOptions<OperationOf<Paths[Route], Method>>
  ) => Promise<ApiCallData<OperationOf<Paths[Route], Method>>>;
};

type CallOptions = RequestTimeoutOption & { signal?: AbortSignal | null };

type SendRequest = (
  method: ApiMethod,
  route: string,
  options: { signal: AbortSignal },
) => Promise<{ data?: unknown; error?: unknown; response: Response }>;

// M2.3 sets the Supabase token on the request here.
const signInMiddleware: Middleware = {
  onRequest: ({ request }) => request,
};

export function createApiClient<Paths extends object>(baseUrl: string) {
  // openapi-fetch keeps the fetch it finds at creation, so read the global per call for tests that stub it.
  const client = createClient<Paths>({ baseUrl, fetch: (request) => globalThis.fetch(request) });
  client.use(signInMiddleware);

  // TypeScript cannot follow openapi-fetch's per-route generics through a wrapper, so ApiClient carries them.
  const sendRequest = client.request as unknown as SendRequest;

  const createCall = (method: ApiMethod) => async (route: string, options: CallOptions = {}) => {
    const { timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, signal: callerSignal, ...requestOptions } = options;
    const { data, error, response } = await sendWithTimeout(
      (signal) => sendRequest(method, route, { ...requestOptions, signal }),
      { timeoutMs, callerSignal },
    );
    if (!response.ok) throw getApiErrorFromResponse(response.status, error);
    // React Query rejects undefined query data with an error of its own, so fail here in the shared shape.
    if (method === 'get' && data === undefined) throw new ApiError({ kind: 'network' });
    return data;
  };

  return {
    get: createCall('get'),
    post: createCall('post'),
    put: createCall('put'),
    patch: createCall('patch'),
    delete: createCall('delete'),
  } as unknown as ApiClient<Paths>;
}

export const api = createApiClient<paths>(`${window.location.origin}${API_BASE_PATH}`);
