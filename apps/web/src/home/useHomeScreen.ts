import { queryOptions, useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

export const HOME_SCREEN_KEY = ['home'];

export const HOME_SCREEN_QUERY = queryOptions({
  queryKey: HOME_SCREEN_KEY,
  queryFn: ({ signal }) => api.get('/home', { signal }),
});

export function useHomeScreen() {
  return useQuery(HOME_SCREEN_QUERY);
}
