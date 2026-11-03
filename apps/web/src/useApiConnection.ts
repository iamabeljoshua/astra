import { type QueryFunctionContext, useQuery } from '@tanstack/react-query';
import { api } from './api/client';

export type ApiConnection = 'checking' | 'connected' | 'notConnected';

export const HEALTH_CHECK_TIMEOUT_MS = 3000;
export const HEALTH_CHECK_RETRY_DELAY_MS = 2000;
const FORGET_WHEN_HOME_CLOSES = 0;

// A failed check is an answer here, not an error, so the line keeps it while the next check runs.
async function fetchApiConnection({ signal }: QueryFunctionContext): Promise<ApiConnection> {
  try {
    const health = await api.get('/health', { signal, timeoutMs: HEALTH_CHECK_TIMEOUT_MS });
    return health.status === 'ok' ? 'connected' : 'notConnected';
  } catch {
    return 'notConnected';
  }
}

export function useApiConnection(): ApiConnection {
  const { data: apiConnection = 'checking' } = useQuery({
    queryKey: ['apiConnection'],
    queryFn: fetchApiConnection,
    gcTime: FORGET_WHEN_HOME_CLOSES,
    staleTime: Infinity,
    refetchInterval: (query) => (query.state.data === 'connected' ? false : HEALTH_CHECK_RETRY_DELAY_MS),
    refetchIntervalInBackground: true,
  });

  return apiConnection;
}
