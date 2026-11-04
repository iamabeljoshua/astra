import type { components } from '@astra/contracts';
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from '../api/client';
import { HOME_SCREEN_KEY } from '../home/useHomeScreen';

export type Session = components['schemas']['SessionResponseDto'];
export type NewSession = components['schemas']['CreateSessionBodyDto'];
type SessionUpdate = components['schemas']['UpdateSessionBodyDto'];

export const RECENT_SESSIONS_KEY = ['sessions', 'recent'];
export const SESSION_LIST_KEY = ['sessions', 'list'];

function getSessionKey(sessionId: string) {
  return ['sessions', 'one', sessionId];
}

// Each search keeps its own cached list, so only the list on screen is fetched again, and the rest are dropped.
export function refreshSessionViews(queryClient: QueryClient) {
  queryClient.removeQueries({ queryKey: SESSION_LIST_KEY, type: 'inactive' });
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: SESSION_LIST_KEY }),
    queryClient.invalidateQueries({ queryKey: HOME_SCREEN_KEY, refetchType: 'all' }),
    queryClient.invalidateQueries({ queryKey: RECENT_SESSIONS_KEY, refetchType: 'all' }),
  ]);
}

export function useSession(sessionId: string) {
  return useQuery({
    queryKey: getSessionKey(sessionId),
    queryFn: ({ signal }) => api.get('/sessions/{id}', { signal, params: { path: { id: sessionId } } }),
  });
}

// The API already holds a title the tutor changed, so this only keeps the page's copy from going stale.
export function useKeepSessionTitle(sessionId: string, title: string | null) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (title === null) return;
    queryClient.setQueryData<Session>(getSessionKey(sessionId), (cached) => cached && { ...cached, title });
  }, [queryClient, sessionId, title]);
}

export function useCreateSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (newSession: NewSession) => api.post('/sessions', { body: newSession }),
    onSuccess: (session) => {
      queryClient.setQueryData(getSessionKey(session.id), session);
      void refreshSessionViews(queryClient);
    },
  });
}

export function useUpdateSession(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (update: SessionUpdate) => api.patch('/sessions/{id}', { params: { path: { id: sessionId } }, body: update }),
    // A finished session does not change again, so a save answered after the end cannot bring it back.
    onSuccess: (session) =>
      queryClient.setQueryData<Session>(getSessionKey(sessionId), (cached) => (cached?.status === 'finished' ? cached : session)),
  });
}
