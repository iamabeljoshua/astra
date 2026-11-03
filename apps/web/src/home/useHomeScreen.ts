import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

export function useHomeScreen() {
  return useQuery({
    queryKey: ['home'],
    queryFn: ({ signal }) => api.get('/home', { signal }),
  });
}
