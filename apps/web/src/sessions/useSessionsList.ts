import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { RECENT_SESSIONS_KEY, SESSION_LIST_KEY } from '../session/sessionQueries';

const SESSIONS_PER_PAGE = 50;
const RECENT_SESSION_COUNT = 6;

export function useSessionsList(search: string) {
  return useInfiniteQuery({
    queryKey: [...SESSION_LIST_KEY, search],
    queryFn: ({ signal, pageParam }) =>
      api.get('/sessions', {
        signal,
        params: { query: { limit: SESSIONS_PER_PAGE, offset: pageParam, search: search || undefined } },
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => (lastPage.length === SESSIONS_PER_PAGE ? allPages.flat().length : undefined),
    placeholderData: keepPreviousData,
    select: (data) => data.pages.flat(),
  });
}

export function useRecentSessions() {
  return useQuery({
    queryKey: RECENT_SESSIONS_KEY,
    queryFn: ({ signal }) => api.get('/sessions', { signal, params: { query: { limit: RECENT_SESSION_COUNT } } }),
  });
}
