import type { components } from '@astra/contracts';
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

// Each search keeps its own cached list, so the lists are dropped rather than all fetched again.
export function refreshSessionViews(queryClient: QueryClient) {
  queryClient.removeQueries({ queryKey: SESSION_LIST_KEY });
  return Promise.all([
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
    onSuccess: (session) => queryClient.setQueryData(getSessionKey(sessionId), session),
  });
}
