import type { HealthResponse } from '@astra/contracts';
import { useEffect, useState } from 'react';

export type ApiConnection = 'checking' | 'connected' | 'notConnected';

async function fetchApiConnection(): Promise<ApiConnection> {
  try {
    const response = await fetch('/api/health');
    const health = (await response.json()) as HealthResponse;
    return health.status === 'ok' ? 'connected' : 'notConnected';
  } catch {
    return 'notConnected';
  }
}

export function useApiConnection(): ApiConnection {
  const [apiConnection, setApiConnection] = useState<ApiConnection>('checking');

  useEffect(() => {
    void fetchApiConnection().then(setApiConnection);
  }, []);

  return apiConnection;
}
