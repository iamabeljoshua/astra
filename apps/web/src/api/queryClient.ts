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
      // networkMode always gives a screen an ApiError while offline, and it turns refetchOnReconnect off unless set.
      queries: { retry: shouldRetry, staleTime: STALE_TIME_MS, networkMode: 'always', refetchOnReconnect: true },
      mutations: { networkMode: 'always' },
    },
  });
}
