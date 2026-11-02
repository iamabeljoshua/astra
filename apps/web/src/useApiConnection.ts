import type { HealthResponse } from '@astra/contracts';
import { useEffect, useState } from 'react';

export type ApiConnection = 'checking' | 'connected' | 'notConnected';

const HEALTH_CHECK_TIMEOUT_MS = 3000;
const HEALTH_CHECK_RETRY_DELAY_MS = 2000;

async function fetchApiConnection(unmountSignal: AbortSignal): Promise<ApiConnection> {
  const timeoutController = new AbortController();
  const timeoutTimer = setTimeout(() => timeoutController.abort(), HEALTH_CHECK_TIMEOUT_MS);
  try {
    const response = await fetch('/api/health', {
      signal: AbortSignal.any([unmountSignal, timeoutController.signal]),
    });
    const health = (await response.json()) as HealthResponse;
    return health.status === 'ok' ? 'connected' : 'notConnected';
  } catch {
    return 'notConnected';
  } finally {
    clearTimeout(timeoutTimer);
  }
}

export function useApiConnection(): ApiConnection {
  const [apiConnection, setApiConnection] = useState<ApiConnection>('checking');

  useEffect(() => {
    const unmountController = new AbortController();
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    async function checkUntilConnected() {
      const connection = await fetchApiConnection(unmountController.signal);
      if (unmountController.signal.aborted) return;
      setApiConnection(connection);
      if (connection !== 'connected') {
        retryTimer = setTimeout(() => void checkUntilConnected(), HEALTH_CHECK_RETRY_DELAY_MS);
      }
    }

    void checkUntilConnected();
    return () => {
      unmountController.abort();
      clearTimeout(retryTimer);
    };
  }, []);

  return apiConnection;
}
