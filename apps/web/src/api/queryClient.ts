import { QueryClient } from '@tanstack/react-query';
import { ApiError, type ApiErrorKind } from './apiError';

declare module '@tanstack/react-query' {
  interface Register {
    defaultError: ApiError;
  }
}

const MAX_RETRIES = 2;
const STALE_TIME_MS = 30_000;
const IS_RETRYABLE: Readonly<Record<ApiErrorKind, boolean>> = {
  validation: false,
  rejected: false,
  server: true,
  network: true,
  authUnreachable: false,
  tokenRefusedAfterRenewal: false,
  aborted: true,
  timeout: false,
};

function shouldRetry(failureCount: number, error: ApiError) {
  return failureCount < MAX_RETRIES && IS_RETRYABLE[error.kind];
}

function belongsInErrorBoundary(error: Error) {
  return !(error instanceof ApiError);
}

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      // networkMode always gives a screen an ApiError while offline, and it turns refetchOnReconnect off unless set.
      queries: {
        retry: shouldRetry,
        staleTime: STALE_TIME_MS,
        networkMode: 'always',
        refetchOnReconnect: true,
        throwOnError: belongsInErrorBoundary,
      },
      mutations: { networkMode: 'always', throwOnError: belongsInErrorBoundary },
    },
  });
}
