import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

const HOME_SCREEN_TIMEOUT_MS = 4_000;

export function useHomeScreen() {
  return useQuery({
    queryKey: ['home'],
    queryFn: ({ signal }) => api.get('/home', { signal, timeoutMs: HOME_SCREEN_TIMEOUT_MS }),
  });
}
