import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

export const HOME_SCREEN_KEY = ['home'];

export function useHomeScreen() {
  return useQuery({
    queryKey: HOME_SCREEN_KEY,
    queryFn: ({ signal }) => api.get('/home', { signal }),
  });
}
