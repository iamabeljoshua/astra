import { QueryClient } from '@tanstack/react-query';
import type { ApiError, ApiErrorKind } from './apiError';

declare module '@tanstack/react-query' {
  interface Register {
    defaultError: ApiError;
  }
}

const MAX_RETRIES = 2;
const STALE_TIME_MS = 30_000;
const RETRYABLE_KINDS: ReadonlySet<ApiErrorKind> = new Set(['server', 'network', 'aborted']);

function shouldRetry(failureCount: number, error: ApiError) {
  return failureCount < MAX_RETRIES && RETRYABLE_KINDS.has(error.kind);
}

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      // networkMode always lets a request fail while offline, so screens get an ApiError instead of waiting.
      queries: { retry: shouldRetry, staleTime: STALE_TIME_MS, networkMode: 'always' },
      mutations: { networkMode: 'always' },
    },
  });
}
